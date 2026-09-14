# Kitchen Co-op HD — Isometric pixel renderer and tap controls

Date: 2026-09-14
Status: approved design
Builds on: `2026-09-14-kitchen-coop-design.md` (rules and networking unchanged)

## Goal

The co-op kitchen plays well but looks like a debug view: a Canvas2D top-down grid of
coloured circles. Rebuild the presentation so a round looks like the rest of dovey — an
isometric room in the 8-bit "HD" pixel style of the casino Dicemaster — with the players'
own LPC avatars as chefs, and add tap/click controls so it plays well on phones and with a
mouse, without touching the server, the sim rules or the `k_in` / `k_snap` protocol.

## Decisions

| Topic | Decision |
| --- | --- |
| Architecture | Server, shared sim and protocol unchanged. Replace only the client renderer and input. |
| Renderer | PixiJS v8 isometric scene reusing the room engine: 64x32 projection (`shared/src/iso.ts`), `Camera`, LPC `Avatar`, depth-sorted sprites. |
| Coordinates | Sim tile coords (continuous) go through `tileToScreen`; a chef at (x, y) stands on screen at `tileToScreen(x, y)`. |
| Prediction | `predict.ts` / `interp.ts` kept as they are. |
| Art | Pixel maps (text rows + palette, `validateMap`) built on a small iso raster, drawn crisp (nearest) at 2 world px per art px. |
| Camera | Follows own chef; zoom by pinch / wheel; no drag-to-pan in the kitchen. |
| Controls | Tap-to-walk / tap-to-use with client A*, optional floating joystick, thumb buttons, keyboard kept (screen-relative). |

## Look

Dark outlines, 3-4 tone ramps, crisp pixels, small shadows and highlights.

- **Dovey Diner** (14x9) drawn like a room: warm checker floor tiles, back walls with a white
  subway-tile backsplash, trim and warm paint, hanging lamps; front-edge counters stay low.
- **Stations**: crate brimming with its ingredient (tomato / lettuce / onion / mushroom);
  steel counter with a wood top; chopping board with a knife that animates while chopping;
  stove with blue/orange flame frames under a pot; plate stack; serving window with brass
  bell and ticket rail; bin with a swinging lid; plate-return hatch; brick end caps for wall
  tiles.
- **Items**: raw and chopped of every ingredient; pot empty, filling 1/2/3, cooking, done
  (steam), burnt (black smoke); clean plate, soups on a plate, salad, tomato salad and the
  partial tomato-only plate. Every item or station state the sim can produce has a sprite
  (enforced by a test that enumerates the shared types).
- **Chefs**: the player's LPC avatar (own look from the app store, crewmates from the world
  roster by user id) with a white chef hat, a name tag in a stable per-player colour keyed by
  roster order (join order from `k_hello` / `k_roster`), never snapshot index, so colours do
  not shift when someone leaves. Held item floats above the hands; a pixel progress ring over
  boards and pots (chop yellow, cook green, burn danger red flashing).
- **HUD** (React): order tickets slide in along the top (dish icon, draining timer bar that
  reddens, streak badge); score and time in a glass pill top-right; results screen with
  animated stars, "Play again" and "Back"; world coin balance refetched after a round.

## Controls

- **Tap floor** → walk: client A* (`shared/src/astar.ts`) on the kitchen grid, stick input
  steered along waypoints through the normal prediction path; server stays authoritative.
- **Tap station** → walk to the nearest free tile beside it, face it, send one grab.
- **Hold station** (press > 250 ms) → walk there, then hold `use` while the pointer is down.
  The press survives finger drift (pointer capture on the canvas).
- **Dash**: right-click or double-click a tile (desktop), double-tap (touch) → face and dash
  toward it (1 s cooldown enforced by the sim; the button shows the cooldown).
- **Floating joystick** (optional, settings toggle, persisted in `localStorage` with
  try/catch): press and drag on empty floor steers; screen up is up on screen, converted to
  iso world axes; release stops; a short tap is still tap-to-walk.
- **Thumb buttons** on touch devices: big Grab and Chop (hold, pointer capture +
  `onLostPointerCapture`) and a small Dash, bottom-right, sized to leave the board visible in
  phone landscape.
- **Keyboard**: WASD / arrows screen-relative, Space grab, E chop, Shift dash. Any key cancels
  an active tap path.
- **Aim assist**: Grab / Chop from keyboard or buttons faces the adjacent station closest to
  the chef's facing (one tick of a small axis nudge), because screen-relative keys give
  diagonal world facings.
- **Feedback**: tap marker ring, glow on the target station while walking to it, shake + sound
  on an action the client predicts will do nothing and on `rejected`, chop / sizzle / serve /
  dash sounds via Web Audio.

## Architecture (client only)

```
client/src/kitchen/
  isoRaster.ts        iso raster helper (faces, boxes, orbs) over PixelCanvas
  kitchenPixels.ts    item sprites + sprite keys for every item state
  stationPixels.ts    station sprites, rings, hat, marker
  roomPixels.ts       floor and walls of a level
  pixelTexture.ts     pixel map -> RGBA / Pixi texture / data URL
  isoRenderer.ts      Pixi app: floor, walls, stations, items, chefs, camera, fx
  chefSprite.ts       Avatar + hat + tag + held item
  aim.ts              screen<->world direction, adjacency, aim assist, grab prediction
  tapControls.ts      TapPilot: path planning and steering
  joystick.ts         floating joystick math
  pointerInput.ts     canvas pointer / wheel wiring (tap, hold, dash, joystick, pinch)
  chefColors.ts       stable chef colours
  sounds.ts           kitchen sfx
client/src/ui/KitchenRound.tsx   round screen, HUD, touch buttons, results
```

`net.ts`, `store.ts`, `view.ts`, `interp.ts`, `predict.ts` keep their behaviour, including
the previous fixes: `onLeave` calls `lost()` on a consented close unless in results, and
`go()` resets over/time/timeAt/lag/reconnecting. Kitchen rooms are still only created by the
lobby (`ROUND_KEY`); "Play again" leaves the round and re-sends `k_start` once the crew is
open again.

## Testing

- vitest: every kitchen pixel map passes `validateMap`; every sim item and station state has a
  sprite; screen-relative joystick/keys → world vector math; tap-path planner (target
  adjacency, path to the station side, cancel on key); stable chef colour by id; existing
  kitchen tests stay green.
- `pnpm typecheck && pnpm test` before each commit; `pnpm --filter @dovey/client build` at the end.
- PNG preview sheets of all kitchen sprites and a composed diner scene, inspected by eye.
- `client/scripts/smoke-kitchen.mjs` unchanged (protocol unchanged), run against a local server.

## Out of scope

Server, sim rules, protocol, new levels, Stage 2/3 mechanics, level select, emotes, kitchen
world lobby art, spectating.
