/* ============================================================
   NEONCLASH — player profile / progression / settings store
   ============================================================ */
import { defaultFighter, FighterConfig } from "./game/defs";

export interface Profile {
  name: string;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  matches: number;
  highestCombo: number;
  totalDamage: number;
  perfects: number;
  fighter: FighterConfig;
}

export interface Settings {
  sfx: number; music: number; muted: boolean; shake: boolean;
}

const PKEY = "neonclash.profile.v1";
const SKEY = "neonclash.settings.v1";

export function xpForLevel(level: number) { return 100 + (level - 1) * 60; }

const NAME_POOL = ["Vex", "Onyx", "Sable", "Kiro", "Nyra", "Dant", "Zuri", "Rook", "Hexa", "Mira", "Volt", "Kess"];

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PKEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...blank(), ...p, fighter: { ...defaultFighter(), ...p.fighter } };
    }
  } catch { /* ignore */ }
  return blank();
}

function blank(): Profile {
  return {
    name: NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)] + "-" + Math.floor(100 + Math.random() * 900),
    level: 1, xp: 0, wins: 0, losses: 0, matches: 0,
    highestCombo: 0, totalDamage: 0, perfects: 0,
    fighter: defaultFighter(),
  };
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SKEY);
    if (raw) return { ...{ sfx: 0.8, music: 0.5, muted: false, shake: true }, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { sfx: 0.8, music: 0.5, muted: false, shake: true };
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export interface XpResult { gained: number; leveledUp: boolean; newLevel: number; breakdown: { label: string; v: number }[] }

export function awardXp(p: Profile, won: boolean, perfects: number, maxCombo: number): XpResult {
  const breakdown: { label: string; v: number }[] = [];
  let gained = 0;
  const base = won ? 100 : 30;
  breakdown.push({ label: won ? "VICTORY" : "DEFEAT", v: base }); gained += base;
  if (won && perfects > 0) { const b = 50 * perfects; breakdown.push({ label: `PERFECT ×${perfects}`, v: b }); gained += b; }
  if (maxCombo >= 5) { const b = maxCombo * 5; breakdown.push({ label: `${maxCombo}-HIT COMBO`, v: b }); gained += b; }
  let xp = p.xp + gained;
  let level = p.level; let leveledUp = false;
  while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++; leveledUp = true; }
  return { gained, leveledUp, newLevel: level, breakdown };
}

/* simulated live-online counter for the lobby ticker */
export function onlineCount(): number {
  const base = 118 + Math.floor(Math.sin(Date.now() / 60000) * 14);
  return base + Math.floor(Math.random() * 9);
}
