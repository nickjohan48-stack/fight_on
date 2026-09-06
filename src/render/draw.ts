/* ============================================================
   NEONCLASH — canvas renderer: fighters, arenas, FX
   Fighters are drawn procedurally from a pose model so sprite
   sheets can replace drawFighter() later without touching the
   engine or UI.
   ============================================================ */
import { ARENAS, ArenaId, ATTACKS, C, FighterConfig, GameEvent, STYLES } from "../game/defs";
import { Engine, Fighter } from "../game/engine";

const TAU = Math.PI * 2;
const rnd = (seed: number) => {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h: string, f: number): string {
  const [r, g, b] = hexRgb(h).map((c) => Math.max(0, Math.min(255, Math.round(c * f))));
  return `rgb(${r},${g},${b})`;
}
function alpha(h: string, a: number): string {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ---------------------------------------------------------- */
/*  FIGHTER POSE MODEL                                         */
/* ---------------------------------------------------------- */
interface Pose {
  crouch: number; lean: number;
  handF: [number, number]; handB: [number, number];
  footF: [number, number]; footB: [number, number];
  bendF: number; bendB: number; kneeF: number; kneeB: number;
  headD: [number, number];
}
const P = (o: Partial<Pose>): Pose => ({
  crouch: 0, lean: 0, handF: [26, 4], handB: [12, 14],
  footF: [13, 0], footB: [-13, 0], bendF: -0.35, bendB: -0.35,
  kneeF: 0.25, kneeB: 0.25, headD: [0, 0], ...o,
});

function getPose(f: Fighter, time: number): Pose {
  const { act, t } = f;
  const spd = f.st.speedMul;
  switch (act) {
    case "walk": {
      const ph = t * 9 * spd;
      const sw = Math.sin(ph);
      return P({
        footF: [13 + sw * 17, -Math.max(0, Math.cos(ph)) * 12],
        footB: [-13 - sw * 17, -Math.max(0, -Math.cos(ph)) * 12],
        handF: [26 - sw * 8, 4], handB: [12 + sw * 8, 14],
        lean: 0.06, crouch: 0.05 + Math.abs(Math.cos(ph)) * 0.04,
        kneeF: 0.35, kneeB: 0.35,
      });
    }
    case "jump":
      return P({ footF: [10, -26], footB: [-12, -16], kneeF: 0.9, kneeB: 0.8, handF: [24, -8], handB: [6, -2], crouch: 0.08, lean: 0.1 });
    case "fall":
      return P({ footF: [14, -14], footB: [-14, -22], kneeF: 0.6, kneeB: 0.9, handF: [28, -4], handB: [2, 16], lean: 0.04 });
    case "dash":
      return P({ lean: 0.5, crouch: 0.3, footF: [20, -8], footB: [-26, -2], kneeF: 0.7, kneeB: 0.3, handF: [30, 8], handB: [-8, 10], headD: [4, 2] });
    case "light": {
      const d = ATTACKS.light, ts = t * spd;
      if (ts < d.startup) { const k = ts / d.startup; return P({ handF: [lerp(26, 6, k), lerp(4, -2, k)], lean: -0.04 * k, handB: [10, 12] }); }
      if (ts < d.startup + d.active) return P({ handF: [52, 0], lean: 0.14, handB: [-4, 12], footF: [20, 0], bendF: -0.06, headD: [3, 0] });
      const k = easeOut(clamp01((ts - d.startup - d.active) / d.recover));
      return P({ handF: [lerp(52, 26, k), lerp(0, 4, k)], lean: lerp(0.14, 0, k), handB: [12, 14] });
    }
    case "heavy": {
      const d = ATTACKS.heavy, ts = t * spd;
      if (ts < d.startup) {
        const k = easeOut(ts / d.startup);
        return P({ handF: [lerp(26, -16, k), lerp(4, -10, k)], handB: [lerp(12, -20, k), 8], lean: -0.22 * k, crouch: 0.18 * k, headD: [-4 * k, 0] });
      }
      if (ts < d.startup + d.active) return P({ handF: [58, -4], handB: [16, 10], lean: 0.3, crouch: 0.1, footF: [24, 0], bendF: -0.04, headD: [6, 1] });
      const k = easeOut(clamp01((ts - d.startup - d.active) / d.recover));
      return P({ handF: [lerp(58, 26, k), -4], lean: lerp(0.3, 0, k), crouch: 0.1 * (1 - k), handB: [12, 14] });
    }
    case "special": {
      const d = ATTACKS.special, ts = t * spd;
      if (ts < d.startup) { const k = ts / d.startup; return P({ handF: [lerp(26, 8, k), 0], handB: [lerp(12, 6, k), 2], crouch: 0.24 * k, lean: -0.1 * k }); }
      if (ts < d.startup + d.active) return P({ handF: [54, -2], handB: [44, 6], lean: 0.42, crouch: 0.18, footF: [26, -4], footB: [-24, -2], kneeF: 0.6, headD: [6, 2] });
      const k = easeOut(clamp01((ts - d.startup - d.active) / d.recover));
      return P({ handF: [lerp(54, 26, k), 0], handB: [lerp(44, 12, k), 10], lean: lerp(0.42, 0, k) });
    }
    case "block":
      return P({ handF: [17, -10], handB: [20, 2], crouch: 0.16, lean: -0.06, footF: [16, 0], footB: [-16, 0], kneeF: 0.4, kneeB: 0.4, headD: [-2, 2] });
    case "hit": {
      const k = Math.min(1, t * 7);
      return P({ lean: -0.34 * k, handF: [-4 - 8 * k, -16 * k], handB: [-16 * k, 4], headD: [-9 * k, -3 * k], footF: [18, 0], crouch: 0.1 * k, kneeF: 0.5 });
    }
    case "win":
      return P({ handF: [16, -46 - Math.sin(time * 5) * 4], handB: [10, 16], lean: -0.04, headD: [0, -2] });
    case "ko":
      return P({});
    default: {
      const bob = Math.sin(time * 3.2 + f.slot * 2) * 2.2;
      return P({ handF: [26, 4 + bob * 0.4], handB: [12, 14 + bob * 0.4], crouch: 0.03, footF: [13, 0], footB: [-13, 0], headD: [0, bob * 0.15] });
    }
  }
}

/* ---------------------------------------------------------- */
/*  FIGHTER DRAW                                               */
/* ---------------------------------------------------------- */
function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, bend: number, w: number, color: string) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (x1 + x2) / 2 + (-dy / len) * bend * len * 0.5;
  const my = (y1 + y2) / 2 + (dx / len) * bend * len * 0.5;
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
  return { mx, my };
}

