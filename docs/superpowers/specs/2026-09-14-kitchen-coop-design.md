# Kitchen Co-op (Overcooked-style) — Design

Date: 2026-09-14
Status: approved design, Stage 1 to implement first

## Goal

A 1-4 player real-time co-op cooking game inside dovey. Friends meet in a new
"Kitchen" world, form a crew, and play a 3-minute round: grab ingredients, chop,
cook, plate and serve orders before their timers run out. Must feel smooth on
desktop and phone, including on Railway with ~100-200ms latency.

Full Overcooked feel is delivered in stages, each shippable:

- **Stage 1** — core loop, 4-player online, one kitchen, desktop + phone controls.
- **Stage 2** — fire + extinguisher, dirty plates + sink, throwing, frying pan (burgers).
- **Stage 3** — 3 more kitchens (moving platforms, split kitchen, ice), level select,
  saved best stars, in-round emotes.

This spec details Stage 1 and fixes the extension points for Stages 2-3.

## Decisions

| Topic | Decision |
| --- | --- |
| Scope | Full feel, built in 3 stages |
| Devices | Desktop keyboard + phone joystick/buttons |
| Joining | New "Kitchen" world as lobby; walk onto a crew station; crew code for invites; solo allowed |
| Architecture | Dedicated `kitchen` Colyseus room per round, 30Hz server-authoritative, client prediction |

## Architecture

```
Kitchen world (existing GameRoom, 10Hz)
  crew stations 1-4 + crew code + Start
        |
        v  client joins by roomId
KitchenRoom (new Colyseus room type, 30Hz sim)
  uses shared/kitchen pure sim
        ^ inputs (seq, move, grab, use, dash)
        | snapshots (20/s, plain messages)
Client: pixi kitchen scene + prediction + React HUD + touch controls
```

Existing `Game.ts` (1255 lines) and `GameRoom.ts` (930 lines) are already large;
they receive only thin hooks. All new logic lives in new, focused files.

### Shared — `shared/src/kitchen/`

Pure, deterministic, no I/O and no wall clock. Randomness from a seeded RNG.

- `types.ts` — `KitchenState`, `Chef`, `Item`, `Station`, `Order`, `Input`, `LevelDef`.
- `constants.ts` — tick (30Hz), speeds, timings, scoring numbers below.
- `rng.ts` — small seeded PRNG (mulberry32).
- `levels/diner.ts` — Kitchen 1 layout; `levels/index.ts` registry.
- `physics.ts` — chefs as circles (radius 0.35 tile), axis-separated movement against
  solid tiles, soft chef-chef separation.
- `items.ts` — item kinds, states (raw/chopped), containers (plate, pot), combine rules,
  dish matching against recipes.
- `stations.ts` — per-station interaction handlers (grab/drop/use) and per-tick updates
  (chopping progress, pot cooking/burning, plate return).
- `orders.ts` — order spawning, timers, serve/expire, streak and tips, stars.
- `sim.ts` — `createState(levelId, seed, chefIds)`, `step(state, inputsByChef, dt)`,
  returns emitted events (served, expired, burned, roundEnd) for the server/HUD.
- `snapshot.ts` — encode state to a compact snapshot and apply one on the client.
- `index.ts` — re-exports; `shared/src/index.ts` exports `kitchen`.

Stage 2/3 extend `stations.ts` (sink, fire, extinguisher, pan), `items.ts`
(dirty plate, burger), `physics.ts` (thrown items, moving platforms, ice friction),
and add levels — no structural change.

### Server — `server/src/kitchen/`

- `KitchenRoom.ts` — Colyseus room `kitchen`. `onCreate({crewId, levelId, seed, members})`.
  `setSimulationInterval` at 30Hz runs `step`. Per-client input queue (max 4 buffered;
  newest applied per tick; grab/use/dash are edge events, applied once). Sends
  `k_snap` 20/s (plain message, not Colyseus schema). Sends `k_event` for served,
  expired, burned, round end. Validates membership by token/userId from the crew.
- `crews.ts` — `CrewBook` (pure-ish, injectable clock like `TableBook`): crews per
  kitchen-world station, 4-letter crew codes, join/leave/start, returns events.
  On start the room calls `matchMaker.createRoom('kitchen', …)` and tells members the roomId.
- `rewards.ts` — end-of-round coins: stars × 10, hourly cap per user (reuses
  `repo.creditCoins`).
- Hook: `index.ts` defines the `kitchen` room; `GameRoom` adds a `KITCHEN_ROOM.slug`
  check that wires `k_crew_*` messages to `CrewBook`.

### Client — `client/src/kitchen/`

- `net.ts` — joins the kitchen room by id, sends inputs at 30Hz with `seq`, receives
  snapshots/events.
- `predict.ts` — local chef prediction: runs shared `step` for the local chef only,
  reconciles on snapshot (reset to server state, replay unacked inputs; error < 0.3
  tile smoothed over ~100ms, larger snaps). Pickup/drop shown optimistically,
  reverted if the server disagrees.
- `interp.ts` — remote chefs/items rendered ~100ms in the past, interpolated between
  two snapshots, extrapolate ≤150ms.
- `scene.ts` — full-screen pixi kitchen, angled top-down, tile art + chef avatars
  (reusing avatar colors/handle), held items, progress bars, pot checkmark/burn.
- `input.ts` — keyboard (WASD/arrows move, Space grab/drop, E use/chop, Shift dash);
  touch: virtual joystick + Grab, Use, Dash buttons.
