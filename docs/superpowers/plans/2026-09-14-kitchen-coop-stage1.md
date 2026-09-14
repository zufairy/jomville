# Kitchen Co-op Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 1-4 player real-time co-op cooking round (Overcooked-style) reachable from a new "Kitchen" world.

**Architecture:** A pure deterministic simulation in `shared/src/kitchen` (30Hz fixed step) runs on the server inside a dedicated Colyseus `kitchen` room and, for the local chef's movement, on the client for prediction. The Kitchen world (existing `GameRoom`) forms crews from players standing on four rugs and starts rounds. The round renders on a Canvas2D full-screen layer with a React HUD.

**Tech Stack:** TypeScript, pnpm workspace, Colyseus 0.16 (`colyseus`, `colyseus.js`), React 18, zustand 5, vitest 2, Canvas2D.

**Spec:** `docs/superpowers/specs/2026-09-14-kitchen-coop-design.md`

## Global Constraints

- Node >= 22, pnpm 11 (root `packageManager`).
- Shared code is pure: no DOM, no Node APIs, no `Date.now`/`Math.random` inside `shared/src/kitchen` (seeded RNG only).
- Sim rate 30Hz (`K_TICK_HZ = 30`), snapshots 20/s (`K_SNAP_HZ = 20`), full snapshot every 2s and on join.
- Crew max 4. Round 180s. Reconnect window 20s.
- Kitchen exports from `@dovey/shared` are namespaced: `import { kitchen } from '@dovey/shared'` (avoids clashing with existing generic names).
- `GameRoom.ts` and `Game.ts` only get thin hooks; all logic in new files.
- **Deviations from spec (deliberate):**
  - Round renders with Canvas2D, not pixi: `client/src/game/instance.ts` documents that a second pixi `Application` on the page breaks shared textures.
  - Client predicts local chef movement only; pickup/drop waits for the server snapshot.
  - A pot keeps its cooking progress when an ingredient is added (progress cap grows), instead of restarting.
- Test commands: `pnpm --filter @dovey/shared test`, `pnpm --filter @dovey/server test`, `pnpm --filter @dovey/client test`; typecheck with `pnpm -r run typecheck`.

## File Map

Create:
- `shared/src/kitchen/{types,constants,rng,levels,physics,items,orders,stations,sim,snapshot,index}.ts` (+ tests)
- `shared/src/kitchenWorld.ts` — Kitchen world system room + crew pads
- `server/src/kitchen/{input,crews,rewards,rounds,lobby,KitchenRoom}.ts` (+ tests for input, crews, rewards)
- `client/src/kitchen/{store,controls,predict,interp,view,draw,net}.ts` (+ tests for predict, interp, view)
- `client/src/ui/KitchenLobby.tsx`, `client/src/ui/KitchenRound.tsx`
- `client/scripts/smoke-kitchen.mjs`

Modify:
- `shared/src/index.ts`, `shared/src/systemRooms.ts`
- `server/src/index.ts`, `server/src/GameRoom.ts` (thin hooks)
- `client/src/net.ts`, `client/src/game/Game.ts`, `client/src/game/instance.ts`, `client/src/App.tsx`, `client/src/styles.css`

Tasks continue in `2026-09-14-kitchen-coop-stage1-part2.md` (Tasks 3-6: items, orders, stations, sim/snapshot) and `-part3.md` (Tasks 7-12: world, server, client, smoke).

---

### Task 1: Kitchen types, constants, RNG, level parsing

**Files:**
- Create: `shared/src/kitchen/types.ts`, `constants.ts`, `rng.ts`, `levels.ts`, minimal `items.ts`
- Test: `shared/src/kitchen/levels.test.ts`

**Interfaces:**
- Produces: types below; `nextRandom(seed): [value, nextSeed]`; `LEVELS`, `levelDef(id)`, `parseLevel(def): ParsedLevel`; `emptyPot()`, `emptyPlate()`.

- [ ] **Step 1: Write types** — `shared/src/kitchen/types.ts`:

