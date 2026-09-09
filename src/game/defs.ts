/* ============================================================
   NEONCLASH — shared game definitions (client + optional server)
   ============================================================ */

export type BodyType = "lean" | "athletic" | "heavy";
export type HairStyle = "none" | "buzz" | "mohawk" | "spike" | "long" | "bun";
export type Accessory = "none" | "visor" | "scarf" | "band";
export type StyleId = "balanced" | "speed" | "power" | "defense";
export type ArenaId = "neon" | "dojo" | "under" | "roof";

export interface FighterConfig {
  name: string;
  body: BodyType;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  eyeColor: string;
  outfit: string;
  outfitTrim: string;
  glove: string;
  shoe: string;
  accessory: Accessory;
  style: StyleId;
}

export interface StyleStats {
  id: StyleId;
  label: string;
  tag: string;
  desc: string;
  aura: string;
  speedMul: number;   // movement + attack speed
  dmgMul: number;     // outgoing damage
  takenMul: number;   // incoming damage
  maxHp: number;
  blockEff: number;   // 0..1 damage blocked
  bars: { spd: number; pow: number; def: number }; // 1..5 UI
}

export const STYLES: Record<StyleId, StyleStats> = {
  balanced: {
    id: "balanced", label: "Balanced", tag: "ALL-ROUNDER",
    desc: "No weakness, no gimmick. Honest fists, honest damage.",
    aura: "#25e0ff", speedMul: 1.0, dmgMul: 1.0, takenMul: 1.0,
    maxHp: 100, blockEff: 0.7, bars: { spd: 3, pow: 3, def: 3 },
  },
  speed: {
    id: "speed", label: "Speed", tag: "BLITZ",
    desc: "Fast movement, rapid jabs, light arms. Hit and don't get hit.",
    aura: "#7dff5a", speedMul: 1.28, dmgMul: 0.82, takenMul: 1.1,
    maxHp: 88, blockEff: 0.6, bars: { spd: 5, pow: 2, def: 2 },
  },
  power: {
    id: "power", label: "Power", tag: "BREAKER",
    desc: "Slow boots, heavy hands. Every clean hit is a crisis.",
    aura: "#ff2e63", speedMul: 0.82, dmgMul: 1.35, takenMul: 1.0,
    maxHp: 104, blockEff: 0.65, bars: { spd: 2, pow: 5, def: 3 },
  },
  defense: {
    id: "defense", label: "Defense", tag: "BASTION",
    desc: "Deep health pool, iron guard. Wins the war of attrition.",
    aura: "#ffc94d", speedMul: 0.94, dmgMul: 0.88, takenMul: 0.82,
    maxHp: 122, blockEff: 0.85, bars: { spd: 3, pow: 2, def: 5 },
  },
};

export const BODY_INFO: Record<BodyType, { label: string; scale: number; bulk: number }> = {
  lean: { label: "Lean", scale: 0.92, bulk: 0.82 },
  athletic: { label: "Athletic", scale: 1.0, bulk: 1.0 },
  heavy: { label: "Heavy", scale: 1.08, bulk: 1.28 },
};

/* ---------------- palettes for the creator ---------------- */
export const SKINS = ["#f2c9a0", "#e0ac7e", "#c68863", "#a26a4a", "#7c4a30", "#5a3521", "#9db4c0", "#7ee0d2"];
export const HAIR_COLORS = ["#17181d", "#4a2e1c", "#8a5a2b", "#d8b25a", "#e8e6e0", "#ff2e63", "#25e0ff", "#7dff5a"];
export const EYE_COLORS = ["#1c2430", "#25e0ff", "#ff2e63", "#ffc94d", "#7dff5a", "#c07dff"];
export const OUTFITS = ["#20242e", "#2e1e33", "#173042", "#3c1f24", "#1e3a2a", "#402c14", "#101418", "#4a1e4a"];
export const TRIMS = ["#25e0ff", "#ff2e63", "#ffc94d", "#7dff5a", "#c07dff", "#e8e6e0"];
export const GLOVES = ["#c2273b", "#1d6fe0", "#e8e6e0", "#17181d", "#ffc94d", "#7dff5a"];
export const SHOES = ["#17181d", "#e8e6e0", "#c2273b", "#1d6fe0", "#ffc94d", "#25e0ff"];
export const HAIR_LABELS: Record<HairStyle, string> = {
  none: "Shaved", buzz: "Buzz", mohawk: "Mohawk", spike: "Spiked", long: "Long", bun: "Topknot",
};
export const ACC_LABELS: Record<Accessory, string> = {
  none: "None", visor: "Visor", scarf: "War Scarf", band: "Headband",
};

