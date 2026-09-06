/* ============================================================
   NEONCLASH — authoritative match server (production mode)

   The shipped static build uses P2P (PeerJS) with host authority.
   This Socket.IO server is the drop-in authoritative path:
   it owns movement limits, attack timing, damage, cooldowns,
   health, round state and match results. Clients send INPUTS
   only — never positions or damage.

   Run:  cd server && npm install && node index.js   (port 8787)
   ============================================================ */
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 8787;
const http = createServer();
const io = new Server(http, { cors: { origin: "*" } });

/* ---- balance (mirror of src/game/defs.ts) ---- */
const C = { W: 1280, WALL: 64, GRAV: 3000, MOVE: 350, JUMP: -1040, DASH_V: 880, DASH_T: 0.17, DASH_CD: 0.75, SPECIAL_COST: 50, MAX_EN: 100, ROUND_TIME: 60 };
const STYLES = {
  balanced: { speedMul: 1.0, dmgMul: 1.0, takenMul: 1.0, maxHp: 100, blockEff: 0.7 },
  speed: { speedMul: 1.28, dmgMul: 0.82, takenMul: 1.1, maxHp: 88, blockEff: 0.6 },
  power: { speedMul: 0.82, dmgMul: 1.35, takenMul: 1.0, maxHp: 104, blockEff: 0.65 },
  defense: { speedMul: 0.94, dmgMul: 0.88, takenMul: 0.82, maxHp: 122, blockEff: 0.85 },
};
const ATTACKS = {
  light: { startup: 0.07, active: 0.10, recover: 0.16, dmg: 6, range: 96, height: 78, hitstun: 0.3, knockX: 150, knockY: -60, enGain: 7 },
  heavy: { startup: 0.21, active: 0.13, recover: 0.32, dmg: 13, range: 118, height: 92, hitstun: 0.48, knockX: 430, knockY: -300, enGain: 11 },
  special: { startup: 0.15, active: 0.20, recover: 0.36, dmg: 19, range: 150, height: 110, hitstun: 0.6, knockX: 560, knockY: -420, enGain: 0 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---- state ---- */
const queue = [];          // sockets waiting for quick match
const rooms = new Map();   // code -> Room
let roomSeq = 1;

function makeFighter(slot, cfg) {
  const st = STYLES[cfg?.style] ?? STYLES.balanced;
  return {
    slot, cfg, x: slot === 0 ? C.W * 0.32 : C.W * 0.68, y: 0, vx: 0, vy: 0,
    face: slot === 0 ? 1 : -1, onGround: true, hp: st.maxHp, maxHp: st.maxHp, en: 0,
    act: "idle", t: 0, stunT: 0, dashT: 0, dashCd: 0, dashDir: 1, invulnT: 0,
    attackKind: null, attackHitDone: false, block: false, combo: 0, comboT: 0,
  };
}

class Room {
  constructor(code, a, b) {
    this.code = code;
    this.players = [a, b];
    this.fighters = [makeFighter(0, a.cfg), makeFighter(1, b.cfg)];
    this.phase = "intro"; this.phaseT = 0; this.round = 1;
    this.wins = [0, 0]; this.timer = C.ROUND_TIME; this.mw = -1;
    a.join(this, 0); b.join(this, 1);
    this.broadcast("start", { code, arena: this.arena, opp: [b.pub(), a.pub()] });
  }
  arena = ["neon", "dojo", "under", "roof"][Math.floor(Math.random() * 4)];
  broadcast(ev, data) { this.players.forEach((p) => p?.sock?.emit(ev, data)); }
  tick(dt) {
    this.phaseT += dt;
    if (this.phase === "intro" && this.phaseT > 1.5) { this.phase = "fight"; this.phaseT = 0; }
    else if (this.phase === "fight") {
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer <= 0) this.endRound(this.fighters[0].hp >= this.fighters[1].hp ? 0 : 1);
    } else if (this.phase === "ko" && this.phaseT > 2.1) this.nextRound();
    for (const f of this.fighters) this.physics(f, dt);
    this.resolve(0, 1); this.resolve(1, 0);
    // 15 Hz state broadcast — clients render from this, nothing else
    this.broadcast("state", {
      f: this.fighters.map((f) => ({ x: f.x, y: f.y, vx: f.vx, vy: f.vy, face: f.face, act: f.act, t: f.t, hp: f.hp, en: f.en, onG: f.onGround, block: f.block })),
      phase: this.phase, round: this.round, wins: this.wins, timer: this.timer, mw: this.mw,
    });
  }
  input(slot, inp) {
    const f = this.fighters[slot];
    if (this.phase !== "fight" || f.act === "ko") return;
    // movement (server-validated: clamped speeds, no teleport)
    if (f.stunT <= 0 && !f.attackKind && f.dashT <= 0) {
      const st = STYLES[f.cfg?.style ?? "balanced"];
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      f.vx = clamp(dir * C.MOVE * st.speedMul, -C.MOVE * 1.6, C.MOVE * 1.6);
      f.face = this.fighters[1 - slot].x >= f.x ? 1 : -1;
      if (inp.jump && f.onGround) { f.vy = C.JUMP; f.onGround = false; }
      f.block = !!inp.block && f.onGround;
      if (inp.pDash && f.dashCd <= 0 && f.onGround) { f.dashT = C.DASH_T; f.dashCd = C.DASH_CD; f.dashDir = dir || f.face; f.invulnT = 0.13; }
      if (inp.pLight) this.startAttack(f, "light");
      else if (inp.pHeavy) this.startAttack(f, "heavy");
      else if (inp.pSpecial) this.startAttack(f, "special");
    }
  }
  startAttack(f, kind) {
    const def = ATTACKS[kind];
    if (f.attackKind || f.dashT > 0) return;
    if (kind === "special" && f.en < C.SPECIAL_COST) return;
    if (kind === "special") f.en -= C.SPECIAL_COST;
    f.attackKind = kind; f.act = kind; f.t = 0; f.attackHitDone = false; f.block = false;
  }
  physics(f, dt) {
    f.t += dt; f.dashCd = Math.max(0, f.dashCd - dt); f.invulnT = Math.max(0, f.invulnT - dt);
    if (f.stunT > 0) { f.stunT -= dt; if (f.stunT <= 0 && f.act === "hit") { f.act = "idle"; f.t = 0; } }
    if (f.attackKind) {
      const def = ATTACKS[f.attackKind];
      const total = def.startup + def.active + def.recover;
      const ts = f.t;
      f.vx = ts >= def.startup && ts < def.startup + def.active ? f.face * (def.knockX * 0.8) : f.vx * Math.exp(-10 * dt);
      if (ts >= total) { f.attackKind = null; f.act = "idle"; f.t = 0; }
    } else if (f.dashT > 0) {
      f.dashT -= dt; f.vx = f.dashDir * C.DASH_V;
      if (f.dashT <= 0) { f.act = "idle"; f.t = 0; }
    } else if (f.block) f.vx = 0;
    if (!f.onGround) f.vy += C.GRAV * dt;
    f.x = clamp(f.x + f.vx * dt, C.WALL, C.W - C.WALL);
    f.y += f.vy * dt;
    if (f.y >= 0) { f.y = 0; f.vy = 0; f.onGround = true; }
    if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }
    if (!f.attackKind && f.onGround && f.stunT <= 0 && f.act !== "block") { f.act = Math.abs(f.vx) > 30 ? "walk" : "idle"; }
  }
  resolve(ai, vi) {
    const atk = this.fighters[ai], vic = this.fighters[vi];
    if (!atk.attackKind || atk.attackHitDone || this.phase !== "fight") return;
    const def = ATTACKS[atk.attackKind];
    const ts = atk.t;
    if (ts < def.startup || ts >= def.startup + def.active) return;
    if (vic.invulnT > 0 || vic.act === "ko") return;
    const ax = atk.x + atk.face * def.range * 0.6;
    if (Math.abs(ax - vic.x) > def.range * 0.75 || Math.abs(vic.y - atk.y) > 120) return;
    atk.attackHitDone = true;
    const stA = STYLES[atk.cfg?.style ?? "balanced"], stV = STYLES[vic.cfg?.style ?? "balanced"];
    const x = vic.x - atk.face * 20, y = vic.y - 80;
    if (vic.block && vic.face === -atk.face) {
      const chip = Math.max(1, Math.round(def.dmg * stA.dmgMul * stV.takenMul * (1 - stV.blockEff)));
      vic.hp = clamp(vic.hp - chip, 1, vic.maxHp);
      this.broadcast("fx", { t: "block", x, y, dmg: chip, kind: "chip", dir: atk.face });
      return;
    }
    const dmg = Math.max(1, Math.round(def.dmg * stA.dmgMul * stV.takenMul));
    vic.hp = clamp(vic.hp - dmg, 0, vic.maxHp);
    atk.en = clamp(atk.en + def.enGain, 0, C.MAX_EN);
    atk.combo++; atk.comboT = 1.1;
    vic.stunT = def.hitstun; vic.act = "hit"; vic.t = 0; vic.attackKind = null;
    vic.vx = atk.face * def.knockX; vic.vy = def.knockY; if (def.knockY < 0) vic.onGround = false;
    this.broadcast("fx", { t: "hit", x, y, dmg, kind: atk.attackKind, combo: atk.combo, dir: atk.face });
    if (vic.hp <= 0) {
      vic.act = "ko"; this.phase = "ko"; this.phaseT = 0;
      this.broadcast("fx", { t: "koFx", x: vic.x, y: vic.y - 70 });
    }
  }
  endRound(winner) { this.wins[winner]++; this.phase = "ko"; this.phaseT = 0.9; }
  nextRound() {
    if (this.wins[0] >= 2 || this.wins[1] >= 2) {
      this.mw = this.wins[0] >= 2 ? 0 : 1;
      this.phase = "end";
      this.broadcast("match", { winner: this.mw });
      clearInterval(this.loop); rooms.delete(this.code);
      return;
    }
    this.round++;
    this.fighters = [makeFighter(0, this.players[0].cfg), makeFighter(1, this.players[1].cfg)];
    this.phase = "intro"; this.phaseT = 0; this.timer = C.ROUND_TIME;
  }
  start() { this.loop = setInterval(() => this.tick(1 / 20), 50); }
}