```ts
export type Ingredient = 'tomato' | 'lettuce' | 'onion' | 'mushroom';
export type Dish = 'soup_tomato' | 'soup_onion' | 'soup_mushroom' | 'salad' | 'salad_tomato';

export type IngItem = { kind: 'ing'; ing: Ingredient; chopped: boolean };
export type PlateItem = { kind: 'plate'; soup: Ingredient | null; parts: Ingredient[] };
/** cook: seconds cooked (capped at COOK_PER_ING × contents); over: seconds past done; burnt: ruined */
export type PotItem = { kind: 'pot'; contents: Ingredient[]; cook: number; over: number; burnt: boolean };
export type Item = IngItem | PlateItem | PotItem;

export type StationKind = 'counter' | 'crate' | 'board' | 'stove' | 'plates' | 'window' | 'bin' | 'return';

export interface Station {
  kind: StationKind;
  x: number;
  y: number;
  item: Item | null;
  /** crate ingredient */
  ing: Ingredient | null;
  /** chopping progress in seconds (board) */
  chop: number;
  /** clean plates available (plates, return) */
  count: number;
  /** state.rev when this station last changed */
  v: number;
}

export interface Chef {
  id: string;
  x: number;
  y: number;
  /** facing unit vector */
  fx: number;
  fy: number;
  held: Item | null;
  /** seconds of dash left, and cooldown */
  dash: number;
  dashCd: number;
  /** last input seq applied */
  seq: number;
  chopping: boolean;
}

export interface KitchenInput {
  seq: number;
  /** stick/keys in [-1, 1]; +y is down the screen */
  mx: number;
  my: number;
  /** press edge: pick up / put down */
  grab: boolean;
  /** held: chop */
  use: boolean;
  /** press edge */
  dash: boolean;
}

export interface Order {
  id: number;
  dish: Dish;
  left: number;
  total: number;
}

export interface FloorItem {
  id: number;
  x: number;
  y: number;
  item: Item;
}

export interface LevelDef {
  id: string;
  name: string;
  /**
   * '#' wall, '.' floor, '1'-'4' spawn (floor), 'C' counter, 'T' tomato crate,
   * 'L' lettuce crate, 'O' onion crate, 'M' mushroom crate, 'B' chopping board,
   * 'S' stove (starts with a pot), 'P' plate stack, 'W' serving window, 'X' bin, 'R' plate return
   */
  rows: string[];
  menu: Dish[];
  /** score thresholds for 1, 2, 3 stars */
  stars: [number, number, number];
  plates: number;
}

export interface ParsedLevel {
  w: number;
  h: number;
  solid: boolean[];
  stations: Station[];
  spawns: Array<{ x: number; y: number }>;
}

export interface KitchenState {
  level: string;
  w: number;
  h: number;
  solid: boolean[];
  stations: Station[];
  spawns: Array<{ x: number; y: number }>;
  chefs: Record<string, Chef>;
  floor: FloorItem[];
  orders: Order[];
  /** seconds until each served plate comes back */
  returns: number[];
  roundTime: number;
  time: number;
  tick: number;
  nextOrderIn: number;
  orderSeq: number;
  floorSeq: number;
  score: number;
  streak: number;
  served: number;
  failed: number;
  rng: number;
  over: boolean;
  /** change counter; stations carry v, orders/floor carry ordersV/floorV */
  rev: number;
  ordersV: number;
  floorV: number;
}

export type KitchenEvent =
  | { type: 'served'; chef: string; dish: Dish; points: number; streak: number }
  | { type: 'rejected'; chef: string }
  | { type: 'expired'; dish: Dish }
  | { type: 'chopped'; chef: string }
  | { type: 'burnt'; x: number; y: number }
  | { type: 'end'; score: number; stars: number; served: number; failed: number };

export interface ChefSnap {
  id: string;
  x: number;
  y: number;
  fx: number;
  fy: number;
  held: Item | null;
  chop: boolean;
  dash: boolean;
}

export interface StationSnap {
  i: number;
  item: Item | null;
  chop: number;
  count: number;
}

export interface KitchenSnap {
  tick: number;
  time: number;
  score: number;
  streak: number;
  over: boolean;
  /** chef id -> last input seq the server applied */
  acks: Record<string, number>;
  chefs: ChefSnap[];
  stations?: StationSnap[];
  orders?: Order[];
  floor?: FloorItem[];
  full?: true;
}
```

