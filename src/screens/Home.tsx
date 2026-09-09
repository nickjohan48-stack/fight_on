import React from "react";
import { Profile, xpForLevel } from "../store";
import { STYLES } from "../game/defs";
import { Backdrop, FighterPreview } from "../ui/bits";
import { SFX } from "../audio/sfx";

interface Props {
  profile: Profile;
  online: number;
  onNav: (s: string) => void;
}

const TICKER = [
  "SEASON 03 // RANKED LADDER RESET IN 6 DAYS",
  "NEW ARENA: SKYLINE ROOFTOP NOW LIVE",
  "PATCH 0.3.1 — DASH I-FRAMES 0.13s",
  "TOP CLIMBER: NYRA-412 · 27 WIN STREAK",
  "THE UNDERPIT AWAITS · LEVEL -13",
  "COMBO RECORD: 14 HITS · HELD BY VOLT-77",
];

export default function Home({ profile, online, onNav }: Props) {
  const xpNeed = xpForLevel(profile.level);
  const wr = profile.matches ? Math.round((profile.wins / profile.matches) * 100) : 0;
  const style = STYLES[profile.fighter.style];

  const go = (s: string) => { SFX.click(); onNav(s); };

  return (
    <Backdrop>
      <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-6 py-6">
        {/* top strip */}
        <div className="flex items-center justify-between text-[11px] tracking-[0.25em] text-[var(--dim)]">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-[pulseGlow_1.6s_infinite] rounded-full bg-[var(--grn)] shadow-[0_0_8px_var(--grn)]" />
            SERVERS ONLINE · {online} FIGHTERS CONNECTED
          </span>
          <span>v0.3.1 · BUILD 4821</span>
        </div>

        <div className="grid flex-1 grid-cols-1 items-center gap-8 py-6 lg:grid-cols-[1.25fr_1fr]">
          {/* left: logo + menu */}
          <div>
            <div className="anim-rise">
              <div className="font-disp text-[13px] tracking-[0.6em] text-[var(--mg)]">SEASON 03 · ONLINE VERSUS</div>
              <h1 className="font-disp mt-2 text-[64px] leading-[0.95] text-white sm:text-[86px]">
                NEON<span className="text-[var(--cy)] text-glow-cy">CLASH</span>
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <span className="h-[3px] w-16 bg-[var(--mg)] shadow-[0_0_10px_var(--mg)]" />
                <p className="max-w-[420px] text-[14px] leading-relaxed text-[var(--dim)]">
                  Forge a fighter. Read the neutral. Land the heavy. Best-of-three,
                  first to crumble loses the strip.
                </p>
              </div>
            </div>

            <nav className="mt-9 flex max-w-[420px] flex-col gap-3">
              <button className="btn btn-big anim-rise" style={{ animationDelay: "0.05s" }} onClick={() => go("lobby")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12h12m0 0-4-4m4 4-4 4M20 4v16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" /></svg>
                Play Online
                <span className="ml-auto text-[10px] text-[var(--cy)]">RANKED · 1v1</span>
              </button>
              <button className="btn btn-gold anim-rise" style={{ animationDelay: "0.1s" }} onClick={() => go("creator")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" /></svg>
                Create Fighter
              </button>
              <button className="btn anim-rise" style={{ animationDelay: "0.15s" }} onClick={() => go("training")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></svg>
                Training
                <span className="ml-auto text-[10px] text-[var(--dim)]">VS CPU</span>
              </button>
              <div className="flex gap-3">
                <button className="btn btn-ghost flex-1 anim-rise" style={{ animationDelay: "0.2s" }} onClick={() => go("profile")}>Profile</button>
                <button className="btn btn-ghost flex-1 anim-rise" style={{ animationDelay: "0.24s" }} onClick={() => go("settings")}>Settings</button>
              </div>
            </nav>
          </div>

          {/* right: pilot card */}
          <div className="panel anim-rise p-0" style={{ animationDelay: "0.12s" }}>
            <div className="panel-title">PILOT DOSSIER</div>
            <div className="flex gap-4 p-5">
              <div className="relative shrink-0 overflow-hidden" style={{ background: "radial-gradient(140px 120px at 50% 80%, rgba(37,224,255,0.14), transparent)" }}>
                <FighterPreview cfg={profile.fighter} w={190} h={230} />
                <div className="absolute bottom-1 left-0 right-0 text-center font-disp text-[10px] tracking-[0.3em]" style={{ color: style.aura }}>
                  {style.tag}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-disp truncate text-[22px] text-white">{profile.fighter.name || profile.name}</div>
                <div className="text-[12px] tracking-widest text-[var(--dim)]">PILOT · {profile.name}</div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-[11px] tracking-widest text-[var(--dim)]">
                    <span>LEVEL <b className="font-disp text-[18px] text-[var(--cy)]">{profile.level}</b></span>
                    <span>{profile.xp} / {xpNeed} XP</span>
                  </div>
                  <div className="bar-track mt-1 h-[10px]">
                    <div className="bar-fill bar-en" style={{ width: `${Math.min(100, (profile.xp / xpNeed) * 100)}%` }} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    { l: "WINS", v: profile.wins, c: "var(--grn)" },
                    { l: "LOSSES", v: profile.losses, c: "var(--mg)" },
                    { l: "WIN RATE", v: `${wr}%`, c: "var(--cy)" },
                  ].map((s) => (
                    <div key={s.l} className="border border-[rgba(37,224,255,0.14)] bg-[rgba(10,16,32,0.6)] px-1 py-2">
                      <div className="font-disp text-[20px]" style={{ color: s.c }}>{s.v}</div>
                      <div className="text-[9px] tracking-[0.22em] text-[var(--dim)]">{s.l}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--dim)]">
                  <span>HIGHEST COMBO <b className="text-[var(--gold)]">{profile.highestCombo}</b></span>
                  <span>MATCHES <b className="text-white">{profile.matches}</b></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ticker */}
        <div className="relative -mx-6 overflow-hidden border-t border-[rgba(37,224,255,0.16)] bg-[rgba(6,9,18,0.8)] py-2">
          <div className="flex w-max whitespace-nowrap" style={{ animation: "tickerMove 26s linear infinite" }}>
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="mx-6 text-[11px] tracking-[0.22em] text-[var(--dim)]">
                <span className="mr-6 text-[var(--mg)]">▰</span>{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
