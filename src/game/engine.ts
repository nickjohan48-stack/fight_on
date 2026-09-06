/* ============================================================
   NEONCLASH — fight engine: physics, combat, rounds, AI, sync
   The engine is deterministic-ish per fighter: every client
   fully simulates ITS OWN fighter; hits are resolved by the
   attacker and mirrored to the victim (host arbitrates rounds).
   ============================================================ */
import {
  ATTACKS, ActionId, AttackDef, C, EMPTY_INPUT, FighterConfig, GameEvent,
  InputFrame, Snapshot, STYLES, StyleStats,
} from "./defs";

export class Fighter {
  slot: number; cfg: FighterConfig; st: StyleStats;
  x = 0; y = 0; vx = 0; vy = 0; face: 1 | -1 = 1;
  onGround = true;
  hp = 100; maxHp = 100; en = 0;
  act: ActionId = "idle"; t = 0;            // time inside current action
  stunT = 0; flashT = 0; invulnT = 0;
  dashT = 0; dashCd = 0; dashDir: 1 | -1 = 1;
  blockHeld = false;
  // combat bookkeeping
  attackKind: "light" | "heavy" | "special" | null = null;
  attackHitDone = false; queued: "light" | "heavy" | null = null;
  combo = 0; comboT = 0; maxCombo = 0; damageDealt = 0;
  scale = 1; bulk = 1;
  perfect = true;
  // interpolation target for remote fighters
  tx = 0; ty = 0; isRemote = false;

  constructor(slot: number, cfg: FighterConfig) {
    this.slot = slot; this.cfg = cfg;
    this.st = STYLES[cfg.style];
    this.maxHp = this.hp = this.st.maxHp;
    this.scale = cfg.body === "lean" ? 0.92 : cfg.body === "heavy" ? 1.08 : 1;
    this.bulk = cfg.body === "lean" ? 0.82 : cfg.body === "heavy" ? 1.28 : 1;
  }
  get width() { return 52 * this.scale * this.bulk ** 0.5; }
  get height() { return 148 * this.scale; }
  get cx() { return this.x; }
  get attacking() { return this.act === "light" || this.act === "heavy" || this.act === "special"; }
  get busy() { return this.attacking || this.act === "hit" || this.act === "dash" || this.act === "ko"; }
  get blocking() { return this.act === "block"; }
  snapshot(): Snapshot {
    return {
      x: this.x, y: this.y, vx: this.vx, vy: this.vy, face: this.face,
      act: this.act, t: this.t, hp: this.hp, en: this.en,
      onG: this.onGround, block: this.blocking,
    };
  }
  reset(x: number, face: 1 | -1) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.face = face;
    this.hp = this.maxHp; this.en = 0; this.act = "idle"; this.t = 0;
    this.stunT = 0; this.flashT = 0; this.invulnT = 0; this.dashT = 0; this.dashCd = 0;
    this.attackKind = null; this.queued = null; this.combo = 0; this.comboT = 0;
    this.onGround = true; this.blockHeld = false; this.perfect = true;
  }
}

export type EngineMode = "training" | "net";
export type Phase = "intro" | "fight" | "ko" | "end";

