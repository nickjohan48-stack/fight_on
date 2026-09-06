/* ============================================================
   NEONCLASH — multiplayer transport (PeerJS / WebRTC data channel)

   Works with zero backend: peers rendezvous on the free public
   PeerJS broker, then talk directly P2P. Quick-match scans a
   shared pool of lobby IDs; private rooms use room codes.
   The production path (authoritative server) lives in /server.
   ============================================================ */
import Peer, { DataConnection } from "peerjs";
import { ArenaId, ARENAS, FighterConfig } from "../game/defs";

export type Role = "host" | "guest";

export interface OpponentInfo { name: string; level: number; fighter: FighterConfig; }
export interface MatchSession {
  conn: DataConnection;
  role: Role;
  arena: ArenaId;
  opp: OpponentInfo;
  send: (m: unknown) => void;
  onMessage: (cb: (m: any) => void) => void;
  onClose: (cb: () => void) => void;
  close: () => void;
}

const PREFIX = "neonclash1";
const QM_POOL = 24;

export interface Cancelable<T> { promise: Promise<T>; cancel: () => void; }

function waitOpen(conn: DataConnection, ms: number): Promise<boolean> {
  return new Promise((res) => {
    const to = setTimeout(() => res(false), ms);
    conn.on("open", () => { clearTimeout(to); res(true); });
  });
}

function mkSession(conn: DataConnection, role: Role, peer: Peer, arena: ArenaId, opp: OpponentInfo): MatchSession {
  let msgCb: (m: any) => void = () => {};
  let closeCb: () => void = () => {};
  conn.on("data", (d) => msgCb(d));
  conn.on("close", () => closeCb());
  conn.on("error", () => closeCb());
  peer.on("disconnected", () => { try { peer.reconnect(); } catch { /* ignore */ } });
  return {
    conn, role, arena, opp,
    send: (m) => { try { if (conn.open) conn.send(m); } catch { /* ignore */ } },
    onMessage: (cb) => { msgCb = cb; },
    onClose: (cb) => { closeCb = cb; },
    close: () => { try { conn.close(); } catch { /* ignore */ } try { peer.destroy(); } catch { /* ignore */ } },
  };
}

/** shared hello/start handshake on top of an open connection */
async function handshake(
  conn: DataConnection, peer: Peer, role: Role,
  me: OpponentInfo,
): Promise<{ opp: OpponentInfo; arena: ArenaId }> {
  return new Promise((resolve, reject) => {
    let opp: OpponentInfo | null = null;
    let arena: ArenaId | null = role === "host" ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : null;
    const to = setTimeout(() => reject(new Error("handshake timeout")), 8000);
    const done = () => {
      if (opp && arena) { clearTimeout(to); resolve({ opp, arena }); }
    };
    conn.on("data", (d: any) => {
      if (d?.t === "hello") { opp = d.who; if (role === "host") conn.send({ t: "start", arena }); done(); }
      if (d?.t === "start" && role === "guest") { arena = d.arena; done(); }
    });
    conn.on("close", () => { clearTimeout(to); reject(new Error("closed")); });
    conn.send({ t: "hello", who: me });
  });
}

