import React, { useEffect, useMemo, useRef, useState } from "react";
import { C, FighterConfig, GLOVES, HAIR_COLORS, OUTFITS, SKINS, STYLES, TRIMS, defaultFighter } from "../game/defs";
import { Engine, Fighter } from "../game/engine";
import { Renderer } from "../render/draw";
import { MatchSession } from "../net/peer";
import { Profile, Settings, awardXp, XpResult } from "../store";
import { SFX, stopMusic, startMusic } from "../audio/sfx";

interface Props {
  mode: "online" | "training";
  session: MatchSession | null;
  profile: Profile;
  settings: Settings;
  onProfileChange: (p: Profile) => void;
  onExit: () => void;
}

function makeRival(): FighterConfig {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const styles = Object.keys(STYLES) as (keyof typeof STYLES)[];
  const f = defaultFighter();
  return {
    ...f, name: "DUMMY-01", skin: pick(SKINS), hair: pick(["mohawk", "spike", "long", "bun"] as const),
    hairColor: pick(HAIR_COLORS), outfit: pick(OUTFITS), outfitTrim: pick(TRIMS), glove: pick(GLOVES),
    style: pick(styles), accessory: pick(["visor", "scarf", "band", "none"] as const),
  };
}

interface Hud {
  hpL: number; hpR: number; maxL: number; maxR: number; enL: number; enR: number;
  timer: number; round: number; winsL: number; winsR: number; phase: string;
  comboL: number; comboR: number;
}
interface Banner { text: string; sub?: string; kind: "gold" | "red" | "cyan"; key: number }