export interface DrawFighterLike {
  x: number; y: number; face: number; act: string; t: number;
  flashT: number; slot: number; cfg: FighterConfig; scale: number; bulk: number;
  st: { aura: string; speedMul: number };
}

export function drawFighter(ctx: CanvasRenderingContext2D, f: DrawFighterLike, time: number, floorY: number) {
  const cfg = f.cfg;
  const pose = getPose(f as unknown as Fighter, time);
  const s = f.scale;
  const aura = f.st.aura;
  const outfit = cfg.outfit, trim = cfg.outfitTrim, skin = cfg.skin, glove = cfg.glove, shoe = cfg.shoe;
  const bulk = f.bulk;

  ctx.save();
  ctx.translate(f.x, floorY + f.y);

  // shadow + aura pool
  const shW = 46 * s * (f.act === "ko" ? 1.5 : 1);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.ellipse(0, 4, shW, 10 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = alpha(aura, 0.10 + (f.act === "special" ? 0.22 : 0));
  ctx.beginPath(); ctx.ellipse(0, 4, shW * 1.25, 13 * s, 0, 0, TAU); ctx.fill();

  if (f.act === "ko") {
    // lying down
    ctx.rotate(f.face * -Math.PI / 2 * Math.min(1, f.t * 3));
    ctx.translate(0, -8);
  }
  ctx.scale(f.face * s, s);

  const legLen = 56, torsoLen = 50;
  const hipY = -(legLen * (1 - pose.crouch * 0.5)) - 4;
  const leanX = pose.lean * 26;
  const shX = leanX, shY = hipY - torsoLen * (1 - pose.crouch * 0.35);
  const outfitDark = shade(outfit, 0.66);

  // ---- back arm
  limb(ctx, shX - 2, shY + 6, shX + pose.handB[0], shY + pose.handB[1], pose.bendB, 11 * bulk, outfitDark);
  ctx.fillStyle = shade(glove, 0.75);
  ctx.beginPath(); ctx.arc(shX + pose.handB[0], shY + pose.handB[1], 8.5 * bulk, 0, TAU); ctx.fill();

  // ---- back leg
  limb(ctx, -4, hipY, pose.footB[0], pose.footB[1] - 6, pose.kneeB, 13 * bulk, shade(outfit, 0.55));
  ctx.fillStyle = shade(shoe, 0.72);
  roundFoot(ctx, pose.footB[0], pose.footB[1], shoe, 0.72);

  // ---- torso
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(pose.lean * 0.5);
  const tw = 17 * bulk;
  const grad = ctx.createLinearGradient(0, -torsoLen, 0, 6);
  grad.addColorStop(0, shade(outfit, 1.18));
  grad.addColorStop(1, outfit);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-tw * 0.82, 4); ctx.lineTo(-tw, -torsoLen * 0.82);
  ctx.quadraticCurveTo(-tw * 1.08, -torsoLen, -tw * 0.5, -torsoLen);
  ctx.lineTo(tw * 0.62, -torsoLen);
  ctx.quadraticCurveTo(tw * 1.15, -torsoLen, tw * 1.05, -torsoLen * 0.78);
  ctx.lineTo(tw * 0.95, 4);
  ctx.quadraticCurveTo(0, 12, -tw * 0.82, 4);
  ctx.fill();
  // chest trim + belt
  ctx.fillStyle = trim;
  ctx.fillRect(-tw * 0.75, -torsoLen * 0.62, tw * 1.6, 3);
  ctx.fillStyle = shade(trim, 0.8);
  ctx.fillRect(-tw * 0.85, -4, tw * 1.85, 5);
  ctx.restore();

  // ---- head
  const headR = 15;
  const hx = shX + pose.headD[0] + 4, hy = shY - headR - 3 + pose.headD[1];
  // neck
  ctx.strokeStyle = shade(skin, 0.85); ctx.lineWidth = 8 * bulk;
  ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(hx - 2, hy + headR * 0.7); ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(hx, hy, headR, 0, TAU); ctx.fill();
  // jaw shade
  ctx.fillStyle = alpha("#000000", 0.14);
  ctx.beginPath(); ctx.arc(hx - 3, hy + 3, headR * 0.92, Math.PI * 0.15, Math.PI * 0.85); ctx.fill();

  drawHair(ctx, hx, hy, headR, cfg, time, f.act === "ko");
  // face
  if (f.act === "ko") {
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
    for (const ex of [hx + 5, hx + 11]) {
      ctx.beginPath(); ctx.moveTo(ex - 2.6, hy - 4); ctx.lineTo(ex + 2.6, hy + 1);
      ctx.moveTo(ex + 2.6, hy - 4); ctx.lineTo(ex - 2.6, hy + 1); ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#f4f7ff";
    ctx.fillRect(hx + 3, hy - 5, 6, 4.4);
    ctx.fillRect(hx + 10, hy - 5, 4.6, 4.4);
    ctx.fillStyle = cfg.eyeColor;
    ctx.fillRect(hx + 6.2, hy - 4.6, 2.6, 3.4);
    ctx.fillRect(hx + 12, hy - 4.6, 2.2, 3.4);
    ctx.fillStyle = alpha("#000000", 0.35);
    ctx.fillRect(hx + 4, hy + 6, 8, 2);
  }
  drawAccessory(ctx, hx, hy, headR, cfg, time, shX, shY);

  // ---- front leg
  limb(ctx, 6, hipY, pose.footF[0], pose.footF[1] - 6, pose.kneeF, 14 * bulk, outfit);
  roundFoot(ctx, pose.footF[0], pose.footF[1], shoe, 1);

  // ---- front arm
  const armC = shade(outfit, 1.12);
  limb(ctx, shX + 4, shY + 5, shX + pose.handF[0], shY + pose.handF[1], pose.bendF, 12 * bulk, armC);
  ctx.fillStyle = glove;
  ctx.beginPath(); ctx.arc(shX + pose.handF[0], shY + pose.handF[1], 10 * bulk, 0, TAU); ctx.fill();
  ctx.fillStyle = alpha("#ffffff", 0.25);
  ctx.beginPath(); ctx.arc(shX + pose.handF[0] - 2.5, shY + pose.handF[1] - 3, 4 * bulk, 0, TAU); ctx.fill();

  // attack arc flash
  if ((f.act === "light" || f.act === "heavy" || f.act === "special")) {
    const d = ATTACKS[f.act as "light"];
    const ts = f.t * f.st.speedMul;
    if (ts >= d.startup && ts < d.startup + d.active) {
      const k = (ts - d.startup) / d.active;
      ctx.strokeStyle = alpha(f.act === "heavy" ? "#ff5a3c" : f.act === "special" ? aura : "#ffffff", 0.75 * (1 - k));
      ctx.lineWidth = f.act === "light" ? 5 : 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      const r0 = f.act === "light" ? 40 : 52;
      ctx.arc(shX + 8, shY + 6, r0, -Math.PI * 0.42 + k * 0.4, Math.PI * 0.18 + k * 0.4);
      ctx.stroke();
    }
  }
  ctx.restore();

  // hit flash overlay (world space)
  if (f.flashT > 0) {
    ctx.save();
    ctx.translate(f.x, floorY + f.y);
    ctx.globalAlpha = Math.min(1, f.flashT * 9);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, -70 * s, 34 * s, 74 * s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function roundFoot(ctx: CanvasRenderingContext2D, x: number, y: number, shoe: string, f: number) {
  ctx.fillStyle = shade(shoe, f);
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 14, y - 6);
  ctx.quadraticCurveTo(x + 18, y, x + 12, y + 1);
  ctx.lineTo(x - 8, y + 1); ctx.closePath(); ctx.fill();
}

function drawHair(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, cfg: FighterConfig, time: number, ko: boolean) {
  const c = cfg.hairColor;
  ctx.fillStyle = c;
  switch (cfg.hair) {
    case "buzz":
      ctx.beginPath(); ctx.arc(hx, hy, r + 1, Math.PI * 0.95, Math.PI * 2.02); ctx.fill(); break;
    case "mohawk":
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const bx = hx - r * 0.7 + i * r * 0.42;
        ctx.moveTo(bx, hy - r * 0.5);
        ctx.lineTo(bx + 4, hy - r - 12 - (i % 2) * 4);
        ctx.lineTo(bx + 9, hy - r * 0.45);
      }
      ctx.fill(); break;
    case "spike":
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.02 + i * 0.16);
        const bx = hx + Math.cos(a) * r * 0.72, by = hy + Math.sin(a) * r * 0.72;
        ctx.moveTo(bx, by);
        ctx.lineTo(hx + Math.cos(a) * (r + 13), hy + Math.sin(a) * (r + 13));
        ctx.lineTo(hx + Math.cos(a + 0.28) * r * 0.8, hy + Math.sin(a + 0.28) * r * 0.8);
      }
      ctx.fill(); break;
    case "long": {
      ctx.beginPath(); ctx.arc(hx, hy, r + 2, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
      const sway = ko ? 0 : Math.sin(time * 6) * 3;
      ctx.beginPath();
      ctx.moveTo(hx - r, hy - 4);
      ctx.quadraticCurveTo(hx - r - 9 + sway, hy + r + 8, hx - r - 2 + sway, hy + r + 22);
      ctx.lineTo(hx - r + 9, hy + r + 10);
      ctx.quadraticCurveTo(hx - r + 2, hy + 6, hx - r + 4, hy - 2);
      ctx.fill(); break;
    }
    case "bun":
      ctx.beginPath(); ctx.arc(hx, hy, r + 1, Math.PI * 0.9, Math.PI * 2.05); ctx.fill();
      ctx.beginPath(); ctx.arc(hx - r * 0.5, hy - r - 4, 7, 0, TAU); ctx.fill(); break;
    default: break;
  }
}