/* ---------------- QUICK MATCH ---------------- */
export function quickMatch(me: OpponentInfo, onStatus: (s: string) => void): Cancelable<MatchSession> {
  let cancelled = false, dead = false;
  let peer: Peer | null = null;

  const promise = (async (): Promise<MatchSession> => {
    let brokerFails = 0;
    for (let pass = 0; pass < 3 && !cancelled; pass++) {
      // PASS A: scan the lobby pool for someone waiting
      for (let i = 0; i < QM_POOL && !cancelled; i++) {
        const target = `${PREFIX}-qm-${i}`;
        onStatus(`SCANNING SECTOR ${String(i + 1).padStart(2, "0")}…`);
        const scanner = new Peer();
        peer = scanner;
        let openedBroker = false;
        await new Promise<void>((res) => {
          scanner.on("open", () => { openedBroker = true; res(); });
          scanner.on("error", () => res());
          setTimeout(res, 3000);
        });
        if (!openedBroker && ++brokerFails >= 3) { scanner.destroy(); throw new Error("broker-unreachable"); }
        if (openedBroker) brokerFails = 0;
        if (cancelled || dead) { scanner.destroy(); throw new Error("cancelled"); }
        const conn = scanner.connect(target, { reliable: false });
        const errP = new Promise<boolean>((res) => {
          scanner.on("error", (e: any) => {
            if (e?.type === "peer-unavailable" && String(e.message).includes(target)) res(true);
          });
        });
        const opened = await Promise.race([waitOpen(conn, 1600), errP.then(() => false)]);
        if (opened && conn.open) {
          try {
            const { opp, arena } = await handshake(conn, scanner, "guest", me);
            return mkSession(conn, "guest", scanner, arena, opp);
          } catch { scanner.destroy(); }
        } else {
          try { conn.close(); } catch { /* ignore */ }
          scanner.destroy();
        }
      }
      // PASS B: nobody waiting — park in the pool and wait
      if (cancelled) throw new Error("cancelled");
      onStatus("CHANNEL OPEN — AWAITING CHALLENGER…");
      const idx = Math.floor(Math.random() * QM_POOL);
      const waiter = new Peer(`${PREFIX}-qm-${idx}`);
      peer = waiter;
      const parked = await new Promise<MatchSession | null>((res) => {
        let settled = false;
        const fail = () => { if (!settled) { settled = true; waiter.destroy(); res(null); } };
        waiter.on("error", (e: any) => { if (e?.type === "unavailable-id") fail(); });
        waiter.on("open", () => {
          setTimeout(() => { if (!settled) fail(); }, 9000);
          waiter.on("connection", async (conn) => {
            if (settled || cancelled) { conn.close(); return; }
            settled = true;
            try {
              const { opp, arena } = await handshake(conn, waiter, "host", me);
              res(mkSession(conn, "host", waiter, arena, opp));
            } catch { conn.close(); fail(); }
          });
        });
        setTimeout(() => { if (!settled && !cancelled) fail(); }, 12000);
      });
      if (parked) return parked;
    }
    throw new Error("no-opponents");
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true; dead = true;
      try { peer?.destroy(); } catch { /* ignore */ }
    },
  };
}

/* ---------------- PRIVATE ROOMS ---------------- */
export function code5(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
export const sanitizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

export function hostRoom(code: string, me: OpponentInfo, onStatus: (s: string) => void): Cancelable<MatchSession> {
  let cancelled = false;
  let peer: Peer | null = null;
  const promise = (async (): Promise<MatchSession> => {
    onStatus(`ROOM ${code} OPEN — SHARING CODE…`);
    const waiter = new Peer(`${PREFIX}-rm-${code}`);
    peer = waiter;
    return new Promise<MatchSession>((resolve, reject) => {
      waiter.on("error", (e: any) => {
        if (e?.type === "unavailable-id") reject(new Error("code-in-use"));
        else if (!cancelled) reject(new Error(e?.type ?? "host-error"));
      });
      waiter.on("open", () => {
        waiter.on("connection", async (conn) => {
          if (cancelled) { conn.close(); return; }
          try {
            const { opp, arena } = await handshake(conn, waiter, "host", me);
            resolve(mkSession(conn, "host", waiter, arena, opp));
          } catch (e) { reject(e); }
        });
      });
    });
  })();
  return { promise, cancel: () => { cancelled = true; try { peer?.destroy(); } catch { /* ignore */ } } };
}

export function joinRoom(code: string, me: OpponentInfo): Cancelable<MatchSession> {
  let cancelled = false;
  let peer: Peer | null = null;
  const promise = (async (): Promise<MatchSession> => {
    const joiner = new Peer();
    peer = joiner;
    await new Promise<void>((res) => { joiner.on("open", () => res()); joiner.on("error", () => res()); setTimeout(res, 4000); });
    if (cancelled) { joiner.destroy(); throw new Error("cancelled"); }
    const conn = joiner.connect(`${PREFIX}-rm-${code}`, { reliable: false });
    const notFound = new Promise<boolean>((res) => {
      joiner.on("error", (e: any) => { if (e?.type === "peer-unavailable") res(true); });
    });
    const opened = await Promise.race([waitOpen(conn, 5000), notFound.then(() => false)]);
    if (!opened || !conn.open) throw new Error("room-not-found");
    const { opp, arena } = await handshake(conn, joiner, "guest", me);
    return mkSession(conn, "guest", joiner, arena, opp);
  })();
  return { promise, cancel: () => { cancelled = true; try { peer?.destroy(); } catch { /* ignore */ } } };
}