/* ---------------- combat tuning ---------------- */
export const C = {
  W: 1280, H: 720, FLOOR: 608, WALL: 64,
  GRAV: 3000, MOVE: 350, JUMP: -1040, AIR_CTRL: 0.72,
  DASH_V: 880, DASH_T: 0.17, DASH_CD: 0.75, IFRAME: 0.13,
  SPECIAL_COST: 50, MAX_EN: 100, ROUND_TIME: 60, ROUNDS_TO_WIN: 2,
};

export interface AttackDef {
  name: "light" | "heavy" | "special";
  startup: number; active: number; recover: number;
  dmg: number; range: number; height: number;
  hitstun: number; knockX: number; knockY: number;
  lunge: number; energyCost: number; enGain: number; shake: number;
}

export const ATTACKS: Record<"light" | "heavy" | "special", AttackDef> = {
  light: {
    name: "light", startup: 0.07, active: 0.10, recover: 0.16,
    dmg: 6, range: 96, height: 78, hitstun: 0.30, knockX: 150, knockY: -60,
    lunge: 130, energyCost: 0, enGain: 7, shake: 3,
  },
  heavy: {
    name: "heavy", startup: 0.21, active: 0.13, recover: 0.32,
    dmg: 13, range: 118, height: 92, hitstun: 0.48, knockX: 430, knockY: -300,
    lunge: 150, energyCost: 0, enGain: 11, shake: 8,
  },
  special: {
    name: "special", startup: 0.15, active: 0.20, recover: 0.36,
    dmg: 19, range: 150, height: 110, hitstun: 0.6, knockX: 560, knockY: -420,
    lunge: 470, energyCost: C.SPECIAL_COST, enGain: 0, shake: 13,
  },
};

export const ARENAS: { id: ArenaId; name: string; sub: string; sky: [string, string] }[] = [
  { id: "neon", name: "Neon District", sub: "Sector 7 · rain line", sky: ["#050818", "#0d1b3a"] },
  { id: "dojo", name: "Crimson Dojo", sub: "Old mountain gate", sky: ["#160b10", "#3d1620"] },
  { id: "under", name: "The Underpit", sub: "Level -13 · no rules", sky: ["#0a0708", "#241015"] },
  { id: "roof", name: "Skyline Rooftop", sub: "Tower 88 · 312m up", sky: ["#040714", "#12224a"] },
];

/* ---------------- runtime state ---------------- */
export type ActionId =
  | "idle" | "walk" | "jump" | "fall" | "dash"
  | "light" | "heavy" | "special" | "hit" | "block" | "ko" | "win";

export interface Snapshot {
  x: number; y: number; vx: number; vy: number;
  face: number; act: ActionId; t: number;
  hp: number; en: number; onG: boolean; block: boolean;
}

export interface GameEvent {
  t: string; x?: number; y?: number; dmg?: number; kind?: string;
  combo?: number; dir?: number; winner?: number; n?: number;
}

export interface InputFrame {
  left: boolean; right: boolean; jump: boolean; block: boolean;
  pLight: boolean; pHeavy: boolean; pSpecial: boolean; pDash: boolean; // pressed-this-frame
}

export const EMPTY_INPUT: InputFrame = {
  left: false, right: false, jump: false, block: false,
  pLight: false, pHeavy: false, pSpecial: false, pDash: false,
};

export interface MatchStats {
  damage: number; maxCombo: number; roundsWon: number; perfects: number;
}

export function defaultFighter(): FighterConfig {
  return {
    name: "Rookie", body: "athletic", skin: SKINS[1], hair: "spike",
    hairColor: HAIR_COLORS[0], eyeColor: "#25e0ff", outfit: OUTFITS[2],
    outfitTrim: TRIMS[0], glove: GLOVES[0], shoe: SHOES[0],
    accessory: "band", style: "balanced",
  };
}
