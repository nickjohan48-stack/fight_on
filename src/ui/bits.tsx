import React, { useEffect, useRef } from "react";
import { FighterConfig } from "../game/defs";
import { drawPreview } from "../render/draw";

/* Animated fighter preview used on Home / Creator / Profile / VS */
export function FighterPreview({
  cfg, w = 220, h = 260, cycle = true, action = "idle", className = "",
}: {
  cfg: FighterConfig; w?: number; h?: number; cycle?: boolean; action?: string; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const actRef = useRef(action); actRef.current = action;
  const cycleRef = useRef(cycle); cycleRef.current = cycle;

  useEffect(() => {
    const cv = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    let raf = 0;
    const seq = ["idle", "walk", "light", "heavy", "special", "block", "jump"];
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const act = cycleRef.current ? seq[Math.floor(t / 1.1) % seq.length] : actRef.current;
      drawPreview(ctx, cfgRef.current, w, h, t, act);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w, h]);

  return <canvas ref={ref} style={{ width: w, height: h }} className={className} />;
}

/* layered ambient backdrop for menu screens */
export function Backdrop({ children, tint = "cyan" }: { children: React.ReactNode; tint?: "cyan" | "red" }) {
  const embers = useRef(
    Array.from({ length: 16 }, (_, i) => ({
      left: (i * 61) % 100, delay: (i * 0.9) % 7, dur: 7 + (i % 5) * 2, size: 2 + (i % 3),
      color: i % 4 === 0 ? "#ff2e63" : i % 3 === 0 ? "#ffc94d" : "#25e0ff",
    })),
  );
  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: "radial-gradient(1100px 600px at 50% -10%, #0e1a3a 0%, #05070f 60%)" }}>
      <div className="bg-grid absolute inset-0" />
      <div className="glow-orb" style={{ width: 520, height: 520, left: "-140px", top: "12%", background: tint === "cyan" ? "#0e6d86" : "#7a1230" }} />
      <div className="glow-orb" style={{ width: 460, height: 460, right: "-120px", bottom: "-6%", background: "#7a1230", opacity: 0.22 }} />
      <div className="bg-scan absolute inset-0 z-[1]" />
      {embers.current.map((e, i) => (
        <span
          key={i}
          className="absolute bottom-[-10px] rounded-full"
          style={{
            left: `${e.left}%`, width: e.size, height: e.size, background: e.color,
            boxShadow: `0 0 8px ${e.color}`, animation: `emberRise ${e.dur}s linear ${e.delay}s infinite`, opacity: 0,
          }}
        />
      ))}
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}

export function StatPips({ v, color }: { v: number; color: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-2 w-4"
          style={{
            background: i <= v ? color : "rgba(120,150,210,0.15)",
            clipPath: "polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)",
            boxShadow: i <= v ? `0 0 8px ${color}` : "none",
          }}
        />
      ))}
    </div>
  );
}

export function KeyCap({ k, label }: { k: string; label?: string }) {
  return (
    <span className="flex items-center gap-2 text-[12px] text-[var(--dim)]">
      <span className="kbd">{k}</span> {label}
    </span>
  );
}