- [ ] **Step 2: Write constants** — `shared/src/kitchen/constants.ts`:

```ts
export const K_TICK_HZ = 30;
export const K_DT = 1 / K_TICK_HZ;
export const K_SNAP_HZ = 20;

export const CHEF_R = 0.35;
export const CHEF_SPEED = 4.5;
/** stick deflection below this is ignored */
export const DEADZONE = 0.2;
export const DASH_TIME = 0.18;
export const DASH_MULT = 3;
export const DASH_COOLDOWN = 1;
/** how far in front of a chef grab/use reaches, in tiles */
export const REACH = 0.75;
export const FLOOR_PICK_RADIUS = 0.8;

export const CHOP_TIME = 2;
export const COOK_PER_ING = 3;
export const POT_MAX = 3;
export const BURN_AFTER = 8;
export const PLATE_RETURN = 5;

export const ROUND_TIME = 180;
export const FIRST_ORDER = 2;
export const ORDER_EVERY = 12;
export const ORDER_TIME = 60;
export const ORDER_WARN = 15;
export const MAX_ORDERS = 5;
export const SERVE_BASE = 20;
export const TIP_MAX = 8;
export const STREAK_MAX = 4;
export const EXPIRE_PENALTY = 10;

export const CREW_MAX = 4;
/** order interval multiplier by crew size (index = size) */
export const CREW_SCALE = [1.6, 1.6, 1.25, 1.1, 1.0] as const;

export const KITCHEN_COINS_PER_STAR = 10;
export const KITCHEN_COINS_HOURLY_CAP = 150;
export const RECONNECT_SECONDS = 20;
```

- [ ] **Step 3: Write RNG** — `shared/src/kitchen/rng.ts`:

```ts
/** mulberry32 step: [value in [0,1), next seed]. The seed lives in state so replays are identical. */
export function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
```

- [ ] **Step 4: Write minimal items** — `shared/src/kitchen/items.ts` (Task 3 extends it):

```ts
import { PlateItem, PotItem } from './types';

export const emptyPot = (): PotItem => ({ kind: 'pot', contents: [], cook: 0, over: 0, burnt: false });
export const emptyPlate = (): PlateItem => ({ kind: 'plate', soup: null, parts: [] });
```

- [ ] **Step 5: Write the failing level test** — `shared/src/kitchen/levels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LEVELS, parseLevel } from './levels';
import { nextRandom } from './rng';

describe('levels', () => {
  it('Diner parses into a 14x9 kitchen with every station kind and 4 spawns', () => {
    const lv = parseLevel(LEVELS.diner);
    expect([lv.w, lv.h]).toEqual([14, 9]);
    const kinds = new Set<string>(lv.stations.map((s) => s.kind));
    for (const k of ['counter', 'crate', 'board', 'stove', 'plates', 'window', 'bin', 'return']) expect(kinds.has(k), k).toBe(true);
    expect(lv.spawns).toHaveLength(4);
    for (const sp of lv.spawns) expect(lv.solid[Math.floor(sp.y) * lv.w + Math.floor(sp.x)]).toBe(false);
    expect(lv.stations.filter((s) => s.kind === 'stove').every((s) => s.item?.kind === 'pot')).toBe(true);
    expect(lv.stations.find((s) => s.kind === 'plates')?.count).toBe(LEVELS.diner.plates);
    expect(lv.stations.filter((s) => s.kind === 'crate').map((s) => s.ing).sort()).toEqual(['lettuce', 'mushroom', 'onion', 'tomato']);
  });

  it('rejects ragged rows and unknown tiles', () => {
    expect(() => parseLevel({ ...LEVELS.diner, rows: ['###', '##'] })).toThrow(/wide/);
    expect(() => parseLevel({ ...LEVELS.diner, rows: ['#?#'] })).toThrow(/unknown tile/);
  });

  it('rng is deterministic and in range', () => {
    const a = nextRandom(42);
    expect(nextRandom(42)).toEqual(a);
    expect(a[0]).toBeGreaterThanOrEqual(0);
    expect(a[0]).toBeLessThan(1);
    expect(nextRandom(a[1])[0]).not.toBe(a[0]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/levels.test.ts`