function drawAccessory(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, cfg: FighterConfig, time: number, shX: number, shY: number) {
  const trim = cfg.outfitTrim;
  if (cfg.accessory === "visor") {
    ctx.fillStyle = alpha(trim, 0.92);
    ctx.fillRect(hx - r * 0.4, hy - 7, r * 1.55, 6);
    ctx.fillStyle = alpha("#ffffff", 0.55);
    ctx.fillRect(hx + 2, hy - 6, 10, 2);
  } else if (cfg.accessory === "band") {
    ctx.fillStyle = trim;
    ctx.fillRect(hx - r, hy - r * 0.72, r * 2.05, 5);
    ctx.beginPath();
    ctx.moveTo(hx - r, hy - r * 0.6);
    ctx.quadraticCurveTo(hx - r - 12, hy - r * 0.3 + Math.sin(time * 7) * 3, hx - r - 18, hy + 4 + Math.sin(time * 7 + 1) * 3);
    ctx.lineWidth = 4; ctx.strokeStyle = trim; ctx.lineCap = "round"; ctx.stroke();
  } else if (cfg.accessory === "scarf") {
    ctx.strokeStyle = trim; ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 7 - i * 1.6;
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy + r - 2);
      const ph = time * 6 + i;
      ctx.quadraticCurveTo(hx - 16 - i * 6, hy + r + 8 + Math.sin(ph) * 4, hx - 24 - i * 9, hy + r + 2 + Math.sin(ph + 1) * 6);
      ctx.stroke();
    }
  }
}

