import React, { useState } from "react";
import {
  ACC_LABELS, Accessory, BODY_INFO, BodyType, EYE_COLORS, FighterConfig, GLOVES,
  HAIR_COLORS, HAIR_LABELS, HairStyle, OUTFITS, SHOES, SKINS, STYLES, StyleId, TRIMS,
} from "../game/defs";
import { Backdrop, FighterPreview, StatPips } from "../ui/bits";
import { SFX } from "../audio/sfx";

interface Props {
  initial: FighterConfig;
  onSave: (cfg: FighterConfig) => void;
  onBack: () => void;
}

function Swatches({ colors, value, onPick, small }: { colors: string[]; value: string; onPick: (c: string) => void; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => { SFX.hover(); onPick(c); }}
          className={`transition-transform hover:scale-110 ${small ? "h-6 w-6" : "h-8 w-8"}`}
          style={{
            background: c, border: value === c ? "2px solid #fff" : "1px solid rgba(255,255,255,0.2)",
            boxShadow: value === c ? `0 0 12px ${c}` : "none",
            clipPath: "polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)",
          }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function Seg<T extends string>({ opts, value, onPick }: { opts: { v: T; l: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => { SFX.hover(); onPick(o.v); }}
          className={`px-3 py-1.5 text-[12px] font-semibold tracking-wider transition-all ${value === o.v ? "bg-[var(--cy)] text-[#04121a] shadow-[0_0_14px_rgba(37,224,255,0.5)]" : "bg-[rgba(16,24,46,0.8)] text-[var(--dim)] hover:text-white"}`}
          style={{ clipPath: "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)" }}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-2 text-[10px] font-bold tracking-[0.28em] text-[var(--dim)]">{label}</div>
      {children}
    </div>
  );
}

export default function Creator({ initial, onSave, onBack }: Props) {
  const [cfg, setCfg] = useState<FighterConfig>({ ...initial });
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<FighterConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const style = STYLES[cfg.style];

  const save = () => {
    SFX.click();
    onSave({ ...cfg, name: cfg.name.trim() || "Unnamed" });
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  return (
    <Backdrop tint="red">
      <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div>
            <button className="btn btn-ghost px-4 py-2 text-[12px]" onClick={() => { SFX.back(); onBack(); }}>← Back</button>
          </div>
          <div className="text-center">
            <h2 className="font-disp text-[30px] text-white">FIGHTER <span className="text-[var(--mg)] text-glow-mg">FORGE</span></h2>
            <div className="text-[10px] tracking-[0.4em] text-[var(--dim)]">CUSTOMIZE · COMPILE · COMBAT</div>
          </div>
          <button className={`btn ${saved ? "btn-gold" : ""} px-6 py-3`} onClick={save}>
            {saved ? "✓ SAVED" : "Save Fighter"}
          </button>
        </header>

        <div className="mt-6 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* options */}
          <div className="panel">
            <div className="panel-title">APPEARANCE MATRIX</div>
            <div className="grid grid-cols-1 gap-x-8 px-6 py-2 sm:grid-cols-2">
              <Row label="CALLSIGN">
                <input
                  type="text" maxLength={14} value={cfg.name}
                  onChange={(e) => set({ name: e.target.value })}
                  className="w-full font-disp text-[15px] tracking-wider"
                  placeholder="FIGHTER NAME"
                />
              </Row>
              <Row label="BODY TYPE">
                <Seg
                  opts={(Object.keys(BODY_INFO) as BodyType[]).map((b) => ({ v: b, l: BODY_INFO[b].label }))}
                  value={cfg.body} onPick={(body) => set({ body })}
                />
              </Row>
              <Row label="SKIN TONE"><Swatches colors={SKINS} value={cfg.skin} onPick={(skin) => set({ skin })} /></Row>
              <Row label="HAIR STYLE">
                <Seg
                  opts={(Object.keys(HAIR_LABELS) as HairStyle[]).map((h) => ({ v: h, l: HAIR_LABELS[h] }))}
                  value={cfg.hair} onPick={(hair) => set({ hair })}
                />
              </Row>
              <Row label="HAIR COLOR"><Swatches colors={HAIR_COLORS} value={cfg.hairColor} onPick={(hairColor) => set({ hairColor })} /></Row>
              <Row label="EYES"><Swatches colors={EYE_COLORS} value={cfg.eyeColor} onPick={(eyeColor) => set({ eyeColor })} small /></Row>
              <Row label="OUTFIT"><Swatches colors={OUTFITS} value={cfg.outfit} onPick={(outfit) => set({ outfit })} /></Row>
              <Row label="OUTFIT TRIM"><Swatches colors={TRIMS} value={cfg.outfitTrim} onPick={(outfitTrim) => set({ outfitTrim })} small /></Row>
              <Row label="GLOVES"><Swatches colors={GLOVES} value={cfg.glove} onPick={(glove) => set({ glove })} small /></Row>
              <Row label="BOOTS"><Swatches colors={SHOES} value={cfg.shoe} onPick={(shoe) => set({ shoe })} small /></Row>
              <Row label="ACCESSORY">
                <Seg
                  opts={(Object.keys(ACC_LABELS) as Accessory[]).map((a) => ({ v: a, l: ACC_LABELS[a] }))}
                  value={cfg.accessory} onPick={(accessory) => set({ accessory })}
                />
              </Row>
            </div>
          </div>

          {/* right col: preview + style */}
          <div className="flex flex-col gap-6">
            <div className="panel flex-1">
              <div className="panel-title">LIVE COMPILE</div>
              <div className="relative flex items-center justify-center py-4"
                style={{ background: "radial-gradient(220px 180px at 50% 78%, rgba(37,224,255,0.12), transparent)" }}>
                <FighterPreview cfg={cfg} w={260} h={300} />
              </div>
              <div className="border-t border-[rgba(37,224,255,0.14)] px-5 py-3 text-center">
                <span className="font-disp text-[18px] text-white">{cfg.name || "UNNAMED"}</span>
                <span className="ml-3 text-[10px] tracking-[0.3em]" style={{ color: style.aura }}>{style.tag}</span>
              </div>
            </div>

            <div className="panel panel-red">
              <div className="panel-title" style={{ color: "var(--mg)" }}>FIGHTING STYLE</div>
              <div className="grid grid-cols-2 gap-2 p-4">
                {(Object.keys(STYLES) as StyleId[]).map((id) => {
                  const s = STYLES[id];
                  const sel = cfg.style === id;
                  return (
                    <button
                      key={id}
                      onClick={() => { SFX.hover(); set({ style: id }); }}
                      className="p-3 text-left transition-all"
                      style={{
                        background: sel ? `linear-gradient(160deg, ${s.aura}22, rgba(8,12,26,0.9))` : "rgba(10,16,32,0.7)",
                        border: `1px solid ${sel ? s.aura : "rgba(120,150,210,0.2)"}`,
                        boxShadow: sel ? `0 0 16px -4px ${s.aura}` : "none",
                        clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)",
                      }}
                    >
                      <div className="font-disp text-[13px]" style={{ color: sel ? s.aura : "#fff" }}>{s.label}</div>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[9px] tracking-widest text-[var(--dim)]">SPD<StatPips v={s.bars.spd} color={s.aura} /></div>
                        <div className="flex items-center justify-between text-[9px] tracking-widest text-[var(--dim)]">POW<StatPips v={s.bars.pow} color={s.aura} /></div>
                        <div className="flex items-center justify-between text-[9px] tracking-widest text-[var(--dim)]">DEF<StatPips v={s.bars.def} color={s.aura} /></div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-[rgba(255,46,99,0.16)] px-4 py-3 text-[12px] leading-relaxed text-[var(--dim)]">
                <b style={{ color: style.aura }}>{style.label} —</b> {style.desc}
                <div className="mt-1 text-[10px] tracking-wider">
                  HP {style.maxHp} · DMG ×{style.dmgMul.toFixed(2)} · SPD ×{style.speedMul.toFixed(2)} · BLOCK {Math.round(style.blockEff * 100)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
