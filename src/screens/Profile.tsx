import React from "react";
import { Profile, xpForLevel } from "../store";
import { STYLES } from "../game/defs";
import { Backdrop, FighterPreview, StatPips } from "../ui/bits";
import { SFX } from "../audio/sfx";

export default function ProfileScreen({ profile, onBack, onEdit }: { profile: Profile; onBack: () => void; onEdit: () => void }) {
  const wr = profile.matches ? Math.round((profile.wins / profile.matches) * 100) : 0;
  const xpNeed = xpForLevel(profile.level);
  const style = STYLES[profile.fighter.style];

  const stats = [
    { l: "LEVEL", v: profile.level, c: "var(--cy)" },
    { l: "WINS", v: profile.wins, c: "var(--grn)" },
    { l: "LOSSES", v: profile.losses, c: "var(--mg)" },
    { l: "WIN RATE", v: `${wr}%`, c: "var(--cy)" },
    { l: "MATCHES", v: profile.matches, c: "#fff" },
    { l: "HIGHEST COMBO", v: profile.highestCombo, c: "var(--gold)" },
    { l: "TOTAL DAMAGE", v: profile.totalDamage.toLocaleString(), c: "var(--mg)" },
    { l: "PERFECT ROUNDS", v: profile.perfects, c: "var(--grn)" },
  ];

  return (
    <Backdrop tint="red">
      <div className="mx-auto flex min-h-screen max-w-[980px] flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <button className="btn btn-ghost px-4 py-2 text-[12px]" onClick={() => { SFX.back(); onBack(); }}>← Back</button>
          <h2 className="font-disp text-[28px] text-white">PILOT <span className="text-[var(--gold)] text-glow-gold">RECORD</span></h2>
          <button className="btn px-4 py-2 text-[12px]" onClick={() => { SFX.click(); onEdit(); }}>Edit Fighter</button>
        </header>

        <div className="mt-8 grid flex-1 grid-cols-1 gap-6 md:grid-cols-[340px_1fr]">
          {/* showcase */}
          <div className="panel flex flex-col">
            <div className="panel-title">FIGHTER SHOWCASE</div>
            <div className="relative flex flex-1 items-center justify-center py-6"
              style={{ background: "radial-gradient(240px 200px at 50% 75%, rgba(255,46,99,0.1), transparent)" }}>
              <FighterPreview cfg={profile.fighter} w={260} h={310} />
            </div>
            <div className="border-t border-[rgba(37,224,255,0.14)] p-4">
              <div className="font-disp text-[20px] text-white">{profile.fighter.name}</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-[var(--dim)]">
                PILOT {profile.name} · <span style={{ color: style.aura }}>{style.label.toUpperCase()} {style.tag}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] tracking-widest text-[var(--dim)]">SPEED <StatPips v={style.bars.spd} color={style.aura} /></div>
                <div className="flex items-center justify-between text-[10px] tracking-widest text-[var(--dim)]">POWER <StatPips v={style.bars.pow} color={style.aura} /></div>
                <div className="flex items-center justify-between text-[10px] tracking-widest text-[var(--dim)]">DEFENSE <StatPips v={style.bars.def} color={style.aura} /></div>
              </div>
            </div>
          </div>

          {/* stats */}
          <div className="flex flex-col gap-6">
            <div className="panel">
              <div className="panel-title">PROGRESSION</div>
              <div className="p-5">
                <div className="flex items-baseline justify-between">
                  <span className="font-disp text-[40px] text-white">LV {profile.level}</span>
                  <span className="text-[12px] tracking-widest text-[var(--dim)]">{profile.xp} / {xpNeed} XP TO NEXT</span>
                </div>
                <div className="bar-track mt-2 h-[16px]">
                  <div className="bar-fill bar-en" style={{ width: `${Math.min(100, (profile.xp / xpNeed) * 100)}%` }} />
                </div>
                <div className="mt-2 text-[11px] tracking-wider text-[var(--dim)]">
                  WIN +100 XP · LOSS +30 XP · PERFECT ROUND +50 · 5+ HIT COMBO BONUS
                </div>
              </div>
            </div>

            <div className="panel flex-1">
              <div className="panel-title">COMBAT RECORD</div>
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
                {stats.map((s, i) => (
                  <div key={s.l} className="anim-rise border border-[rgba(37,224,255,0.14)] bg-[rgba(10,16,32,0.6)] px-2 py-4 text-center" style={{ animationDelay: `${i * 0.04}s` }}>
                    <div className="font-disp text-[26px]" style={{ color: s.c }}>{s.v}</div>
                    <div className="mt-1 text-[9px] tracking-[0.18em] text-[var(--dim)]">{s.l}</div>
                  </div>
                ))}
              </div>
              {profile.matches === 0 && (
                <div className="px-5 pb-5 text-center text-[12px] tracking-widest text-[var(--dim)]">
                  NO MATCHES ON RECORD — THE GRID IS WAITING, PILOT.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
