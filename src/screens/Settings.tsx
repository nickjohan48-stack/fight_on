import React from "react";
import { Settings } from "../store";
import { Backdrop } from "../ui/bits";
import { SFX, setVolumes } from "../audio/sfx";
import { KeyCap } from "../ui/bits";

interface Props { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }

export default function SettingsScreen({ settings, onChange, onBack }: Props) {
  const set = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    setVolumes(next.sfx, next.music, next.muted);
  };

  return (
    <Backdrop>
      <div className="mx-auto flex min-h-screen max-w-[760px] flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <button className="btn btn-ghost px-4 py-2 text-[12px]" onClick={() => { SFX.back(); onBack(); }}>← Back</button>
          <h2 className="font-disp text-[28px] text-white">SYS<span className="text-[var(--cy)] text-glow-cy">CONFIG</span></h2>
          <div className="w-[76px]" />
        </header>

        <div className="mt-8 flex flex-col gap-6">
          <div className="panel">
            <div className="panel-title">AUDIO</div>
            <div className="flex flex-col gap-5 p-6">
              <label className="flex items-center justify-between">
                <span className="text-[13px] tracking-widest text-[var(--dim)]">MASTER MUTE</span>
                <button
                  className={`btn px-5 py-2 text-[12px] ${settings.muted ? "btn-danger" : ""}`}
                  onClick={() => { SFX.click(); set({ muted: !settings.muted }); }}
                >
                  {settings.muted ? "MUTED" : "ON"}
                </button>
              </label>
              <div>
                <div className="mb-2 flex justify-between text-[12px] tracking-widest text-[var(--dim)]">
                  <span>SFX VOLUME</span><span className="text-white">{Math.round(settings.sfx * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={settings.sfx} onChange={(e) => set({ sfx: +e.target.value })} />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[12px] tracking-widest text-[var(--dim)]">
                  <span>MUSIC VOLUME</span><span className="text-white">{Math.round(settings.music * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={settings.music} onChange={(e) => set({ music: +e.target.value })} />
              </div>
              <button className="btn btn-ghost w-[180px] justify-center px-4 py-2 text-[12px]" onClick={() => { SFX.hitHeavy(); SFX.win(); }}>
                Test Sound
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">GAME FEEL</div>
            <div className="flex items-center justify-between p-6">
              <div>
                <div className="text-[13px] tracking-widest text-[var(--ink)]">SCREEN SHAKE</div>
                <div className="text-[11px] text-[var(--dim)]">Camera impact on hits and KOs</div>
              </div>
              <button className={`btn px-5 py-2 text-[12px] ${settings.shake ? "" : "btn-ghost"}`} onClick={() => { SFX.click(); set({ shake: !settings.shake }); }}>
                {settings.shake ? "ENABLED" : "DISABLED"}
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">CONTROL MAP</div>
            <div className="grid grid-cols-2 gap-x-10 gap-y-3 p-6 sm:grid-cols-3">
              <KeyCap k="A / D" label="Move" />
              <KeyCap k="W" label="Jump" />
              <KeyCap k="S" label="Block" />
              <KeyCap k="J" label="Light attack" />
              <KeyCap k="K" label="Heavy attack" />
              <KeyCap k="L" label="Special (50 EN)" />
              <KeyCap k="SPACE" label="Dash (i-frames)" />
              <KeyCap k="J·J·K" label="Combo chain" />
              <KeyCap k="PAD" label="Gamepad supported" />
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
