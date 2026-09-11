# NEONCLASH — Online 1v1 Fighting Game

A complete, playable online multiplayer 2D fighter for the web. Create and customize a
fighter, queue into live matchmaking, and duel another real player in a best-of-3
match — light/heavy/special attacks, combo chains, blocking, dashing, energy management,
rounds, KOs, XP progression, training mode, profile, and four original arenas.

## Quick start

```bash
npm install
npm run dev        # client on http://localhost:5173
npm run build      # production build in dist/
```

No backend is required to play online: the shipped client uses **peer-to-peer WebRTC
data channels** (PeerJS public broker for rendezvous only — all gameplay traffic is
direct P2P, host-authoritative). **Deploying the static build alone gives you a live,
playable-online game** — matchmaking works through the free public PeerJS broker over
HTTPS.

## Publish online

The client is a static site (`npm run build` → `dist/`). Pick any static host:

**Vercel (recommended)** — `vercel.json` is already configured.
1. Push this folder to a GitHub repo (`.gitignore` included).
2. vercel.com → *New Project* → import the repo. Framework auto-detects Vite;
   build `npm run build`, output `dist` (both pre-set). Deploy. Done in ~1 min.

**Netlify** — `netlify.toml` is already configured (incl. SPA rewrite).
1. app.netlify.com → *Add new site* → *Import from Git* (or drag-and-drop the `dist/`
   folder onto the dashboard for an instant manual deploy).

**Cloudflare Pages** — dash.cloudflare.com → *Workers & Pages* → *Create* → connect repo,
build `npm run build`, output `dist`.

**Manual / any host (incl. itch.io):** run `npm run build`, then upload/serve the whole
`dist/` folder. Any HTTPS static host works.

Notes:
- Serve at the **root of a domain/subdomain** (all options above do this). GitHub Pages
  *project subpaths* would additionally need `base: './'` in `vite.config.js`.
- WebRTC requires HTTPS — every host above provides it automatically.
- Two players just need the URL; private room codes also let a friend join from any
  other device/network.

### Optional: deploy the authoritative server

For production-grade anti-cheat (server owns movement, damage, health, results), run
`server/index.js` on any Node host (Render → *Web Service*, Railway, Fly.io):
start command `node index.js`, port `8787`, then `cd server && npm install` first.
The P2P client works without it; it's the transport-agnostic upgrade path.

### Testing multiplayer on one machine

1. Run `npm run dev`.
2. Open **Browser Window 1** → `PLAY ONLINE` → `QUICK MATCH` (it parks in the lobby pool).
3. Open **Browser Window 2** (another browser works too) → `PLAY ONLINE` → `QUICK MATCH`.
   Window 2 scans the pool, finds Window 1, and both get the **VS splash → arena**.
4. Fight: each window controls its own fighter (A/D move, W jump, S block, J/K/L attacks,
   Space dash). Health, hits, combos, rounds and the match result stay in sync.

**Private rooms:** Window 1 → `CREATE ROOM` → shares the 5-char code (e.g. `X7K92`).
Window 2 (any device, anywhere) → `JOIN ROOM` → enters the code.

## Controls

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `A` / `D` | Move | | `J` | Light attack (chainable) |
| `W` | Jump | | `K` | Heavy attack |
| `S` | Block (hold) | | `L` | Special — costs 50 EN |
| `SPACE` | Dash (i-frames) | | `J·J·K` | Combo chain |

Gamepads (standard mapping) also work: stick move, A jump, X light, Y heavy, B block,
LB dash, RB special.

## Combat systems

- **Light / Heavy / Special** — startup, active and recovery frames; specials need 50 energy.
- **Combos** — lights chain into lights/heavies while connecting; counter shows `N HIT COMBO`.
- **Block** — reduces damage by style block efficiency (chip damage still applies).
- **Dash** — 0.13s of invulnerability, 0.75s cooldown.
- **Styles** — Balanced / Speed / Power / Defense change speed, damage, HP and block.
- **Rounds** — best of 3, 60s timer, K.O. slow-motion, perfect-round tracking.
- **Progression** — Win +100 XP, Loss +30, Perfect +50, 5+ hit combo bonus; level curve 100+(lv-1)·60.

## Architecture

```
src/
  game/        engine (physics, combat, rounds, AI) + shared defs/balance
  render/      canvas renderer: procedural fighters, 4 parallax arenas, particles, shake
  net/         P2P transport (PeerJS), matchmaking pool, room codes, handshake
  audio/       synthesized WebAudio SFX + music sequencer (zero assets)
  screens/     Home, Creator, Lobby, Fight(+HUD), Profile, Settings
  store.ts     profile / XP / settings persistence (localStorage)
server/        OPTIONAL authoritative Socket.IO server (production path)
```

Fighters are drawn **procedurally from a pose model** (`render/draw.ts → drawFighter`),
so real sprite sheets can replace that single function later without touching the
engine, netcode or UI. Sounds are synthesized in `audio/sfx.ts` — swap any entry for a
sample playback call.

### Networking model (P2P, shipped)

- Rendezvous on the free PeerJS cloud broker; gameplay flows over direct WebRTC channels.
- Each client simulates **its own** fighter and resolves **its own** attacks; hits are
  sent to the victim as clamped resolution events (damage capped at 34, positions
  clamped to the arena, hp only allowed to drop) — basic tamper resistance.
- The **host is authoritative** for the round timer, round/match progression and
  rematch flow; guests adopt the host's phase stream.

### Production path (authoritative server)

`server/index.js` is a complete Socket.IO match server that owns movement limits,
attack timing, damage, cooldowns, health, rounds and results — clients send inputs only.

```bash
cd server && npm install && node index.js   # :8787
```

Point a `socket.io` transport adapter at it to replace `src/net/peer.ts`; the engine
and renderer are transport-agnostic by design.

## Training mode

`TRAINING` from the home screen: fight a CPU dummy (approaches, attacks, blocks, jumps,
retreats) with toggles for infinite HP and dummy AI, live damage/combo readouts and a
round reset button.

## Notes

- Desktop keyboard is the primary target; the UI scales down for tablet/mobile layout.
- All characters, names, arenas and art are original and generated in code (no assets).
