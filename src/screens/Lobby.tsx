import React, { useEffect, useRef, useState } from "react";
import { Profile, onlineCount } from "../store";
import { Backdrop, FighterPreview } from "../ui/bits";
import { MatchSession, code5, hostRoom, joinRoom, quickMatch, sanitizeCode, Cancelable } from "../net/peer";
import { SFX } from "../audio/sfx";
import { STYLES, ARENAS } from "../game/defs";

interface Props {
  profile: Profile;
  online: number;
  onBack: () => void;
  onMatched: (s: MatchSession) => void;
}

type Phase = "menu" | "search" | "wait" | "join" | "vs";

export default function Lobby({ profile, online, onBack, onMatched }: Props) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [status, setStatus] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [err, setErr] = useState("");
  const [opp, setOpp] = useState<{ name: string; level: number } | null>(null);
  const cancelRef = useRef<Cancelable<MatchSession> | null>(null);
  const sessionRef = useRef<MatchSession | null>(null);
  const mounted = useRef(true);

  const me = { name: profile.name, level: profile.level, fighter: profile.fighter };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelRef.current?.cancel(); };
  }, []);

  const begin = (c: Cancelable<MatchSession>) => {
    cancelRef.current = c;
    c.promise
      .then((session) => {
        if (!mounted.current) { session.close(); return; }
        cancelRef.current = null; // hand the live session off — don't kill it on unmount
        sessionRef.current = session;
        SFX.matchFound();
        setOpp({ name: session.opp.name, level: session.opp.level });
        setPhase("vs");
        setTimeout(() => { if (mounted.current) onMatched(session); }, 3000);
      })
      .catch((e) => {
        if (!mounted.current || e?.message === "cancelled") return;
        setErr(e?.message === "room-not-found" ? "ROOM NOT FOUND — CHECK THE CODE" :
          e?.message === "code-in-use" ? "THAT ROOM CODE IS TAKEN — TRY ANOTHER" :
          e?.message === "handshake timeout" ? "CONNECTION STALLED — TRY AGAIN" :
          e?.message === "broker-unreachable" ? "NETWORK UNREACHABLE — TRAINING MODE STILL WORKS OFFLINE" :
          "NO RESPONSE FROM THE GRID — CHECK CONNECTION & RETRY");
        setPhase("menu");
      });
  };

  const startQuick = () => { SFX.click(); setErr(""); setPhase("search"); begin(quickMatch(me, (s) => mounted.current && setStatus(s))); };
  const startHost = () => {
    SFX.click(); setErr("");
    const c = code5(); setRoomCode(c); setPhase("wait");
    begin(hostRoom(c, me, (s) => mounted.current && setStatus(s)));
  };
  const startJoin = () => {
    const c = sanitizeCode(joinInput);
    if (c.length < 5) { setErr("ENTER THE FULL 5-CHARACTER CODE"); return; }
    SFX.click(); setErr(""); setPhase("join");
    begin(joinRoom(c, me));
  };
  const abort = () => {
    SFX.back();
    cancelRef.current?.cancel();
    cancelRef.current = null;
    setPhase("menu"); setErr(""); setRoomCode("");
  };

  const myStyle = STYLES[profile.fighter.style];

  return (
    <Backdrop>
      <div className="mx-auto flex min-h-screen max-w-[1080px] flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          {phase === "menu" || phase === "vs" ? (
            <button className="btn btn-ghost px-4 py-2 text-[12px]" onClick={() => { SFX.back(); onBack(); }} disabled={phase === "vs"}>← Back</button>
          ) : (
            <button className="btn btn-danger px-4 py-2 text-[12px]" onClick={abort}>✕ Abort</button>
          )}
          <h2 className="font-disp text-[28px] text-white">BATTLE <span className="text-[var(--cy)] text-glow-cy">LOBBY</span></h2>
          <div className="flex items-center gap-2 text-[12px] tracking-widest text-[var(--grn)]">
            <span className="inline-block h-2 w-2 animate-[pulseGlow_1.4s_infinite] rounded-full bg-[var(--grn)] shadow-[0_0_8px_var(--grn)]" />
            ONLINE: {online}
          </div>
        </header>

        {/* ---------------- VS SPLASH ---------------- */}
        {phase === "vs" && opp && sessionRef.current && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "radial-gradient(900px 500px at 50% 45%, #101c3e 0%, #04060e 70%)" }}>
            <div className="bg-scan absolute inset-0" />
            <div className="relative grid w-full max-w-[900px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-8">
              <div className="panel anim-rise" style={{ animation: "vsSlideL 0.5s cubic-bezier(0.2,1.2,0.3,1) both" }}>
                <div className="flex items-center gap-3 p-4">
                  <FighterPreview cfg={profile.fighter} w={150} h={190} cycle={false} action="idle" />
                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-[var(--cy)]">YOU · LV {profile.level}</div>
                    <div className="font-disp text-[22px] leading-tight text-white">{profile.fighter.name}</div>
                    <div className="font-disp text-[11px] tracking-[0.2em]" style={{ color: myStyle.aura }}>{myStyle.tag}</div>
                  </div>
                </div>
              </div>
              <div className="font-disp text-[70px] text-[var(--mg)] text-glow-mg" style={{ animation: "vsBoom 0.6s 0.25s cubic-bezier(0.2,1.4,0.3,1) both" }}>VS</div>
              <div className="panel panel-red anim-rise" style={{ animation: "vsSlideR 0.5s 0.12s cubic-bezier(0.2,1.2,0.3,1) both" }}>
                <div className="flex items-center gap-3 p-4">
                  <div className="text-right">
                    <div className="text-[10px] tracking-[0.3em] text-[var(--mg)]">RIVAL · LV {opp.level}</div>
                    <div className="font-disp text-[22px] leading-tight text-white">{opp.name}</div>
                    <div className="font-disp text-[11px] tracking-[0.2em] text-[var(--mg)]">{STYLES[sessionRef.current.opp.fighter.style].tag}</div>
                  </div>
                  <FighterPreview cfg={sessionRef.current.opp.fighter} w={150} h={190} cycle={false} action="idle" />
                </div>
              </div>
            </div>
            <div className="relative mt-8 font-disp text-[13px] tracking-[0.5em] text-[var(--dim)]">
              ARENA LOCKED · {ARENAS.find((a) => a.id === sessionRef.current!.arena)?.name.toUpperCase()}
            </div>
            <div className="searching-stripe relative mt-4 h-[6px] w-[300px]" />
          </div>
        )}

        {/* ---------------- SEARCH / WAIT ---------------- */}
        {(phase === "search" || phase === "wait" || phase === "join") && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
            <div className="relative h-[150px] w-[150px]">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-[rgba(37,224,255,0.4)]" style={{ animation: "spinSlow 7s linear infinite" }} />
              <div className="absolute inset-4 rounded-full border border-[rgba(255,46,99,0.4)]" style={{ animation: "spinSlow 4s linear infinite reverse" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-disp text-[26px] text-[var(--cy)] text-glow-cy animate-[pulseGlow_1.2s_infinite]">
                  {phase === "join" ? "LINK" : "SYNC"}
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="font-disp text-[22px] tracking-wider text-white">
                {phase === "search" ? "SEARCHING FOR OPPONENT…" : phase === "join" ? `JOINING ROOM ${sanitizeCode(joinInput)}…` : "ROOM OPEN — WAITING FOR CHALLENGER"}
              </div>
              <div className="mt-2 text-[12px] tracking-[0.25em] text-[var(--dim)]">{status || "ESTABLISHING P2P CHANNEL…"}</div>
              {phase === "wait" && roomCode && (
                <div className="mt-6 inline-block border border-[rgba(255,201,77,0.5)] bg-[rgba(30,22,6,0.6)] px-8 py-4 shadow-[0_0_24px_-6px_var(--gold)]">
                  <div className="text-[10px] tracking-[0.4em] text-[var(--dim)]">SHARE THIS ROOM CODE</div>
                  <div className="font-disp mt-1 text-[40px] tracking-[0.3em] text-[var(--gold)] text-glow-gold">{roomCode}</div>
                </div>
              )}
            </div>
            <div className="searching-stripe h-[8px] w-[340px]" />
            <button className="btn btn-ghost" onClick={abort}>Cancel</button>
          </div>
        )}

        {/* ---------------- MENU ---------------- */}
        {phase === "menu" && (
          <>
            <div className="mt-8 grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
              <div className="panel flex flex-col">
                <div className="panel-title">MATCHMAKING</div>
                <div className="flex flex-1 flex-col justify-center gap-4 p-6">
                  <button className="btn btn-big btn-danger" onClick={startQuick}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
                    Quick Match
                    <span className="ml-auto text-[10px] text-[var(--mg)]">AUTO</span>
                  </button>
                  <p className="text-[12px] leading-relaxed text-[var(--dim)]">
                    Scan the public ladder for an open challenger. Average queue: seconds —
                    the grid is always hungry.
                  </p>
                  <div className="mt-2 border-t border-[rgba(37,224,255,0.12)] pt-4 text-[11px] tracking-widest text-[var(--dim)]">
                    REGION: GLOBAL-P2P · MODE: BEST OF 3 · TIMER 60s
                  </div>
                </div>
              </div>

              <div className="panel panel-red flex flex-col">
                <div className="panel-title" style={{ color: "var(--mg)" }}>PRIVATE MATCH</div>
                <div className="flex flex-1 flex-col justify-center gap-4 p-6">
                  <button className="btn btn-gold" onClick={startHost}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="2" /><path d="M9 4v16M4 9h16" stroke="currentColor" strokeWidth="2" /></svg>
                    Create Room
                    <span className="ml-auto text-[10px] text-[var(--gold)]">HOST</span>
                  </button>
                  <div className="flex gap-2">
                    <input
                      type="text" placeholder="ROOM CODE" value={joinInput} maxLength={5}
                      onChange={(e) => setJoinInput(sanitizeCode(e.target.value))}
                      className="font-disp w-full text-[18px] tracking-[0.35em]"
                    />
                    <button className="btn" onClick={startJoin} disabled={joinInput.length < 5}>Join</button>
                  </div>
                  <p className="text-[12px] leading-relaxed text-[var(--dim)]">
                    Spin up a private ring and send the 5-character code to a friend.
                    They join from this exact screen — anywhere in the world.
                  </p>
                </div>
              </div>
            </div>

            {err && (
              <div className="anim-rise mt-5 border border-[rgba(255,46,99,0.5)] bg-[rgba(40,8,16,0.7)] px-5 py-3 text-center text-[12px] tracking-[0.2em] text-[#ff9db4]">
                ⚠ {err}
              </div>
            )}

            <div className="mt-5 text-center text-[11px] tracking-widest text-[var(--dim)]">
              TIP: OPEN THIS PAGE IN A SECOND BROWSER WINDOW TO TEST A LIVE P2P DUEL
            </div>
          </>
        )}
      </div>
    </Backdrop>
  );
}