Expected: FAIL, cannot resolve `./levels`.

- [ ] **Step 7: Implement levels** — `shared/src/kitchen/levels.ts`:

```ts
import { emptyPot } from './items';
import { Ingredient, LevelDef, ParsedLevel, Station, StationKind } from './types';

export const DINER: LevelDef = {
  id: 'diner',
  name: 'Dovey Diner',
  rows: [
    '#TLOMCCWWCPRX#',
    'B............S',
    'C.1........2.C',
    'C...CCCCCC...C',
    'B............S',
    'C...CCCCCC...C',
    'C.3........4.C',
    'C............C',
    '##CCCCCCCCCC##',
  ],
  menu: ['soup_tomato', 'soup_onion', 'soup_mushroom', 'salad', 'salad_tomato'],
  stars: [60, 160, 280],
  plates: 4,
};

export const LEVELS: Record<string, LevelDef> = { diner: DINER };

export function levelDef(id: string): LevelDef | undefined {
  return Object.prototype.hasOwnProperty.call(LEVELS, id) ? LEVELS[id] : undefined;
}

const STATION_CHARS: Record<string, StationKind> = {
  C: 'counter',
  T: 'crate',
  L: 'crate',
  O: 'crate',
  M: 'crate',
  B: 'board',
  S: 'stove',
  P: 'plates',
  W: 'window',
  X: 'bin',
  R: 'return',
};
const CRATE_ING: Record<string, Ingredient> = { T: 'tomato', L: 'lettuce', O: 'onion', M: 'mushroom' };

export function parseLevel(def: LevelDef): ParsedLevel {
  const h = def.rows.length;
  const w = def.rows[0]?.length ?? 0;
  const solid: boolean[] = [];
  const stations: Station[] = [];
  const spawns: Array<{ x: number; y: number }> = [];
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`level ${def.id}: row ${y} is ${row.length} wide, expected ${w}`);
    [...row].forEach((ch, x) => {
      if (ch === '.' || /^[1-4]$/.test(ch)) {
        solid.push(false);
        if (ch !== '.') spawns[Number(ch) - 1] = { x: x + 0.5, y: y + 0.5 };
        return;
      }
      solid.push(true);
      if (ch === '#') return;
      const kind = STATION_CHARS[ch];
      if (!kind) throw new Error(`level ${def.id}: unknown tile '${ch}' at ${x},${y}`);
      stations.push({
        kind,
        x,
        y,
        item: kind === 'stove' ? emptyPot() : null,
        ing: CRATE_ING[ch] ?? null,
        chop: 0,
        count: kind === 'plates' ? def.plates : 0,
        v: 0,
      });
    });
  });
  return { w, h, solid, stations, spawns: spawns.filter(Boolean) };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/levels.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add shared/src/kitchen
git commit -m "feat(kitchen): shared types, constants, rng and Diner level"
```

---

### Task 2: Chef physics

**Files:**
- Create: `shared/src/kitchen/physics.ts`
- Test: `shared/src/kitchen/physics.test.ts`

**Interfaces:**
- Consumes: `CHEF_R`, `CHEF_SPEED`, `DEADZONE`, `DASH_TIME`, `DASH_MULT`, `DASH_COOLDOWN`.
- Produces:
  - `type MovingChef = { x: number; y: number; fx: number; fy: number; dash: number; dashCd: number }`
  - `isSolid(solid: boolean[], w: number, h: number, tx: number, ty: number): boolean`
  - `moveBody(b: { x: number; y: number }, dx: number, dy: number, solid: boolean[], w: number, h: number): void`
  - `moveChef(c: MovingChef, inp: { mx: number; my: number; dash: boolean }, dt: number, solid: boolean[], w: number, h: number): void`
  - `separateChefs(chefs: Array<{ x: number; y: number }>, solid: boolean[], w: number, h: number): void`