export interface EngineOpts {
  mode: EngineMode;
  localSlot: 0 | 1;
  authority: boolean;   // drives timer + round flow (host in net, always true in training)
  ai: boolean;          // slot 1 is AI (training)
  infiniteHp?: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Engine {
  f: [Fighter, Fighter];
  mode: EngineMode; localSlot: 0 | 1; authority: boolean; ai: boolean;
  infiniteHp: boolean;
  phase: Phase = "intro"; phaseT = 0;
  round = 1; wins: [number, number] = [0, 0];
  perfects: [number, number] = [0, 0];
  timer = C.ROUND_TIME; timeScale = 1; slowmoT = 0;
  events: GameEvent[] = [];
  matchWinner = -1;
  aiThink = 0; aiPlan: Partial<InputFrame> = {}; aiBlockT = 0;
  time = 0;

  constructor(a: FighterConfig, b: FighterConfig, opts: EngineOpts) {
    this.f = [new Fighter(0, a), new Fighter(1, b)];
    this.f[0].face = 1; this.f[1].face = -1;
    this.f[0].x = C.W * 0.32; this.f[1].x = C.W * 0.68;
    this.mode = opts.mode; this.localSlot = opts.localSlot;
    this.authority = opts.authority; this.ai = opts.ai;
    this.infiniteHp = !!opts.infiniteHp;
    if (this.mode === "net") {
      const r = this.f[1 - opts.localSlot];
      r.isRemote = true; r.tx = r.x; r.ty = r.y;
    }
    this.resetRound(false);
  }
  get local() { return this.f[this.localSlot]; }
  get remote() { return this.f[1 - this.localSlot]; }

  /* ------------- flow ------------- */
  resetRound(fullEnergyReset = true) {
    this.f[0].reset(C.W * 0.32, 1);
    this.f[1].reset(C.W * 0.68, -1);
    if (fullEnergyReset) { this.f[0].en = 0; this.f[1].en = 0; }
    this.phase = "intro"; this.phaseT = 0; this.timer = C.ROUND_TIME;
    this.timeScale = 1; this.slowmoT = 0; this.matchWinner = -1;
  }
  startMatch() {
    this.round = 1; this.wins = [0, 0];
    this.f[0].maxCombo = 0; this.f[1].maxCombo = 0;
    this.f[0].damageDealt = 0; this.f[1].damageDealt = 0;
    this.resetRound();
    this.announce("round", this.round);
  }
  private announce(t: string, n?: number, winner?: number) {
    this.events.push({ t, n, winner });
  }

  /* ------------- net: apply remote data ------------- */
  applyRemote(s: Snapshot) {
    const r = this.remote;
    s.x = clamp(s.x, C.WALL, C.W - C.WALL);
    s.y = clamp(s.y, -420, 0);
    s.hp = clamp(s.hp, 0, r.maxHp);
    s.en = clamp(s.en, 0, C.MAX_EN);
    r.tx = s.x; r.ty = s.y;
    r.face = s.face >= 0 ? 1 : -1;
    // trust action/timing for animation sync
    if (s.act !== r.act || Math.abs(s.t - r.t) > 0.25) { r.act = s.act as ActionId; r.t = s.t; }
    r.vx = s.vx; r.vy = s.vy; r.onGround = s.onG; r.blockHeld = s.block;
    r.hp = s.hp; // hp only ever drops via attacker-resolved hits; snapshots confirm
    r.en = s.en;
  }
  applyRoundInfo(phase: Phase, round: number, wins: [number, number], timer: number, matchWinner: number) {
    if (!this.authority) {
      const wasPhase = this.phase;
      this.phase = phase; this.round = round; this.wins = wins;
      this.timer = timer;
      this.matchWinner = matchWinner;
      if (phase === "intro" && wasPhase !== "intro") {
        this.resetRound();
        this.announce("round", round);
      } else if (phase === "fight" && wasPhase === "intro") {
        this.announce("fight");
      } else if (phase === "end" && wasPhase !== "end") {
        this.announce("matchEnd", undefined, matchWinner);
      }
    }
  }
  /** Victim-side application of an attacker-resolved hit (net mode). */
  receiveHit(dmg: number, kind: string, dir: number, combo: number, x: number, y: number) {
    const me = this.local;
    dmg = clamp(Math.round(dmg), 0, 34);
    me.hp = clamp(me.hp - dmg, 0, me.maxHp);
    if (kind !== "chip") { me.perfect = false; }
    me.flashT = 0.09; me.stunT = Math.max(me.stunT, kind === "chip" ? 0.12 : ATTACKS[kind as "light"]?.hitstun ?? 0.3);
    if (kind !== "chip") {
      me.act = "hit"; me.t = 0;
      me.vx = dir * (ATTACKS[kind as "heavy"]?.knockX ?? 200);
      me.vy = ATTACKS[kind as "heavy"]?.knockY ?? -80;
      if (me.vy < 0) me.onGround = false;
    } else {
      me.vx = dir * 90;
    }
    this.events.push({ t: kind === "chip" ? "block" : "hit", x, y, dmg, kind, combo, dir });
    if (me.hp <= 0 && this.phase === "fight") this.doKO(me);
  }

  /* ------------- input ------------- */
  setLocalInput(inp: InputFrame) {
    this.stepFighter(this.local, inp, true);
    if (this.ai && this.mode === "training") {
      const aiInp = this.aiDecide();
      this.stepFighter(this.remote, aiInp, false);
    }
  }

  /* ------------- per-frame ------------- */
  update(dtRaw: number) {
    this.time += dtRaw;
    if (this.slowmoT > 0) { this.slowmoT -= dtRaw; if (this.slowmoT <= 0) this.timeScale = 1; }
    const dt = dtRaw * this.timeScale;

    // phase machine (authority drives)
    this.phaseT += dtRaw;
    if (this.phase === "fight") {
      this.timer = Math.max(0, this.timer - dt);
      if (this.authority && this.timer <= 0) this.timeUp();
    }
    if (this.authority) {
      if (this.phase === "intro") {
        if (this.phaseT > 1.5) { this.phase = "fight"; this.phaseT = 0; this.announce("fight"); }
      } else if (this.phase === "ko") {
        if (this.phaseT > 2.1) this.afterKO();
      }
    }

    const canFight = this.phase === "fight";
    for (const f of this.f) {
      this.physics(f, dt, canFight);
      if (this.mode === "net" && f.isRemote) this.interpolate(f, dt);
      // combo decay
      if (f.comboT > 0) {
        f.comboT -= dt;
        if (f.comboT <= 0) { f.combo = 0; }
      }
    }
    // resolve local fighter's active attacks against opponent
    if (canFight) this.resolveAttack(this.local, this.remote, true);
    if (this.ai && this.mode === "training" && canFight) this.resolveAttack(this.remote, this.local, true);

    // keep fighters from stacking
    this.separate();
  }

  private interpolate(f: Fighter, dt: number) {
    const k = 1 - Math.exp(-24 * dt);
    f.x += (f.tx - f.x) * k;
    f.y += (f.ty - f.y) * k;
  }

  private separate() {
    const [a, b] = this.f;
    if (a.act === "ko" || b.act === "ko") return;
    const minD = (a.width + b.width) * 0.42;
    const d = b.x - a.x;
    if (Math.abs(d) < minD && Math.abs(a.y - b.y) < 90) {
      const push = (minD - Math.abs(d)) / 2 * Math.sign(d || 1);
      a.x = clamp(a.x - push, C.WALL, C.W - C.WALL);
      b.x = clamp(b.x + push, C.WALL, C.W - C.WALL);
    }
  }

  private physics(f: Fighter, dt: number, canFight: boolean) {
    f.t += dt;
    f.flashT = Math.max(0, f.flashT - dt);
    f.invulnT = Math.max(0, f.invulnT - dt);
    f.dashCd = Math.max(0, f.dashCd - dt);

    if (f.act === "ko") {
      f.vx *= Math.exp(-6 * dt);
      if (!(this.mode === "net" && f.isRemote)) this.integrate(f, dt);
      return;
    }
    // net remote fighters are snapshot-driven: interpolate only (no local physics)
    if (this.mode === "net" && f.isRemote) return;
    if (!canFight && !(this.ai && f === this.remote) && f !== this.local) {
      // non-fight phase: idle in place
      f.vx = 0; this.integrate(f, dt); return;
    }

    // stun
    if (f.stunT > 0) {
      f.stunT -= dt;
      this.integrate(f, dt);
      if (f.stunT <= 0 && f.act === "hit") { f.act = "idle"; f.t = 0; }
      return;
    }

    // attack phase machine
    if (f.attacking) {
      const def = ATTACKS[f.attackKind!];
      const spd = f.st.speedMul;
      const total = (def.startup + def.active + def.recover) / spd;
      // forward lunge during active window
      const tScaled = f.t * spd;
      if (tScaled >= def.startup && tScaled < def.startup + def.active) {
        f.vx = f.face * def.lunge * (f.attackKind === "special" ? 2.2 : 1) * (1 / (def.active / spd)) * 0.16;
      } else {
        f.vx *= Math.exp(-10 * dt);
      }
      if (f.t >= total) {
        if (f.queued && f.attackKind === "light") {
          const q = f.queued; f.queued = null; f.attackKind = null; f.act = "idle"; f.t = 0;
          this.startAttack(f, q);
        } else { f.act = "idle"; f.t = 0; f.attackKind = null; }
      }
      this.integrate(f, dt);
      return;
    }

    // dash
    if (f.dashT > 0) {
      f.dashT -= dt;
      f.vx = f.dashDir * C.DASH_V;
      if (f.dashT <= 0) { f.act = "idle"; f.t = 0; }
      this.integrate(f, dt);
      return;
    }

    if (f.act === "win") { f.vx = 0; this.integrate(f, dt); return; }

    // blocking
    f.blockHeld = f.blockHeld && f.onGround;
    if (f.blockHeld && f.onGround) {
      f.act = "block"; f.vx = 0;
      this.integrate(f, dt);
      return;
    } else if (f.act === "block") { f.act = "idle"; f.t = 0; }

    this.integrate(f, dt);
    // anim bookkeeping for movement states
    if (f.onGround && !f.busy) {
      const moving = Math.abs(f.vx) > 30;
      const want = moving ? "walk" : "idle";
      if (f.act !== want) { f.act = want; f.t = 0; }
    } else if (!f.onGround && !f.busy && f.act !== "jump" && f.act !== "fall") {
      f.act = "jump"; f.t = 0;
    }
    if (!f.onGround && f.vy > 260 && f.act === "jump") { f.act = "fall"; f.t = 0; }
  }

  private integrate(f: Fighter, dt: number) {
    if (!f.onGround) f.vy += C.GRAV * dt;
    f.x = clamp(f.x + f.vx * dt, C.WALL, C.W - C.WALL);
    f.y += f.vy * dt;
    if (f.y >= 0) {
      if (!f.onGround) this.events.push({ t: "land", x: f.x, y: 0 });
      f.y = 0; f.vy = 0; f.onGround = true;
      if (f.act === "jump" || f.act === "fall") { f.act = "idle"; f.t = 0; }
    }
  }

  /* ------------- actions ------------- */
  startAttack(f: Fighter, kind: "light" | "heavy" | "special") {
    if (f.busy && !(f.attacking && f.attackKind === "light" && kind !== "light")) return;
    const def = ATTACKS[kind];
    if (kind === "special" && f.en < def.energyCost) return;
    if (kind === "special") f.en -= def.energyCost;
    f.act = kind; f.t = 0; f.attackKind = kind; f.attackHitDone = false; f.queued = null;
    if (def.lunge > 0 && f.onGround) f.vx = f.face * def.lunge;
    this.events.push({ t: "swing", kind, x: f.x, y: f.y - f.height * 0.6 });
    if (kind === "special") this.events.push({ t: "special", x: f.x, y: f.y });
  }

  private stepFighter(f: Fighter, inp: InputFrame, isLocal: boolean) {
    if (this.phase === "end") return;
    if (this.phase !== "fight" && !(this.infiniteHp && this.phase === "ko")) {
      f.blockHeld = false; return;
    }
    if (f.act === "ko" || f.act === "win") { f.blockHeld = false; return; }

    // facing (only when free)
    const opp = this.f[1 - f.slot];
    if (!f.busy && f.stunT <= 0) f.face = opp.x >= f.x ? 1 : -1;

    // buffered chaining: during a connected light attack, queue the next link
    if (f.attacking) {
      const def = ATTACKS[f.attackKind!];
      const inChain = f.t * f.st.speedMul > def.startup;
      if (inChain && f.attackHitDone && f.attackKind === "light") {
        if (inp.pLight) f.queued = "light";
        else if (inp.pHeavy) f.queued = "heavy";
      }
      if (f.attackKind === "light" && inp.pHeavy && inChain) f.queued = "heavy";
    }

    f.blockHeld = inp.block && f.onGround && !f.attacking;

    if (f.stunT > 0 || f.act === "dash") return;

    if (!f.attacking) {
      if (inp.pDash && f.dashCd <= 0 && f.onGround) {
        f.dashT = C.DASH_T; f.dashCd = C.DASH_CD;
        f.dashDir = inp.left ? -1 : inp.right ? 1 : f.face;
        f.invulnT = C.IFRAME; f.act = "dash"; f.t = 0;
        this.events.push({ t: "dash", x: f.x, y: f.y, dir: f.dashDir });
        return;
      }
      if (inp.pSpecial) { this.startAttack(f, "special"); return; }
      if (inp.pHeavy) { this.startAttack(f, "heavy"); return; }
      if (inp.pLight) { this.startAttack(f, "light"); return; }
      if (inp.jump && f.onGround && !f.blockHeld) {
        f.vy = C.JUMP; f.onGround = false; f.act = "jump"; f.t = 0;
        this.events.push({ t: "jump", x: f.x, y: f.y });
      }
    }

    // movement
    if (!f.attacking && !f.blockHeld) {
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const target = dir * C.MOVE * f.st.speedMul;
      const k = f.onGround ? 1 - Math.exp(-18 * 0.016) : 1 - Math.exp(-18 * 0.016 * C.AIR_CTRL);
      f.vx += (target - f.vx) * Math.min(1, k * 3);
    }
  }

  /* ------------- hit resolution (attacker-authoritative) ------------- */
  private resolveAttack(atk: Fighter, vic: Fighter, emit: boolean) {
    if (!atk.attacking || atk.attackHitDone) return;
    const def = ATTACKS[atk.attackKind!];
    const tS = atk.t * atk.st.speedMul;
    if (tS < def.startup || tS >= def.startup + def.active) return;
    if (vic.invulnT > 0 || vic.act === "ko") return;

    // boxes
    const ax = atk.x + atk.face * (atk.width * 0.4 + def.range * 0.5);
    const ay = atk.y - atk.height * 0.58;
    const dx = Math.abs(ax - vic.x);
    const dy = Math.abs(ay - (vic.y - vic.height * 0.55));
    if (dx > def.range * 0.5 + vic.width * 0.5 || dy > def.height * 0.5 + vic.height * 0.28) return;

    atk.attackHitDone = true;
    const dir = atk.face;
    const blocked = vic.blocking && vic.face === -dir && vic.onGround;
    const hitX = vic.x - dir * vic.width * 0.35;
    const hitY = vic.y - vic.height * 0.6;

    if (blocked) {
      const chip = Math.max(1, Math.round(def.dmg * atk.st.dmgMul * vic.st.takenMul * (1 - vic.st.blockEff)));
      atk.en = clamp(atk.en + 4, 0, C.MAX_EN);
      if (this.isAppliedLocally(vic)) {
        vic.hp = clamp(vic.hp - (this.infiniteHp ? 0 : chip), 1, vic.maxHp);
        vic.stunT = Math.max(vic.stunT, 0.12);
        vic.vx = dir * 90;
        this.events.push({ t: "block", x: hitX, y: hitY, dmg: chip, kind: "chip", dir });
      } else {
        this.events.push({ t: "netHit", dmg: chip, kind: "chip", dir, x: hitX, y: hitY });
      }
      return;
    }

    const dmg = Math.max(1, Math.round(def.dmg * atk.st.dmgMul * vic.st.takenMul));
    atk.en = clamp(atk.en + def.enGain, 0, C.MAX_EN);
    vic.en = clamp(vic.en + 5, 0, C.MAX_EN);
    atk.combo += 1; atk.comboT = 1.1;
    atk.maxCombo = Math.max(atk.maxCombo, atk.combo);
    atk.damageDealt += dmg;

    if (this.isAppliedLocally(vic)) {
      vic.hp = clamp(vic.hp - (this.infiniteHp ? 0 : dmg), 0, vic.maxHp);
      vic.perfect = vic.perfect && false;
      vic.flashT = 0.09;
      vic.stunT = def.hitstun;
      vic.act = "hit"; vic.t = 0; vic.attackKind = null;
      vic.vx = dir * def.knockX; vic.vy = def.knockY;
      if (def.knockY < 0) vic.onGround = false;
      this.events.push({ t: "hit", x: hitX, y: hitY, dmg, kind: def.name, combo: atk.combo, dir });
      if (vic.hp <= 0 && this.phase === "fight") this.doKO(vic);
    } else {
      // net: tell the peer to apply it
      this.events.push({ t: "netHit", dmg, kind: def.name, dir, combo: atk.combo, x: hitX, y: hitY });
      this.events.push({ t: "hit", x: hitX, y: hitY, dmg, kind: def.name, combo: atk.combo, dir });
      // authority calls the KO from the last synced hp (keeps round flow host-side)
      if (this.authority && vic.hp - dmg <= 0 && this.phase === "fight") this.doKO(vic);
      else if (!this.authority && vic.hp - dmg <= 0 && this.phase === "fight") this.doKO(vic);
    }
  }

  private isAppliedLocally(vic: Fighter) {
    return this.mode === "training" || vic.slot === this.localSlot;
  }

  private doKO(loser: Fighter) {
    loser.act = "ko"; loser.t = 0; loser.hp = 0;
    loser.vx = -loser.face * 300; loser.vy = -420; loser.onGround = false;
    this.timeScale = 0.28; this.slowmoT = 1.0;
    this.phase = "ko"; this.phaseT = 0;
    this.announce("ko");
    this.events.push({ t: "koFx", x: loser.x, y: loser.y - 70, winner: 1 - loser.slot });
  }

  private timeUp() {
    const [a, b] = this.f;
    const winner = a.hp === b.hp ? (a.en >= b.en ? 0 : 1) : a.hp > b.hp ? 0 : 1;
    if (this.f[winner].hp >= this.f[winner].maxHp) this.perfects[winner]++;
    this.wins[winner]++;
    this.announce("roundEnd", this.round, winner);
    this.phase = "ko"; this.phaseT = 0.9; // shortened
    this.f[winner].act = "win";
  }

  private afterKO() {
    if (this.phase !== "ko") return;
    const winner = this.f[0].hp <= 0 ? 1 : this.f[1].hp <= 0 ? 0 : this.f[0].act === "win" ? 0 : 1;
    if (this.f[0].act !== "win" && this.f[1].act !== "win") {
      if (this.f[winner].hp >= this.f[winner].maxHp) this.perfects[winner]++;
      this.wins[winner]++;
      this.announce("roundEnd", this.round, winner);
      this.f[winner].act = "win"; this.f[winner].t = 0;
    }
    if (this.wins[0] >= C.ROUNDS_TO_WIN || this.wins[1] >= C.ROUNDS_TO_WIN) {
      this.matchWinner = this.wins[0] >= C.ROUNDS_TO_WIN ? 0 : 1;
      this.phase = "end"; this.phaseT = 0;
      this.announce("matchEnd", undefined, this.matchWinner);
    } else {
      this.round++;
      this.resetRound();
      this.announce("round", this.round);
    }
  }

  /* ------------- training AI ------------- */
  private aiDecide(): InputFrame {
    const me = this.remote, you = this.local;
    const out: InputFrame = { ...EMPTY_INPUT, ...this.aiPlan } as InputFrame;
    this.aiPlan = {};
    this.aiThink -= 1 / 60;
    const dist = Math.abs(you.x - me.x);
    const dir = you.x > me.x ? 1 : -1;
    if (this.aiBlockT > 0) { this.aiBlockT -= 1 / 60; out.block = true; return out; }
    if (this.aiThink <= 0) {
      this.aiThink = 0.12 + Math.random() * 0.18;
      const r = Math.random();
      if (you.attacking && dist < 170 && r < 0.35) { this.aiBlockT = 0.35 + Math.random() * 0.25; }
      else if (dist > 150) {
        if (dir > 0) out.right = true; else out.left = true;
        if (r < 0.08) out.jump = true;
        if (r > 0.93 && me.dashCd <= 0) out.pDash = true;
      } else {
        if (r < 0.42) out.pLight = true;
        else if (r < 0.62) out.pHeavy = true;
        else if (r < 0.72 && me.en >= C.SPECIAL_COST) out.pSpecial = true;
        else if (r < 0.85) { this.aiBlockT = 0.3; }
        else { if (dir > 0) out.left = true; else out.right = true; if (r > 0.82) out.pDash = true; }
      }
    }
    return out;
  }
}