export default function Fight({ mode, session, profile, settings, onProfileChange, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const padPrev = useRef<boolean[]>([]);
  const fightTime = useRef(0);
  const netAcc = useRef(0);
  const roundAcc = useRef(0);
  const myRematch = useRef(false);
  const theirRematch = useRef(false);
  const ended = useRef(false);
  const incomingCombo = useRef(0);
  const incomingComboT = useRef(0);

  const [hud, setHud] = useState<Hud | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [result, setResult] = useState<{
    won: boolean; xp: XpResult; dmg: number; combo: number; dur: number;
    winsL: number; winsR: number; perfects: number; oppName: string;
  } | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [scale, setScale] = useState(1);
  const [train, setTrain] = useState({ ai: true, inf: true });
  const [showResult, setShowResult] = useState(false);

  const opp = session?.opp ?? { name: "DUMMY-01", level: 1, fighter: makeRival() };
  const isHost = mode === "training" || session?.role === "host";

  /* ---------- construct engine once ---------- */
  useMemo(() => {
    const localSlot: 0 | 1 = mode === "training" ? 0 : session?.role === "guest" ? 1 : 0;
    const e = new Engine(profile.fighter, opp.fighter, {
      mode: mode === "training" ? "training" : "net",
      localSlot,
      authority: isHost,
      ai: mode === "training",
      infiniteHp: mode === "training",
    });
    e.startMatch();
    engineRef.current = e;
    const r = new Renderer();
    r.arena = session?.arena ?? "neon";
    r.shakeEnabled = settings.shake;
    rendererRef.current = r;
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- resize ---------- */
  useEffect(() => {
    const onR = () => {
      const el = wrapRef.current; if (!el) return;
      setScale(Math.min(el.clientWidth / C.W, el.clientHeight / C.H));
    };
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  /* ---------- net wiring ---------- */
  useEffect(() => {
    if (mode !== "online" || !session) return;
    session.onMessage((m: any) => {
      const e = engineRef.current; if (!e) return;
      if (m.t === "state") e.applyRemote(m.s);
      else if (m.t === "evt" && m.e) {
        const ev = m.e;
        if (ev.t === "hit") {
          e.receiveHit(ev.dmg, ev.kind, ev.dir, ev.combo ?? 0, ev.x, ev.y);
          if (ev.combo >= 2) { incomingCombo.current = ev.combo; incomingComboT.current = 1.1; }
        }
      } else if (m.t === "round") {
        e.applyRoundInfo(m.phase, m.round, m.wins, m.timer, m.mw);
      } else if (m.t === "rematchReq") {
        theirRematch.current = true;
        if (isHost && myRematch.current) { session.send({ t: "start" }); restartMatch(); }
      } else if (m.t === "start") {
        restartMatch();
      } else if (m.t === "bye") {
        setDisconnected(true);
      }
    });
    session.onClose(() => { if (!ended.current) setDisconnected(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const restartMatch = () => {
    const e = engineRef.current; if (!e) return;
    e.startMatch();
    myRematch.current = false; theirRematch.current = false;
    fightTime.current = 0; ended.current = false;
    setResult(null); setShowResult(false);
  };

  /* ---------- input ---------- */
  useEffect(() => {
    const dn = (ev: KeyboardEvent) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.code)) ev.preventDefault();
      keys.current[ev.code] = true;
    };
    const up = (ev: KeyboardEvent) => { keys.current[ev.code] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  const readInput = () => {
    const k = keys.current;
    const inp = {
      left: !!(k.KeyA || k.ArrowLeft),
      right: !!(k.KeyD || k.ArrowRight),
      jump: !!(k.KeyW || k.ArrowUp),
      block: !!(k.KeyS || k.ArrowDown),
      pLight: !!k.KeyJ, pHeavy: !!k.KeyK, pSpecial: !!k.KeyL, pDash: !!k.Space,
    };
    // gamepad (standard mapping)
    try {
      const gp = navigator.getGamepads?.()?.[0];
      if (gp) {
        const b = gp.buttons.map((x) => x.pressed);
        const p = padPrev.current;
        const edge = (i: number) => !!b[i] && !p[i];
        if (gp.axes[0] < -0.4) inp.left = true;
        if (gp.axes[0] > 0.4) inp.right = true;
        if (edge(0)) inp.jump = true;
        if (edge(2)) inp.pLight = true;
        if (edge(3)) inp.pHeavy = true;
        if (b[1]) inp.block = true;
        if (edge(4)) inp.pDash = true;
        if (edge(5)) inp.pSpecial = true;
        padPrev.current = b;
      }
    } catch { /* no gamepad */ }
    return inp;
  };

  /* ---------- main loop ---------- */
  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0; let last = performance.now();
    let bannerKey = 0;
    const showBanner = (text: string, kind: Banner["kind"], sub?: string) =>
      setBanner({ text, sub, kind, key: ++bannerKey });

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      const e = engineRef.current, r = rendererRef.current;
      if (!e || !r) return;
      r.shakeEnabled = settings.shake;

      e.setLocalInput(readInput());
      e.update(dt);
      if (e.phase === "fight") fightTime.current += dt;
      if (incomingComboT.current > 0) { incomingComboT.current -= dt; if (incomingComboT.current <= 0) incomingCombo.current = 0; }

      /* ---- consume events ---- */
      const evs = e.events.splice(0);
      for (const ev of evs) {
        switch (ev.t) {
          case "swing":
            if (ev.kind === "heavy") SFX.swingHeavy(); else if (ev.kind === "special") SFX.special(); else SFX.swing();
            break;
          case "hit":
            if (ev.kind === "special") SFX.hitSpecial(); else if (ev.kind === "heavy") SFX.hitHeavy(); else SFX.hitLight();
            r.feed(ev); break;
          case "block": SFX.block(); r.feed(ev); break;
          case "jump": SFX.jump(); r.feed(ev); break;
          case "land": SFX.land(); r.feed(ev); break;
          case "dash": SFX.dash(); r.feed(ev); break;
          case "special": r.feed(ev); break;
          case "koFx": r.feed(ev); break;
          case "ko": SFX.ko(); showBanner("K.O.", "red"); break;
          case "round": SFX.bell(); showBanner(e.round >= C.ROUNDS_TO_WIN * 2 - 1 ? "FINAL ROUND" : `ROUND ${ev.n}`, "gold", "BEST OF 3"); break;
          case "fight": SFX.fight(); showBanner("FIGHT!", "cyan"); break;
          case "roundEnd": {
            const w = ev.winner!;
            const iWon = w === e.localSlot;
            if (iWon) showBanner("ROUND WON", "cyan"); else showBanner("ROUND LOST", "red");
            break;
          }
          case "matchEnd": {
            if (ended.current) break;
            ended.current = true;
            const won = ev.winner === e.localSlot;
            stopMusic();
            if (won) SFX.win(); else SFX.lose();
            const local = e.local;
            const xpRes = awardXp(profile, won, e.perfects[e.localSlot], local.maxCombo);
            const np: Profile = {
              ...profile,
              xp: xpRes.leveledUp ? xpRes.gained - (xpRes.newLevel - profile.level > 1 ? 0 : 0) : profile.xp + xpRes.gained,
              level: xpRes.newLevel,
              wins: profile.wins + (won ? 1 : 0),
              losses: profile.losses + (won ? 0 : 1),
              matches: profile.matches + 1,
              highestCombo: Math.max(profile.highestCombo, local.maxCombo),
              totalDamage: profile.totalDamage + Math.round(local.damageDealt),
              perfects: profile.perfects + e.perfects[e.localSlot],
            };
            // recompute xp properly through level thresholds
            let xp = profile.xp + xpRes.gained, lv = profile.level;
            const need = (l: number) => 100 + (l - 1) * 60;
            while (xp >= need(lv)) { xp -= need(lv); lv++; }
            np.xp = xp; np.level = lv;
            onProfileChange(np);
            if (xpRes.leveledUp) setTimeout(() => SFX.levelUp(), 900);
            setResult({
              won, xp: xpRes, dmg: Math.round(local.damageDealt), combo: local.maxCombo,
              dur: fightTime.current, winsL: e.wins[e.localSlot], winsR: e.wins[1 - e.localSlot],
              perfects: e.perfects[e.localSlot], oppName: opp.name,
            });
            setTimeout(() => setShowResult(true), 1700);
            break;
          }
          case "netHit":
            if (mode === "online" && session) session.send({ t: "evt", e: { t: "hit", dmg: ev.dmg, kind: ev.kind, dir: ev.dir, combo: ev.combo, x: ev.x, y: ev.y } });
            break;
        }
      }
      // receive-side combo tracking for HUD
      for (const ev of evs) if (ev.t === "hit" && e.remote.combo >= 2 && mode === "training") { /* training uses remote.combo */ }
      if (mode === "online") {
        // combo of incoming hits comes from peer messages
      }

      /* ---- net sync ---- */
      if (mode === "online" && session) {
        netAcc.current += dt;
        if (netAcc.current >= 1 / 30) {
          netAcc.current = 0;
          session.send({ t: "state", s: e.local.snapshot() });
        }
        if (isHost) {
          roundAcc.current += dt;
          if (roundAcc.current >= 0.1) {
            roundAcc.current = 0;
            session.send({ t: "round", phase: e.phase, round: e.round, wins: e.wins, timer: e.timer, mw: e.matchWinner });
          }
        }
      }

      /* ---- render ---- */
      ctx.clearRect(0, 0, C.W, C.H);
      r.render(ctx, e, dt);

      /* ---- HUD sync ---- */
      const L = e.local, R = e.remote;
      const comboR = mode === "training" ? R.combo : incomingCombo.current;
      const next: Hud = {
        hpL: L.hp, hpR: R.hp, maxL: L.maxHp, maxR: R.maxHp, enL: L.en, enR: R.en,
        timer: Math.ceil(e.timer), round: e.round, winsL: e.wins[e.localSlot], winsR: e.wins[1 - e.localSlot],
        phase: e.phase, comboL: L.combo, comboR,
      };
      setHud((prev) =>
        prev && prev.hpL === next.hpL && prev.hpR === next.hpR && prev.enL === next.enL && prev.enR === next.enR &&
          prev.timer === next.timer && prev.round === next.round && prev.winsL === next.winsL && prev.winsR === next.winsR &&
          prev.comboL === next.comboL && prev.comboR === next.comboR
          ? prev : next,
      );
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session, settings.shake]);



  const myStyle = STYLES[profile.fighter.style];
  const oppStyle = STYLES[opp.fighter.style];
  const meName = profile.fighter.name || profile.name;

  const reqRematch = () => {
    SFX.click();
    myRematch.current = true;
    if (mode === "training") { restartMatch(); startMusic(); return; }
    session?.send({ t: "rematchReq" });
    if (isHost && theirRematch.current) { session?.send({ t: "start" }); restartMatch(); startMusic(); }
  };
  const exit = () => {
    SFX.back();
    ended.current = true;
    if (session) { session.send({ t: "bye" }); session.close(); }
    startMusic();
    onExit();
  };

  const hpPctL = hud ? (hud.hpL / hud.maxL) * 100 : 100;
  const hpPctR = hud ? (hud.hpR / hud.maxR) * 100 : 100;

  return (
    <div ref={wrapRef} className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#04060e]">
      {/* stage */}
      <div className="relative" style={{ width: C.W * scale, height: C.H * scale }}>
        <canvas ref={canvasRef} width={C.W} height={C.H} style={{ width: C.W * scale, height: C.H * scale, display: "block" }} />

        {/* ============ HUD ============ */}
        {hud && (
          <div className="pointer-events-none absolute inset-0" style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: C.W, height: C.H }}>
            {/* top bars */}
            <div className="absolute left-0 right-0 top-0 flex items-start justify-between px-6 pt-4">
              {/* left (me) */}
              <div className="w-[440px]">
                <div className="flex items-baseline gap-3">
                  <span className="font-disp text-[17px] text-white" style={{ textShadow: "0 2px 8px #000" }}>{meName}</span>
                  <span className="text-[11px] font-bold tracking-widest text-[var(--cy)]">LV {profile.level}</span>
                  <span className="text-[10px] tracking-[0.25em] text-[var(--dim)]">{myStyle.tag}</span>
                </div>
                <div className="bar-track mt-1 h-[22px]">
                  <div className="bar-ghost" style={{ width: `${hpPctL}%`, left: 0 }} />
                  <div className={`bar-fill bar-hp ${hpPctL < 30 ? "low" : ""}`} style={{ width: `${hpPctL}%` }} />
                </div>
                <div className="bar-track mt-1 h-[9px]">
                  <div className="bar-fill bar-en" style={{ width: `${(hud.enL / C.MAX_EN) * 100}%`, boxShadow: hud.enL >= C.SPECIAL_COST ? "0 0 12px var(--gold)" : "none" }} />
                </div>
                <div className="mt-1 flex gap-1.5">
                  {[0, 1].map((i) => (
                    <span key={i} className="h-[8px] w-[26px]" style={{
                      background: i < hud.winsL ? "var(--cy)" : "rgba(120,150,210,0.15)",
                      boxShadow: i < hud.winsL ? "0 0 8px var(--cy)" : "none",
                      clipPath: "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)",
                    }} />
                  ))}
                  {hud.enL >= C.SPECIAL_COST && <span className="ml-2 animate-[pulseGlow_0.8s_infinite] text-[10px] font-bold tracking-widest text-[var(--gold)]">SPECIAL READY [L]</span>}
                </div>
              </div>

              {/* timer */}
              <div className="flex flex-col items-center">
                <div className="panel px-5 py-1 text-center" style={{ clipPath: "polygon(12px 0, calc(100% - 12px) 0, 100% 100%, 0 100%)" }}>
                  <div className={`font-disp text-[34px] leading-none ${hud.timer <= 10 ? "text-[var(--mg)]" : "text-white"}`}>{hud.timer}</div>
                </div>
                <div className="mt-1 text-[10px] font-bold tracking-[0.35em] text-[var(--dim)]">ROUND {hud.round}</div>
              </div>

              {/* right (opp) */}
              <div className="w-[440px] text-right">
                <div className="flex items-baseline justify-end gap-3">
                  <span className="text-[10px] tracking-[0.25em] text-[var(--dim)]">{oppStyle.tag}</span>
                  <span className="text-[11px] font-bold tracking-widest text-[var(--mg)]">LV {opp.level}</span>
                  <span className="font-disp text-[17px] text-white" style={{ textShadow: "0 2px 8px #000" }}>{opp.name}</span>
                </div>
                <div className="bar-track mt-1 h-[22px]" style={{ transform: "scaleX(-1)" }}>
                  <div className="bar-ghost" style={{ width: `${hpPctR}%`, left: 0 }} />
                  <div className={`bar-fill bar-hp ${hpPctR < 30 ? "low" : ""}`} style={{ width: `${hpPctR}%` }} />
                </div>
                <div className="bar-track mt-1 h-[9px]" style={{ transform: "scaleX(-1)" }}>
                  <div className="bar-fill bar-en" style={{ width: `${(hud.enR / C.MAX_EN) * 100}%` }} />
                </div>
                <div className="mt-1 flex justify-end gap-1.5">
                  {[0, 1].map((i) => (
                    <span key={i} className="h-[8px] w-[26px]" style={{
                      background: i < hud.winsR ? "var(--mg)" : "rgba(120,150,210,0.15)",
                      boxShadow: i < hud.winsR ? "0 0 8px var(--mg)" : "none",
                      clipPath: "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)",
                    }} />
                  ))}
                </div>
              </div>
            </div>

            {/* combos */}
            {hud.comboL >= 2 && (
              <div key={`cl${hud.comboL}`} className="absolute left-[130px] top-[190px]" style={{ animation: "comboPop 0.25s ease-out both" }}>
                <div className="font-disp text-[44px] leading-none text-[var(--gold)] text-glow-gold" style={{ transform: "rotate(-4deg)" }}>{hud.comboL} HIT</div>
                <div className="font-disp text-[15px] tracking-[0.4em] text-white">COMBO</div>
              </div>
            )}
            {hud.comboR >= 2 && (
              <div key={`cr${hud.comboR}`} className="absolute right-[130px] top-[190px] text-right" style={{ animation: "comboPop 0.25s ease-out both" }}>
                <div className="font-disp text-[44px] leading-none text-[var(--mg)] text-glow-mg" style={{ transform: "rotate(4deg)" }}>{hud.comboR} HIT</div>
                <div className="font-disp text-[15px] tracking-[0.4em] text-white">COMBO</div>
              </div>
            )}

            {/* banner */}
            {banner && (
              <div key={banner.key} className="absolute inset-x-0 top-[300px] flex flex-col items-center">
                <div
                  className={`font-disp anim-slam text-[86px] leading-none ${banner.kind === "red" ? "text-[var(--mg)] text-glow-mg" : banner.kind === "gold" ? "text-[var(--gold)] text-glow-gold" : "text-[var(--cy)] text-glow-cy"}`}
                  onAnimationEnd={() => setTimeout(() => setBanner((b) => (b?.key === banner.key ? null : b)), 700)}
                >
                  {banner.text}
                </div>
                {banner.sub && <div className="mt-2 text-[13px] font-bold tracking-[0.5em] text-[var(--dim)]">{banner.sub}</div>}
              </div>
            )}

            {/* footer hints */}
            <div className="absolute bottom-2 left-0 right-0 flex items-center justify-between px-6 text-[11px] text-[var(--dim)]">
              <div className="flex items-center gap-4">
                <span><span className="kbd">A</span><span className="kbd ml-1">D</span> move</span>
                <span><span className="kbd">W</span> jump</span>
                <span><span className="kbd">S</span> block</span>
                <span><span className="kbd">J</span> light</span>
                <span><span className="kbd">K</span> heavy</span>
                <span><span className="kbd">L</span> special</span>
                <span><span className="kbd">SPACE</span> dash</span>
              </div>
              <span className="tracking-[0.25em]">
                {mode === "training" ? "TRAINING PROTOCOL" : `${isHost ? "HOST" : "GUEST"} · P2P LINK ACTIVE`}
              </span>
            </div>
          </div>
        )}

        {/* ============ training panel ============ */}
        {mode === "training" && !showResult && (
          <div className="absolute left-4 top-[150px] w-[190px]" style={{ transform: `scale(${Math.max(scale, 0.8)})`, transformOrigin: "top left" }}>
            <div className="panel pointer-events-auto">
              <div className="panel-title">TRAINING</div>
              <div className="flex flex-col gap-2 p-3 text-[12px]">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="tracking-wider text-[var(--dim)]">CPU DUMMY</span>
                  <input type="checkbox" checked={train.ai} onChange={(ev) => { setTrain((t) => ({ ...t, ai: ev.target.checked })); if (engineRef.current) engineRef.current.ai = ev.target.checked; }} />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="tracking-wider text-[var(--dim)]">INFINITE HP</span>
                  <input type="checkbox" checked={train.inf} onChange={(ev) => { setTrain((t) => ({ ...t, inf: ev.target.checked })); if (engineRef.current) { engineRef.current.infiniteHp = ev.target.checked; if (ev.target.checked) { engineRef.current.local.hp = engineRef.current.local.maxHp; engineRef.current.remote.hp = engineRef.current.remote.maxHp; } } }} />
                </label>
                <button className="btn btn-ghost mt-1 justify-center px-3 py-2 text-[11px]" onClick={() => { SFX.click(); restartMatch(); }}>
                  Reset Round
                </button>
                <div className="mt-1 border-t border-[rgba(37,224,255,0.14)] pt-2 text-[11px] text-[var(--dim)]">
                  DMG DEALT <b className="text-white">{hud ? Math.round(engineRef.current?.local.damageDealt ?? 0) : 0}</b>
                  <br />MAX COMBO <b className="text-[var(--gold)]">{engineRef.current?.local.maxCombo ?? 0}</b>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ result overlay ============ */}
        {result && showResult && (
          <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ background: "rgba(3,5,12,0.82)" }}>
            <div className="panel anim-rise w-[620px] max-w-[92%]">
              <div className={`px-8 pb-2 pt-8 text-center`}>
                <div className={`font-disp text-[64px] leading-none ${result.won ? "text-[var(--cy)] text-glow-cy" : "text-[var(--mg)] text-glow-mg"}`}>
                  {result.won ? "VICTORY" : "DEFEAT"}
                </div>
                <div className="mt-2 text-[12px] tracking-[0.3em] text-[var(--dim)]">
                  {result.won ? `${meName} DEFEATS ${result.oppName.toUpperCase()}` : `${result.oppName.toUpperCase()} TAKES THE STRIP`} · {result.winsL}–{result.winsR}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 px-8 py-5 text-center">
                {[
                  { l: "DAMAGE DEALT", v: result.dmg },
                  { l: "BEST COMBO", v: `${result.combo} HIT` },
                  { l: "FIGHT TIME", v: `${Math.floor(result.dur / 60)}:${String(Math.floor(result.dur % 60)).padStart(2, "0")}` },
                  { l: "PERFECT ROUNDS", v: result.perfects },
                ].map((s) => (
                  <div key={s.l} className="border border-[rgba(37,224,255,0.14)] bg-[rgba(10,16,32,0.6)] py-3">
                    <div className="font-disp text-[20px] text-white">{s.v}</div>
                    <div className="mt-1 text-[9px] tracking-[0.2em] text-[var(--dim)]">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="mx-8 mb-4 border border-[rgba(255,201,77,0.35)] bg-[rgba(30,22,6,0.5)] px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-[0.3em] text-[var(--dim)]">XP EARNED</span>
                  <span className="font-disp text-[26px] text-[var(--gold)] text-glow-gold">+{result.xp.gained}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--dim)]">
                  {result.xp.breakdown.map((b) => <span key={b.label}>{b.label} <b className="text-[var(--gold)]">+{b.v}</b></span>)}
                </div>
                {result.xp.leveledUp && (
                  <div className="font-disp mt-2 animate-[pulseGlow_0.9s_infinite] text-[18px] text-[var(--grn)]" style={{ textShadow: "0 0 16px var(--grn)" }}>
                    ⬆ LEVEL UP! → LEVEL {result.xp.newLevel}
                  </div>
                )}
              </div>
              <div className="flex gap-3 px-8 pb-8">
                <button className="btn btn-big flex-1 justify-center" onClick={reqRematch}>
                  {mode === "online" ? (myRematch.current ? "Waiting…" : "Rematch") : "Rematch"}
                </button>
                <button className="btn btn-ghost btn-big flex-1 justify-center" onClick={exit}>Return to Lobby</button>
              </div>
            </div>
          </div>
        )}

        {/* ============ disconnected ============ */}
        {disconnected && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,5,12,0.85)]">
            <div className="panel panel-red anim-rise w-[440px] p-8 text-center">
              <div className="font-disp text-[30px] text-[var(--mg)] text-glow-mg">LINK SEVERED</div>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--dim)]">
                Your opponent disconnected from the match. The strip goes dark — return to the lobby to find a new challenger.
              </p>
              <button className="btn btn-big mt-6 w-full justify-center" onClick={exit}>Return to Lobby</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