- [ ] **Step 1: Write the failing test** — `shared/src/kitchen/physics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHEF_R, CHEF_SPEED, DASH_COOLDOWN, K_DT } from './constants';
import { MovingChef, isSolid, moveChef, separateChefs } from './physics';

// 5x5 room: walls around, open 3x3 middle
const W = 5;
const H = 5;
const solid = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  return x === 0 || y === 0 || x === W - 1 || y === H - 1;
});
const chef = (x = 2.5, y = 2.5): MovingChef => ({ x, y, fx: 0, fy: 1, dash: 0, dashCd: 0 });
const idle = { mx: 0, my: 0, dash: false };

describe('physics', () => {
  it('treats out of bounds as solid', () => {
    expect(isSolid(solid, W, H, -1, 2)).toBe(true);
    expect(isSolid(solid, W, H, 2, 2)).toBe(false);
  });

  it('walks at CHEF_SPEED and turns to face the stick', () => {
    const c = chef();
    moveChef(c, { mx: 1, my: 0, dash: false }, K_DT, solid, W, H);
    expect(c.x).toBeCloseTo(2.5 + CHEF_SPEED * K_DT, 6);
    expect([c.fx, c.fy]).toEqual([1, 0]);
  });

  it('normalizes diagonals and ignores the deadzone', () => {
    const c = chef();
    moveChef(c, { mx: 1, my: 1, dash: false }, K_DT, solid, W, H);
    expect(Math.hypot(c.x - 2.5, c.y - 2.5)).toBeCloseTo(CHEF_SPEED * K_DT, 6);
    const d = chef();
    moveChef(d, { mx: 0.1, my: 0, dash: false }, K_DT, solid, W, H);
    expect([d.x, d.y, d.fx, d.fy]).toEqual([2.5, 2.5, 0, 1]);
  });

  it('stops against walls and slides along them', () => {
    const c = chef();
    for (let i = 0; i < 60; i++) moveChef(c, { mx: 1, my: 1, dash: false }, K_DT, solid, W, H);
    expect(c.x).toBeCloseTo(W - 1 - CHEF_R, 6);
    expect(c.y).toBeCloseTo(H - 1 - CHEF_R, 6);
  });

  it('dashes forward then cools down', () => {
    const c = chef(1.5, 2.5);
    c.fx = 1;
    c.fy = 0;
    moveChef(c, { mx: 0, my: 0, dash: true }, K_DT, solid, W, H);
    expect(c.x).toBeGreaterThan(1.5 + CHEF_SPEED * K_DT * 2);
    expect(c.dashCd).toBeCloseTo(DASH_COOLDOWN, 6);
    const x = c.x;
    for (let i = 0; i < 10; i++) moveChef(c, idle, K_DT, solid, W, H);
    const after = c.x;
    expect(after).toBeGreaterThan(x); // dash carried on for its remaining time
    moveChef(c, { mx: 0, my: 0, dash: true }, K_DT, solid, W, H);
    expect(c.x).toBe(after); // still cooling down, no stick: no movement
  });

  it('pushes overlapping chefs apart without entering walls', () => {
    const a = { x: 2.5, y: 2.5 };
    const b = { x: 2.6, y: 2.5 };
    for (let i = 0; i < 20; i++) separateChefs([a, b], solid, W, H);
    expect(b.x - a.x).toBeGreaterThan(CHEF_R * 2 - 0.05);
    for (const p of [a, b]) expect(p.x).toBeGreaterThanOrEqual(1 + CHEF_R - 1e-9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/physics.test.ts`
Expected: FAIL, cannot resolve `./physics`.