- `store.ts` — zustand store: phase `lobby | loading | playing | results`, crew, HUD data.
- `client/src/ui/KitchenLobby.tsx` — crew members, crew code, join by code, Start.
- `client/src/ui/KitchenHUD.tsx` — order tickets with timers, round timer, score,
  streak, lag indicator, results screen with stars and Play again / Back.
- Hooks: `App.tsx` mounts lobby/HUD when in the Kitchen world / kitchen round.

### Kitchen world

New system room `kitchen` in `shared/src/kitchenWorld.ts`, added to `SYSTEM_ROOMS`,
reusing an existing theme and furniture where possible. Four crew-station floor
tiles (walk onto one to join that crew) plus signage. Covered by the existing
`systemRooms.test.ts` checks.

## Gameplay rules (Stage 1)

### Controls

- Move: 4.5 tiles/s, soft chef collisions.
- Grab/drop (Space): acts on the station tile the chef faces; on open floor, drops the item.
- Use (E): hold to chop at a board.
- Dash (Shift): 0.18s burst at 3× speed, 1s cooldown.

### Stations

- **Crate** (tomato, lettuce, onion, mushroom): infinite raw ingredient.
- **Counter**: holds one item.
- **Chopping board**: holds one raw choppable item; hold Use for 2.0s total; progress kept
  if the chef walks away.
- **Stove**: holds a pot. Pot accepts up to 3 chopped soup ingredients of one kind; cooks
  3.0s per ingredient; done shows a check; 8.0s after done the soup burns (ruined,
  must be binned). Adding an ingredient to a cooked pot restarts cooking.
- **Plate stack**: clean plates (4 in Diner).
- **Serving window**: accepts a plated dish matching an open order.
- **Bin**: destroys held ingredient; empties a held pot or plate (container kept).
- **Plate return**: served plate comes back clean after 5.0s (Stage 2: dirty).

### Recipes

- Tomato soup: 3 chopped tomato (via pot).
- Onion soup: 3 chopped onion (via pot).
- Mushroom soup: 3 chopped mushroom (via pot).
- Salad: chopped lettuce, or chopped lettuce + chopped tomato, on a plate.

### Orders and scoring

- New order every 12s (first after 2s), max 5 open; order timer 60s; red under 15s.
- Order spawn interval scales with crew size: 1 player ×1.6, 2 ×1.25, 3 ×1.1, 4 ×1.0.
- Serve: +20 base, tip = round(8 × timeLeft/60).
- Streak: serving the oldest open order increments streak (max ×4) and multiplies the tip;
  serving out of order resets streak to ×1.
- Expired order: −10 score, streak reset. Score floor 0.
- Round: 180s. Stars by per-level thresholds (Diner: 1★ 60, 2★ 160, 3★ 280).

### Kitchen 1 — "Dovey Diner"

14×9 tiles. Walls around; two crates cluster, two chopping boards, two stoves with pots,
a middle island of counters, one serving window, plate stack, plate return, bin.
Layout designed so 4 chefs each have a useful lane.

### Rewards

End of round: stars × 10 coins per player, capped at 150 kitchen coins per user per hour.

## Networking and smoothness

- Input message `k_in {seq, mx, my, grab, use, dash}` at 30Hz; `mx,my` in [-1,1];
  grab/use/dash are press edges (use also sends held state).
- Server applies latest input per chef each tick; ignores out-of-range values;
  rate limit 40 msgs/s per client.
- Snapshot `k_snap` 20/s: tick, lastSeq per chef, chef positions (1/100 tile),
  held items, and only changed stations/items/orders (full snapshot every 2s and on join).
  Target 1-3 KB/s per client.
- Local prediction + reconciliation as above; remote interpolation delay 100ms.
- Lag indicator when RTT > 250ms (ping message every 2s).
- Disconnect: chef freezes, crew sees "reconnecting"; 20s to reconnect into the same chef
  (Colyseus `allowReconnection`), else chef removed and held item dropped.
- Leaving: round continues for remaining chefs, spawn scaling updates; room disposes when
  empty. Friends with the crew code may join a free slot mid-round.
- Deployment: single Railway replica; kitchen rooms in the same process.

## Error handling

- Invalid join (wrong code, crew full, not a member): `sys {code}` reject, like existing rooms.
- Start with no members or round already running: rejected.
- Kitchen room creation failure: crew returns to lobby with an error toast.
- Client loses room: shows reconnecting, then returns to Kitchen world with a message.

## Testing

- `shared` vitest: chopping timings, pot cooking/burning, plating/dish matching, order
  spawn/expiry, streak/tips, stars, collisions, seeded determinism (same seed + inputs ⇒
  identical state).
- `server` vitest: `CrewBook` join/leave/code/start with fake clock; input validation;
  reconnect window; rewards cap.
- Client prediction test: replay inputs with 150ms simulated latency, reconciliation error bounded.
- `client/scripts/smoke-kitchen.mjs`: 4 bots form a crew, start, cook and serve tomato soup
  through the network, assert score increases and round ends; exit 0 = PASS.
- Manual: 4 Chrome tabs (one phone-sized) play a full round at 60fps.

## Out of scope for Stage 1

Fire/extinguisher, sink/dirty plates, throwing, frying pan, extra kitchens, level select,
persistent best stars, in-round emotes, voice chat inside rounds, bots as chefs.