class Player {
  constructor(sock) { this.sock = sock; this.name = "PILOT"; this.level = 1; this.cfg = null; this.room = null; this.slot = 0; }
  pub() { return { name: this.name, level: this.level, fighter: this.cfg }; }
  join(room, slot) { this.room = room; this.slot = slot; }
}

const players = new Map();

io.on("connection", (sock) => {
  const p = new Player(sock);
  players.set(sock.id, p);
  io.emit("online", players.size);

  sock.on("hello", ({ name, level, fighter }) => {
    p.name = String(name ?? "PILOT").slice(0, 16);
    p.level = clamp(parseInt(level) || 1, 1, 999);
    p.cfg = fighter ?? { style: "balanced" };
    p.cfg.style = STYLES[p.cfg.style] ? p.cfg.style : "balanced";
  });

  sock.on("quickMatch", () => {
    if (queue.length > 0) {
      const other = queue.shift();
      if (!other?.sock?.connected) { queue.push(p); return; }
      const room = new Room(`FIGHT-${1000 + roomSeq++}`, other, p);
      room.start();
    } else queue.push(p);
  });

  sock.on("hostRoom", ({ code }, cb) => {
    code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    if (rooms.has(code)) return cb?.({ err: "code-in-use" });
    p.pendingHost = code;
    const holder = { code, host: p };
    rooms.set(code, holder);
    cb?.({ ok: true, code });
  });

  sock.on("joinRoom", ({ code }, cb) => {
    code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const holder = rooms.get(code);
    if (!holder || !holder.host?.sock?.connected) return cb?.({ err: "room-not-found" });
    rooms.delete(code);
    const room = new Room(code, holder.host, p);
    room.start();
    cb?.({ ok: true });
  });

  sock.on("input", (inp) => {
    if (p.room instanceof Room) p.room.input(p.slot, inp || {});
  });
  sock.on("rematch", () => {
    // host-driven rematches in server mode: recreate room
    if (p.room instanceof Room && p.slot === 0 && p.room.mw >= 0) {
      const other = p.room.players[1];
      const room = new Room(p.room.code, p, other);
      room.start();
    }
  });

  sock.on("disconnect", () => {
    players.delete(sock.id);
    const qi = queue.indexOf(p); if (qi >= 0) queue.splice(qi, 1);
    if (p.room instanceof Room) p.room.broadcast("oppLeft", {});
    io.emit("online", players.size);
  });
});

http.listen(PORT, () => console.log(`NEONCLASH authoritative server on :${PORT}`));