/* ---------------------------------------------------------- */
/*  ARENAS                                                     */
/* ---------------------------------------------------------- */
function windows(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color: string, density: number) {
  ctx.fillStyle = color;
  const cw = 12, ch = 10;
  for (let wy = y + 8; wy < y + h - 12; wy += ch + 6)
    for (let wx = x + 6; wx < x + w - 10; wx += cw + 6)
      if (rnd(seed + wx * 0.13 + wy * 0.71) < density)
        ctx.fillRect(wx, wy, cw * 0.6, ch * 0.6);
}

export function drawArena(ctx: CanvasRenderingContext2D, id: ArenaId, time: number) {
  const W = C.W, H = C.H, F = C.FLOOR;
  const arena = ARENAS.find((a) => a.id === id)!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, arena.sky[0]); g.addColorStop(1, arena.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  if (id === "neon") {
    // far skyline
    for (let i = 0; i < 14; i++) {
      const bw = 70 + rnd(i) * 90, bh = 140 + rnd(i + 40) * 240, bx = i * 95 - 20;
      ctx.fillStyle = "#0a1128";
      ctx.fillRect(bx, F - bh - 60, bw, bh + 60);
      windows(ctx, bx, F - bh - 60, bw, bh, i * 7, "rgba(120,160,255,0.22)", 0.3);
    }
    // mid towers with neon
    for (let i = 0; i < 7; i++) {
      const bw = 120 + rnd(i + 9) * 100, bh = 220 + rnd(i + 77) * 260, bx = i * 190 - 40 + Math.sin(i * 3) * 30;
      ctx.fillStyle = "#0e1836";
      ctx.fillRect(bx, F - bh - 20, bw, bh + 20);
      windows(ctx, bx, F - bh - 20, bw, bh, i * 13, "rgba(160,200,255,0.3)", 0.35);
      const nc = ["#25e0ff", "#ff2e63", "#ffc94d"][i % 3];
      ctx.fillStyle = alpha(nc, 0.75 + Math.sin(time * 3 + i * 2) * 0.2);
      ctx.fillRect(bx + 8, F - bh - 6, bw - 16, 5);
      ctx.fillStyle = alpha(nc, 0.5);
      ctx.fillRect(bx + bw * 0.2, F - bh + 24, bw * 0.6, 34);
      ctx.fillStyle = "#0a0f24";
      for (let sgi = 0; sgi < 3; sgi++) ctx.fillRect(bx + bw * 0.26, F - bh + 30 + sgi * 10, bw * 0.48, 5);
    }
    // holo flicker panel
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(time * 9) * 0.1 + (rnd(Math.floor(time * 6)) > 0.85 ? -0.25 : 0);
    const hg = ctx.createLinearGradient(0, 90, 0, 260);
    hg.addColorStop(0, "rgba(37,224,255,0.16)"); hg.addColorStop(1, "rgba(37,224,255,0.02)");
    ctx.fillStyle = hg; ctx.fillRect(880, 90, 240, 170);
    ctx.strokeStyle = "rgba(37,224,255,0.5)"; ctx.strokeRect(880, 90, 240, 170);
    ctx.fillStyle = "rgba(37,224,255,0.7)";
    ctx.font = "700 30px 'Russo One'"; ctx.fillText("NEONCLASH", 902, 150);
    ctx.font = "500 15px 'Chakra Petch'"; ctx.fillText("SEASON 03 // RANKED", 902, 178);
    ctx.restore();
    // fog
    const fog = ctx.createLinearGradient(0, F - 150, 0, F);
    fog.addColorStop(0, "rgba(20,40,90,0)"); fog.addColorStop(1, "rgba(30,60,130,0.28)");
    ctx.fillStyle = fog; ctx.fillRect(0, F - 150, W, 150);
    // wet floor
    const fg = ctx.createLinearGradient(0, F, 0, H);
    fg.addColorStop(0, "#131b36"); fg.addColorStop(1, "#060913");
    ctx.fillStyle = fg; ctx.fillRect(0, F, W, H - F);
    ctx.fillStyle = "rgba(37,224,255,0.08)";
    for (let i = 0; i < 9; i++) {
      const rx = 60 + i * 140 + Math.sin(i * 5) * 30;
      ctx.fillRect(rx, F, 26 + rnd(i) * 40, H - F);
    }
    ctx.fillStyle = "rgba(255,46,99,0.06)";
    for (let i = 0; i < 6; i++) ctx.fillRect(120 + i * 210, F, 40, H - F);
    ctx.fillStyle = "rgba(120,180,255,0.25)"; ctx.fillRect(0, F, W, 2);
    // rain
    ctx.strokeStyle = "rgba(150,200,255,0.20)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const rx = ((i * 97 + time * 760) % (W + 120)) - 60;
      const ry = ((i * 61 + time * 1250) % (H + 60)) - 30;
      ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 22);
    }
    ctx.stroke();
  }

  if (id === "dojo") {
    // paper wall + beams
    ctx.fillStyle = "#241017"; ctx.fillRect(0, 0, W, F);
    const cg = ctx.createLinearGradient(0, 0, 0, F);
    cg.addColorStop(0, "rgba(70,20,32,0.4)"); cg.addColorStop(1, "rgba(30,10,16,0.1)");
    ctx.fillStyle = cg; ctx.fillRect(0, 0, W, F);
    // big moon window
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, 250, 170, 0, TAU); ctx.clip();
    const mg = ctx.createRadialGradient(W / 2, 250, 20, W / 2, 250, 170);
    mg.addColorStop(0, "#ff6a5a"); mg.addColorStop(0.55, "#c2273b"); mg.addColorStop(1, "#3d1620");
    ctx.fillStyle = mg; ctx.fillRect(W / 2 - 170, 80, 340, 340);
    ctx.strokeStyle = "rgba(20,8,10,0.8)"; ctx.lineWidth = 6;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(W / 2 - 170 + i * 85, 80); ctx.lineTo(W / 2 - 170 + i * 85, 420); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 - 170, 80 + i * 85); ctx.lineTo(W / 2 + 170, 80 + i * 85); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#1a0b10"; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(W / 2, 250, 176, 0, TAU); ctx.stroke();
    // pillars
    for (const px of [70, 330, 950, 1210]) {
      ctx.fillStyle = "#2e1410"; ctx.fillRect(px - 16, 60, 32, F - 60);
      ctx.fillStyle = "rgba(255,120,80,0.12)"; ctx.fillRect(px + 8, 60, 6, F - 60);
    }
    // lanterns
    for (let i = 0; i < 5; i++) {
      const lx = 160 + i * 240, sway = Math.sin(time * 1.4 + i * 2) * 8, ly = 120;
      ctx.strokeStyle = "#12080a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lx, 40); ctx.lineTo(lx + sway, ly - 26); ctx.stroke();
      ctx.save(); ctx.translate(lx + sway, ly);
      const lg = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
      lg.addColorStop(0, "rgba(255,150,80,0.95)"); lg.addColorStop(1, "rgba(255,110,60,0)");
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.fill();
      ctx.fillStyle = "#e8683c";
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 21, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#3a1410";
      ctx.fillRect(-15, -24, 30, 5); ctx.fillRect(-15, 19, 30, 5);
      ctx.restore();
    }
    // wood floor
    const wg = ctx.createLinearGradient(0, F, 0, H);
    wg.addColorStop(0, "#4a2418"); wg.addColorStop(1, "#1d0d08");
    ctx.fillStyle = wg; ctx.fillRect(0, F, W, H - F);
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, F + 8 + i * 14); ctx.lineTo(W, F + 8 + i * 14); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,120,70,0.14)"; ctx.fillRect(0, F, W, 3);
    // petals
    ctx.fillStyle = "rgba(255,140,150,0.5)";
    for (let i = 0; i < 22; i++) {
      const px = (i * 173 + time * (46 + (i % 3) * 26)) % (W + 40) - 20;
      const py = (i * 97 + time * 74) % (H + 20) - 10;
      ctx.save(); ctx.translate(px, py); ctx.rotate(time * 2 + i);
      ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2.2, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  if (id === "under") {
    // brick darkness
    ctx.fillStyle = "#150d0f"; ctx.fillRect(0, 0, W, F);
    for (let by = 0; by < F; by += 26) {
      ctx.fillStyle = `rgba(255,255,255,${0.015 + rnd(by) * 0.01})`;
      for (let bx = (by / 26) % 2 === 0 ? 0 : -30; bx < W; bx += 62) ctx.fillRect(bx, by, 58, 22);
    }
    // crowd silhouette
    ctx.fillStyle = "#0b0608";
    for (let i = 0; i < 46; i++) {
      const cx2 = i * 30 - 10 + rnd(i) * 14, ch2 = 26 + rnd(i + 3) * 20;
      const bob = Math.sin(time * (3 + rnd(i) * 3) + i) * 3;
      ctx.beginPath(); ctx.arc(cx2, F - 92 + bob, ch2 * 0.5, Math.PI, 0); ctx.fill();
      ctx.fillRect(cx2 - ch2 * 0.5, F - 92 + bob, ch2, 92);
    }
    // cage fence
    ctx.strokeStyle = "rgba(180,160,150,0.14)"; ctx.lineWidth = 2;
    for (let i = 0; i < 30; i++) { const fx = i * 46; ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, F - 70); ctx.stroke(); }
    for (let fy = 20; fy < F - 70; fy += 40) { ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke(); }
    // chains
    ctx.strokeStyle = "rgba(200,190,180,0.3)"; ctx.lineWidth = 5;
    for (const cxp of [200, 1050]) {
      const sway = Math.sin(time * 0.9 + cxp) * 10;
      ctx.beginPath(); ctx.moveTo(cxp, 0);
      for (let cy = 0; cy < 240; cy += 16) ctx.lineTo(cxp + sway * (cy / 240), cy);
      ctx.stroke();
      ctx.fillStyle = "#2a2226"; ctx.beginPath(); ctx.arc(cxp + sway, 250, 14, 0, TAU); ctx.fill();
    }
    // spotlight
    ctx.save();
    const sa = Math.sin(time * 0.7) * 0.16;
    const sg = ctx.createLinearGradient(W / 2, 0, W / 2, F);
    sg.addColorStop(0, "rgba(255,220,160,0.30)"); sg.addColorStop(1, "rgba(255,220,160,0.02)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 30, 0); ctx.lineTo(W / 2 + 30, 0);
    ctx.lineTo(W / 2 + 260 + sa * 300, F); ctx.lineTo(W / 2 - 260 + sa * 300, F);
    ctx.fill(); ctx.restore();
    // concrete floor
    const ug = ctx.createLinearGradient(0, F, 0, H);
    ug.addColorStop(0, "#33222a"); ug.addColorStop(1, "#0d0709");
    ctx.fillStyle = ug; ctx.fillRect(0, F, W, H - F);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(rnd(i + 30) * W, F); ctx.lineTo(rnd(i + 60) * W, H); ctx.lineWidth = 2; ctx.stroke(); }
    // fight circle paint
    ctx.strokeStyle = "rgba(255,46,99,0.5)"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(W / 2, F + 46, 330, 40, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(255,46,99,0.18)";
    ctx.beginPath(); ctx.ellipse(W / 2, F + 46, 380, 47, 0, 0, TAU); ctx.stroke();
    // rising dust
    ctx.fillStyle = "rgba(255,190,140,0.22)";
    for (let i = 0; i < 30; i++) {
      const dx = (i * 211) % W, dy = H - ((i * 149 + time * 34) % (H - 100));
      ctx.fillRect(dx, dy, 2, 2);
    }
  }

  if (id === "roof") {
    // stars
    for (let i = 0; i < 70; i++) {
      const sx = rnd(i) * W, sy = rnd(i + 5) * F * 0.75;
      ctx.fillStyle = `rgba(220,235,255,${0.15 + rnd(i + 9) * 0.5 * (0.6 + Math.sin(time * 2 + i) * 0.4)})`;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    // moon
    const moonG = ctx.createRadialGradient(1040, 120, 10, 1040, 120, 120);
    moonG.addColorStop(0, "rgba(230,240,255,0.95)"); moonG.addColorStop(0.32, "rgba(200,220,255,0.5)"); moonG.addColorStop(1, "rgba(180,200,255,0)");
    ctx.fillStyle = moonG; ctx.beginPath(); ctx.arc(1040, 120, 120, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e8f0ff"; ctx.beginPath(); ctx.arc(1040, 120, 42, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(160,180,220,0.5)";
    ctx.beginPath(); ctx.arc(1028, 108, 8, 0, TAU); ctx.arc(1052, 132, 5, 0, TAU); ctx.fill();
    // far city
    for (let i = 0; i < 18; i++) {
      const bw = 60 + rnd(i + 2) * 80, bh = 120 + rnd(i + 33) * 260, bx = i * 76 - 30;
      ctx.fillStyle = "#0a1226"; ctx.fillRect(bx, F - bh + 60, bw, bh);
      windows(ctx, bx, F - bh + 60, bw, bh - 60, i * 3, "rgba(255,210,120,0.25)", 0.22);
    }
    // near towers + crane
    ctx.fillStyle = "#0d1730";
    ctx.fillRect(-30, F - 330, 150, 340); ctx.fillRect(1160, F - 380, 160, 400);
    windows(ctx, -30, F - 330, 150, 330, 77, "rgba(140,190,255,0.3)", 0.3);
    windows(ctx, 1160, F - 380, 160, 380, 91, "rgba(255,190,120,0.25)", 0.28);
    ctx.strokeStyle = "#0d1730"; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(230, F); ctx.lineTo(230, 130); ctx.lineTo(470, 130); ctx.moveTo(230, 130); ctx.lineTo(170, 190); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(430, 130); ctx.lineTo(430, 260 + Math.sin(time * 1.2) * 6); ctx.stroke();
    ctx.fillStyle = "#16223f"; ctx.fillRect(420, 260 + Math.sin(time * 1.2) * 6, 20, 16);
    // blinking antenna
    ctx.fillStyle = `rgba(255,60,60,${0.4 + Math.sin(time * 4) * 0.4})`;
    ctx.beginPath(); ctx.arc(1240, F - 396, 4, 0, TAU); ctx.fill();
    // rooftop floor
    const rg = ctx.createLinearGradient(0, F, 0, H);
    rg.addColorStop(0, "#27304a"); rg.addColorStop(1, "#0a0f1e");
    ctx.fillStyle = rg; ctx.fillRect(0, F, W, H - F);
    ctx.fillStyle = "rgba(140,170,230,0.18)"; ctx.fillRect(0, F, W, 3);
    // tiles
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * 145 - 20, F); ctx.lineTo(i * 145 - 60, H); ctx.stroke(); }
    // railing
    ctx.strokeStyle = "#1a2440"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, F - 4); ctx.lineTo(W, F - 4); ctx.stroke();
    for (let i = 0; i < 22; i++) { ctx.beginPath(); ctx.moveTo(i * 62 + 12, F - 4); ctx.lineTo(i * 62 + 12, F - 34); ctx.lineWidth = 3; ctx.stroke(); }
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, F - 34); ctx.lineTo(W, F - 34); ctx.stroke();
    // AC unit props
    ctx.fillStyle = "#141d33";
    ctx.fillRect(60, F - 76, 130, 76); ctx.fillRect(1090, F - 64, 120, 64);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(66, F - 76 + i * 14); ctx.lineTo(184, F - 76 + i * 14); ctx.stroke(); }
    // wind streaks
    ctx.strokeStyle = "rgba(180,210,255,0.12)"; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const wx = ((i * 320 + time * 420) % (W + 300)) - 150, wy = 80 + i * 60;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 90, wy - 4); ctx.stroke();
    }
  }
}