- [ ] **Step 3: Implement physics** — `shared/src/kitchen/physics.ts`:

```ts
import { CHEF_R, CHEF_SPEED, DASH_COOLDOWN, DASH_MULT, DASH_TIME, DEADZONE } from './constants';

export type MovingChef = { x: number; y: number; fx: number; fy: number; dash: number; dashCd: number };

const EPS = 1e-6;

export function isSolid(solid: boolean[], w: number, h: number, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
  return solid[ty * w + tx];
}

/** Chefs collide as squares of half-size CHEF_R; resolving one axis at a time lets them slide along counters. */
function resolve(b: { x: number; y: number }, solid: boolean[], w: number, h: number, axis: 'x' | 'y') {
  const minX = Math.floor(b.x - CHEF_R + EPS);
  const maxX = Math.floor(b.x + CHEF_R - EPS);
  const minY = Math.floor(b.y - CHEF_R + EPS);
  const maxY = Math.floor(b.y + CHEF_R - EPS);
  for (let ty = minY; ty <= maxY; ty++)
    for (let tx = minX; tx <= maxX; tx++) {
      if (!isSolid(solid, w, h, tx, ty)) continue;
      if (axis === 'x') b.x = b.x < tx + 0.5 ? Math.min(b.x, tx - CHEF_R) : Math.max(b.x, tx + 1 + CHEF_R);
      else b.y = b.y < ty + 0.5 ? Math.min(b.y, ty - CHEF_R) : Math.max(b.y, ty + 1 + CHEF_R);
    }
}

/** Steps must stay under half a tile (a dash tick is 0.45) so a chef never tunnels through a counter. */
export function moveBody(b: { x: number; y: number }, dx: number, dy: number, solid: boolean[], w: number, h: number) {
  b.x += dx;
  resolve(b, solid, w, h, 'x');
  b.y += dy;
  resolve(b, solid, w, h, 'y');
}

export function moveChef(c: MovingChef, inp: { mx: number; my: number; dash: boolean }, dt: number, solid: boolean[], w: number, h: number) {
  let mx = Number.isFinite(inp.mx) ? Math.max(-1, Math.min(1, inp.mx)) : 0;
  let my = Number.isFinite(inp.my) ? Math.max(-1, Math.min(1, inp.my)) : 0;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const steering = len > DEADZONE;
  if (steering) {
    const l = Math.hypot(mx, my);
    c.fx = mx / l;
    c.fy = my / l;
  }
  c.dashCd = Math.max(0, c.dashCd - dt);
  if (inp.dash && c.dashCd <= 0) {
    c.dash = DASH_TIME;
    c.dashCd = DASH_COOLDOWN;
  }
  if (c.dash > 0) {
    const v = CHEF_SPEED * DASH_MULT;
    c.dash = Math.max(0, c.dash - dt);
    moveBody(c, c.fx * v * dt, c.fy * v * dt, solid, w, h);
    return;
  }
  if (!steering) return;
  moveBody(c, mx * CHEF_SPEED * dt, my * CHEF_SPEED * dt, solid, w, h);
}

/** Soft push between overlapping chefs. Callers pass chefs in a stable order (sorted ids) to stay deterministic. */
export function separateChefs(chefs: Array<{ x: number; y: number }>, solid: boolean[], w: number, h: number) {
  const min = CHEF_R * 2;
  for (let i = 0; i < chefs.length; i++)
    for (let j = i + 1; j < chefs.length; j++) {
      const a = chefs[i];
      const b = chefs[j];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist >= min) continue;
      const nx = dist < EPS ? 1 : (b.x - a.x) / dist;
      const ny = dist < EPS ? 0 : (b.y - a.y) / dist;
      const push = (min - dist) / 4;
      moveBody(a, -nx * push, -ny * push, solid, w, h);
      moveBody(b, nx * push, ny * push, solid, w, h);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/physics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/src/kitchen/physics.ts shared/src/kitchen/physics.test.ts
git commit -m "feat(kitchen): chef movement, dash and collisions"
```
