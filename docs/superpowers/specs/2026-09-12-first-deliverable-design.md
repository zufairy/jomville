# First Deliverable — Iso Room + Colyseus Sync

Source of truth: BUILD PROMPT (section 10). This doc covers only the first deliverable.

## Goal
1. PixiJS v8 canvas, one 10x10 isometric room (64x32 tiles), one placeholder avatar,
   tap-to-move with A* on tile grid, camera follow w/ dead zone clamped to room. Mobile portrait.
2. Colyseus server, `world` room, avatar positions synced between two browser tabs.

## Layout (pnpm workspace)
- `shared/` — `constants.ts` (TILE_W=64, TILE_H=32, ROOM=10, SPEED=4 tiles/s, TICK=10/s),
  `grid.ts` (walkable map), `astar.ts` (4-neighbour A*, Manhattan), `iso.ts` (tile<->screen).
  Vitest tests on astar + iso.
- `server/` — Colyseus 0.16. `WorldRoom`: schema `Player{x,y,dir}` map by sessionId.
  Message `move {tx,ty}` → server validates tile, runs A*, stores path. Sim loop 100ms:
  advance 0.4 tile per tick along path. Patch rate 100ms.
- `client/` — Vite + React + TS. `Game` class owns Pixi Application, room container, tile
  sprites (Graphics diamonds, placeholder), avatar sprites (Graphics), camera.
  `net.ts` wraps colyseus.js. Zustand store: connection status, own sessionId.
  Own avatar: local prediction (run same A*, same speed); reconcile if server pos drifts >1 tile.
  Others: lerp toward last server pos.

## Authority
Server owns position. Client never sends position, only target tile.

## Out of scope
Chat, editor, browser, art, voice, gacha. Everything else in brief.