/* ---------------------------------------------------------- */
/*  FX RENDERER                                                */
/* ---------------------------------------------------------- */
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; color: string; kind: "spark" | "dust" | "ring" | "streak" | "shard";
  grav: number;
}
interface DmgNum { x: number; y: number; v: number; life: number; kind: string; }

export class Renderer {
  parts: Particle[] = [];
  nums: DmgNum[] = [];
  shake = 0; shakeX = 0; shakeY = 0;
  flashA = 0; flashColor = "#ffffff";
  arena: ArenaId = "neon";
  shakeEnabled = true;
  private trailT: [number, number] = [0, 0];

  addShake(m: number) { if (this.shakeEnabled) this.shake = Math.min(26, this.shake + m); }

  feed(ev: GameEvent) {
    const fy = (y?: number) => C.FLOOR + (y ?? 0);
    switch (ev.t) {
      case "hit": {
        const heavy = ev.kind === "heavy", sp = ev.kind === "special";
        const col = sp ? "#ffc94d" : heavy ? "#ff5a3c" : "#ffffff";
        const n = sp ? 22 : heavy ? 16 : 10;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, v = 120 + Math.random() * (sp ? 560 : heavy ? 430 : 300);
          this.parts.push({ x: ev.x!, y: fy(ev.y), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: 0.3 + Math.random() * 0.25, size: 2 + Math.random() * 3, color: Math.random() < 0.4 ? "#ffd77a" : col, kind: "spark", grav: 900 });
        }
        this.parts.push({ x: ev.x!, y: fy(ev.y), vx: 0, vy: 0, life: 0, max: 0.28, size: heavy || sp ? 70 : 42, color: col, kind: "ring", grav: 0 });
        for (let i = 0; i < 4; i++)
          this.parts.push({ x: ev.x!, y: fy(ev.y), vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 260, life: 0, max: 0.5, size: 3 + Math.random() * 4, color: "#c9d4ff", kind: "shard", grav: 1400 });
        this.nums.push({ x: ev.x! + (Math.random() - 0.5) * 20, y: fy(ev.y) - 30, v: ev.dmg ?? 0, life: 0, kind: ev.kind ?? "light" });
        this.addShake(ev.kind === "special" ? 14 : ev.kind === "heavy" ? 9 : 4);
        if (ev.kind === "special") { this.flashA = 0.28; this.flashColor = "#ffc94d"; }
        else if (ev.kind === "heavy") this.flashA = Math.max(this.flashA, 0.12);
        break;
      }
      case "block": {
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 140 + Math.random() * 200;
          this.parts.push({ x: ev.x!, y: fy(ev.y), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.3, size: 2, color: "#7de0ff", kind: "spark", grav: 500 });
        }
        this.parts.push({ x: ev.x!, y: fy(ev.y), vx: 0, vy: 0, life: 0, max: 0.24, size: 46, color: "#25e0ff", kind: "ring", grav: 0 });
        this.addShake(2.5);
        break;
      }
      case "dash": {
        for (let i = 0; i < 7; i++)
          this.parts.push({ x: ev.x! - (ev.dir ?? 1) * (i * 14), y: fy(ev.y) - 40 - Math.random() * 60, vx: -(ev.dir ?? 1) * (200 + Math.random() * 260), vy: (Math.random() - 0.5) * 60, life: 0, max: 0.28, size: 3 + Math.random() * 6, color: "#9fb8ff", kind: "streak", grav: 0 });
        break;
      }
      case "jump":
        for (let i = 0; i < 6; i++)
          this.parts.push({ x: ev.x! + (Math.random() - 0.5) * 40, y: fy(0), vx: (Math.random() - 0.5) * 180, vy: -Math.random() * 80, life: 0, max: 0.4, size: 3 + Math.random() * 4, color: "#8a94b8", kind: "dust", grav: -60 });
        break;
      case "land":
        for (let i = 0; i < 8; i++)
          this.parts.push({ x: ev.x! + (Math.random() - 0.5) * 50, y: fy(0), vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 100, life: 0, max: 0.45, size: 3 + Math.random() * 5, color: "#8a94b8", kind: "dust", grav: 300 });
        this.addShake(2);
        break;
      case "special":
        this.parts.push({ x: ev.x!, y: fy(ev.y) - 70, vx: 0, vy: 0, life: 0, max: 0.4, size: 90, color: "#ffc94d", kind: "ring", grav: 0 });
        break;
      case "koFx": {
        for (let i = 0; i < 34; i++) {
          const a = Math.random() * TAU, v = 200 + Math.random() * 700;
          this.parts.push({ x: ev.x!, y: fy(ev.y), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.5, size: 2.5 + Math.random() * 4, color: ["#ffffff", "#ffd77a", "#ff5a3c"][i % 3], kind: "spark", grav: 700 });
        }
        this.parts.push({ x: ev.x!, y: fy(ev.y), vx: 0, vy: 0, life: 0, max: 0.55, size: 190, color: "#ffffff", kind: "ring", grav: 0 });
        this.addShake(20);
        this.flashA = 0.55; this.flashColor = "#ffffff";
        break;
      }
    }
  }

  private trails(engine: Engine, dt: number) {
    for (const f of engine.f) {
      this.trailT[f.slot] -= dt;
      if ((f.act === "dash" || f.act === "special") && this.trailT[f.slot] <= 0) {
        this.trailT[f.slot] = 0.024;
        this.parts.push({
          x: f.x, y: C.FLOOR + f.y - f.height * 0.55, vx: -f.face * 60, vy: 0, life: 0, max: 0.22,
          size: f.height * 0.5, color: f.st.aura, kind: "streak", grav: 0,
        });
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine, dt: number) {
    const time = engine.time;
    // shake
    this.shake *= Math.exp(-9 * dt);
    if (this.shake < 0.2) this.shake = 0;
    this.shakeX = (Math.random() - 0.5) * this.shake * 2;
    this.shakeY = (Math.random() - 0.5) * this.shake * 2;

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    drawArena(ctx, this.arena, time);
    this.trails(engine, dt);

    // fighters (KO'd first so winner draws over)
    const order = [...engine.f].sort((a, b) => (a.act === "ko" ? -1 : 0) - (b.act === "ko" ? -1 : 0));
    for (const f of order) drawFighter(ctx, f, time, C.FLOOR);

    // particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      const k = p.life / p.max;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - k;
      if (p.kind === "spark") {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.6), 0, TAU); ctx.fill();
      } else if (p.kind === "ring") {
        ctx.strokeStyle = p.color; ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * easeOut(k), 0, TAU); ctx.stroke();
      } else if (p.kind === "streak") {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size * (1 - k); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.06 - Math.sign(p.vx || 1) * 26, p.y); ctx.stroke();
      } else if (p.kind === "shard") {
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 12);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + k), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // damage numbers
    ctx.textAlign = "center";
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life += dt;
      if (n.life > 0.8) { this.nums.splice(i, 1); continue; }
      const k = n.life / 0.8;
      const yy = n.y - 60 * easeOut(k);
      const size = n.kind === "special" ? 34 : n.kind === "heavy" ? 30 : 22;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `${size}px 'Russo One'`;
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(5,7,15,0.85)";
      ctx.strokeText(String(n.v), n.x, yy);
      ctx.fillStyle = n.kind === "special" ? "#ffc94d" : n.kind === "heavy" ? "#ff5a3c" : n.kind === "chip" ? "#7de0ff" : "#ffffff";
      ctx.fillText(String(n.v), n.x, yy);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(C.W / 2, C.H / 2, C.H * 0.42, C.W / 2, C.H / 2, C.H * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, C.W, C.H);

    // hit flash
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - dt * 2.4);
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.flashA;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.globalAlpha = 1;
    }
  }
}

/* standalone preview used by menus */
export function drawPreview(ctx: CanvasRenderingContext2D, cfg: FighterConfig, w: number, h: number, time: number, action: string) {
  ctx.clearRect(0, 0, w, h);
  const fake = {
    x: w / 2 + 8, y: 0, face: 1, act: action, t: (time % 1.2), flashT: 0, slot: 0, cfg,
    scale: Math.min(w / 260, h / 300), bulk: cfg.body === "lean" ? 0.82 : cfg.body === "heavy" ? 1.28 : 1,
    st: STYLES[cfg.style],
  };
  drawFighter(ctx, fake as unknown as Fighter, time, h * 0.88);
}
