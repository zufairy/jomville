# Kitchen Co-op Stage 1 Plan — Part 2 (Tasks 3-6: simulation)

Continues `2026-09-14-kitchen-coop-stage1.md`. Header, Global Constraints and File Map live there.

---

### Task 3: Items and combine rules

**Files:**
- Modify: `shared/src/kitchen/items.ts` (replace the Task 1 stub)
- Test: `shared/src/kitchen/items.test.ts`

**Interfaces:**
- Consumes: `COOK_PER_ING`, `POT_MAX`; item types.
- Produces:
  - `SOUP_INGS`, `SALAD_INGS: readonly Ingredient[]`
  - `emptyPot(): PotItem`, `emptyPlate(): PlateItem`
  - `potDone(p: PotItem): boolean`, `plateEmpty(p: PlateItem): boolean`
  - `canAddToPot(p: PotItem, i: IngItem): boolean`, `canAddToPlate(p: PlateItem, i: IngItem): boolean`
  - `plateDish(p: PlateItem): Dish | null`
  - `binItem(item: Item): Item | null`
  - `combine(held: Item, target: Item): { held: Item | null; target: Item | null } | null`

- [ ] **Step 1: Write the failing test** — `shared/src/kitchen/items.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COOK_PER_ING, POT_MAX } from './constants';
import { binItem, combine, emptyPlate, emptyPot, plateDish, potDone } from './items';
import { IngItem, Ingredient, PlateItem, PotItem } from './types';

const chopped = (ing: Ingredient): IngItem => ({ kind: 'ing', ing, chopped: true });
const raw = (ing: Ingredient): IngItem => ({ kind: 'ing', ing, chopped: false });
const donePot = (ing: Ingredient): PotItem => ({ kind: 'pot', contents: [ing, ing, ing], cook: COOK_PER_ING * POT_MAX, over: 0, burnt: false });
const asPlate = (i: unknown) => i as PlateItem;

describe('items', () => {
  it('puts chopped soup ingredients of one kind into a pot, up to 3', () => {
    let pot: PotItem = emptyPot();
    for (let i = 0; i < 3; i++) {
      const r = combine(chopped('tomato'), pot);
      expect(r?.held).toBeNull();
      pot = r!.target as PotItem;
    }
    expect(pot.contents).toEqual(['tomato', 'tomato', 'tomato']);
    expect(combine(chopped('tomato'), pot)).toBeNull(); // full
    expect(combine(raw('onion'), emptyPot())).toBeNull(); // raw
    expect(combine(chopped('lettuce'), emptyPot())).toBeNull(); // not a soup
    expect(combine(chopped('onion'), { ...emptyPot(), contents: ['tomato'] })).toBeNull(); // mixed
  });

  it('a held pot scoops a chopped ingredient off a counter', () => {
    expect(combine(emptyPot(), chopped('mushroom'))).toEqual({ held: { ...emptyPot(), contents: ['mushroom'] }, target: null });
  });

  it('builds salads on plates and names the dish', () => {
    const a = combine(chopped('lettuce'), emptyPlate())!;
    expect(plateDish(asPlate(a.target))).toBe('salad');
    const b = combine(a.target!, chopped('tomato'))!;
    expect(b.target).toBeNull();
    expect(plateDish(asPlate(b.held))).toBe('salad_tomato');
    expect(combine(b.held!, chopped('tomato'))).toBeNull(); // duplicate
    expect(combine(chopped('onion'), emptyPlate())).toBeNull(); // not a salad part
    expect(plateDish({ kind: 'plate', soup: null, parts: ['tomato'] })).toBeNull();
  });

  it('pours a finished soup onto an empty plate either way round', () => {
    expect(potDone(donePot('onion'))).toBe(true);
    const a = combine(donePot('onion'), emptyPlate())!;
    expect(a.held).toEqual(emptyPot());
    expect(plateDish(asPlate(a.target))).toBe('soup_onion');
    const b = combine(emptyPlate(), donePot('tomato'))!;
    expect(plateDish(asPlate(b.held))).toBe('soup_tomato');
    expect(b.target).toEqual(emptyPot());
    expect(combine(emptyPlate(), { ...donePot('tomato'), cook: 1 })).toBeNull(); // not cooked
    expect(combine(emptyPlate(), { ...donePot('tomato'), burnt: true })).toBeNull();
    expect(combine(donePot('tomato'), { kind: 'plate', soup: null, parts: ['lettuce'] })).toBeNull();
  });

  it('bins ingredients and empties containers', () => {
    expect(binItem(raw('onion'))).toBeNull();
    expect(binItem({ kind: 'plate', soup: 'tomato', parts: [] })).toEqual(emptyPlate());
    expect(binItem({ ...donePot('tomato'), burnt: true })).toEqual(emptyPot());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/items.test.ts`
Expected: FAIL, `combine` is not exported.

- [ ] **Step 3: Implement** — replace `shared/src/kitchen/items.ts`:

```ts
import { COOK_PER_ING, POT_MAX } from './constants';
import { Dish, IngItem, Ingredient, Item, PlateItem, PotItem } from './types';

export const SOUP_INGS: readonly Ingredient[] = ['tomato', 'onion', 'mushroom'];
export const SALAD_INGS: readonly Ingredient[] = ['lettuce', 'tomato'];

export const emptyPot = (): PotItem => ({ kind: 'pot', contents: [], cook: 0, over: 0, burnt: false });
export const emptyPlate = (): PlateItem => ({ kind: 'plate', soup: null, parts: [] });

export function potDone(p: PotItem): boolean {
  return !p.burnt && p.contents.length === POT_MAX && p.cook >= COOK_PER_ING * POT_MAX;
}

export function plateEmpty(p: PlateItem): boolean {
  return p.soup === null && p.parts.length === 0;
}

export function canAddToPot(p: PotItem, i: IngItem): boolean {
  return i.chopped && SOUP_INGS.includes(i.ing) && !p.burnt && p.contents.length < POT_MAX && (p.contents.length === 0 || p.contents[0] === i.ing);
}

export function canAddToPlate(p: PlateItem, i: IngItem): boolean {
  return i.chopped && SALAD_INGS.includes(i.ing) && p.soup === null && !p.parts.includes(i.ing);
}

export function plateDish(p: PlateItem): Dish | null {
  if (p.soup) return p.parts.length ? null : (`soup_${p.soup}` as Dish);
  const parts = [...p.parts].sort().join('+');
  if (parts === 'lettuce') return 'salad';
  if (parts === 'lettuce+tomato') return 'salad_tomato';
  return null;
}

/** What the bin leaves in your hands: nothing for food, an empty container otherwise. */
export function binItem(item: Item): Item | null {
  if (item.kind === 'ing') return null;
  return item.kind === 'plate' ? emptyPlate() : emptyPot();
}

const addToPot = (p: PotItem, ing: Ingredient): PotItem => ({ ...p, contents: [...p.contents, ing] });
const addToPlate = (p: PlateItem, ing: Ingredient): PlateItem => ({ ...p, parts: [...p.parts, ing] });

/** Merge what a chef holds with an item on a station. null when the two don't go together. */
export function combine(held: Item, target: Item): { held: Item | null; target: Item | null } | null {
  if (held.kind === 'ing' && target.kind === 'pot' && canAddToPot(target, held)) return { held: null, target: addToPot(target, held.ing) };
  if (held.kind === 'pot' && target.kind === 'ing' && canAddToPot(held, target)) return { held: addToPot(held, target.ing), target: null };
  if (held.kind === 'ing' && target.kind === 'plate' && canAddToPlate(target, held)) return { held: null, target: addToPlate(target, held.ing) };
  if (held.kind === 'plate' && target.kind === 'ing' && canAddToPlate(held, target)) return { held: addToPlate(held, target.ing), target: null };
  if (held.kind === 'pot' && target.kind === 'plate' && potDone(held) && plateEmpty(target))
    return { held: emptyPot(), target: { ...target, soup: held.contents[0] } };
  if (held.kind === 'plate' && target.kind === 'pot' && potDone(target) && plateEmpty(held))
    return { held: { ...held, soup: target.contents[0] }, target: emptyPot() };
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/items.test.ts src/kitchen/levels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/kitchen/items.ts shared/src/kitchen/items.test.ts
git commit -m "feat(kitchen): item combine rules and dish matching"
```

---

### Task 4: Kitchen state creation and orders

**Files:**
- Create: `shared/src/kitchen/sim.ts` (create/add/remove only; Task 5 adds `step`), `shared/src/kitchen/orders.ts`
- Test: `shared/src/kitchen/orders.test.ts`

**Interfaces:**
- Produces:
  - `createKitchen(levelId: string, seed: number, chefIds?: string[], roundTime?: number): KitchenState`
  - `addChef(s: KitchenState, id: string): void`, `removeChef(s: KitchenState, id: string): void`
  - `crewScale(n: number): number`, `spawnOrder(s, def): void`
  - `tickOrders(s: KitchenState, def: LevelDef, dt: number, events: KitchenEvent[]): void`
  - `serveDish(s: KitchenState, chef: string, dish: Dish, events: KitchenEvent[]): boolean`
  - `starsFor(score: number, def: LevelDef): number`

- [ ] **Step 1: Write the failing test** — `shared/src/kitchen/orders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EXPIRE_PENALTY, FIRST_ORDER, MAX_ORDERS, ORDER_EVERY, ORDER_TIME, SERVE_BASE } from './constants';
import { LEVELS } from './levels';
import { serveDish, starsFor, tickOrders } from './orders';
import { addChef, createKitchen, removeChef } from './sim';
import { KitchenEvent } from './types';

const def = LEVELS.diner;

describe('kitchen state', () => {
  it('spawns chefs on distinct spawn tiles and drops held items when one leaves', () => {
    const s = createKitchen('diner', 1, ['a', 'b']);
    expect(s.chefs.a).toMatchObject({ x: s.spawns[0].x, y: s.spawns[0].y, held: null });
    expect([s.chefs.b.x, s.chefs.b.y]).toEqual([s.spawns[1].x, s.spawns[1].y]);
    addChef(s, 'a'); // no-op
    expect(Object.keys(s.chefs)).toEqual(['a', 'b']);
    s.chefs.b.held = { kind: 'ing', ing: 'onion', chopped: false };
    removeChef(s, 'b');
    expect(s.chefs.b).toBeUndefined();
    expect(s.floor).toHaveLength(1);
    expect(() => createKitchen('nope', 1)).toThrow(/unknown level/);
  });
});

describe('orders', () => {
  it('first order after FIRST_ORDER, then every ORDER_EVERY scaled by crew size', () => {
    const s = createKitchen('diner', 3, ['a']);
    const ev: KitchenEvent[] = [];
    const run = (sec: number) => {
      for (let i = 0; i < Math.round(sec * 10); i++) tickOrders(s, def, 0.1, ev);
    };
    run(FIRST_ORDER - 0.1);
    expect(s.orders).toHaveLength(0);
    run(0.1);
    expect(s.orders).toHaveLength(1);
    expect(def.menu).toContain(s.orders[0].dish);
    run(ORDER_EVERY * 1.6 - 0.1);
    expect(s.orders).toHaveLength(1);
    run(0.1);
    expect(s.orders).toHaveLength(2);

    const full = createKitchen('diner', 3, ['a', 'b', 'c', 'd']);
    full.orders = Array.from({ length: MAX_ORDERS }, (_, i) => ({ id: i + 1, dish: 'salad' as const, left: 100, total: 100 }));
    full.nextOrderIn = 0.05;
    tickOrders(full, def, 0.1, ev);
    expect(full.orders).toHaveLength(MAX_ORDERS);
    expect(full.nextOrderIn).toBeCloseTo(ORDER_EVERY - 0.05, 6);
  });

  it('expired orders cost points (floored at 0) and break the streak', () => {
    const s = createKitchen('diner', 1, ['a']);
    s.score = 25;
    s.streak = 3;
    s.nextOrderIn = 99;
    s.orders = [{ id: 1, dish: 'salad', left: 0.05, total: ORDER_TIME }];
    const ev: KitchenEvent[] = [];
    tickOrders(s, def, 0.1, ev);
    expect(s.orders).toHaveLength(0);
    expect([s.score, s.streak, s.failed]).toEqual([25 - EXPIRE_PENALTY, 0, 1]);
    expect(ev).toEqual([{ type: 'expired', dish: 'salad' }]);
    s.score = 3;
    s.orders = [{ id: 2, dish: 'salad', left: 0.01, total: ORDER_TIME }];
    tickOrders(s, def, 0.1, ev);
    expect(s.score).toBe(0);
  });

  it('serving pays base + tip, oldest-first builds the streak, wrong dishes are rejected', () => {
    const s = createKitchen('diner', 1, ['a']);
    s.orders = [
      { id: 1, dish: 'soup_tomato', left: 60, total: 60 },
      { id: 2, dish: 'salad', left: 30, total: 60 },
    ];
    const ev: KitchenEvent[] = [];
    expect(serveDish(s, 'a', 'salad', ev)).toBe(true); // not the oldest: streak 1, tip 4
    expect(s.score).toBe(SERVE_BASE + 4);
    expect(serveDish(s, 'a', 'soup_tomato', ev)).toBe(true); // now the oldest: streak 2, tip 8 x 2
    expect(s.score).toBe(SERVE_BASE + 4 + SERVE_BASE + 16);
    expect(s.returns).toHaveLength(2);
    expect(serveDish(s, 'a', 'soup_onion', ev)).toBe(false);
    expect(ev.map((e) => e.type)).toEqual(['served', 'served', 'rejected']);
  });

  it('stars follow the level thresholds', () => {
    expect([59, 60, 159, 160, 280].map((n) => starsFor(n, def))).toEqual([0, 1, 1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/orders.test.ts`
Expected: FAIL, cannot resolve `./orders` / `./sim`.

- [ ] **Step 3: Implement orders** — `shared/src/kitchen/orders.ts`:

```ts
import { CREW_MAX, CREW_SCALE, EXPIRE_PENALTY, MAX_ORDERS, ORDER_EVERY, ORDER_TIME, PLATE_RETURN, SERVE_BASE, STREAK_MAX, TIP_MAX } from './constants';
import { nextRandom } from './rng';
import { Dish, KitchenEvent, KitchenState, LevelDef } from './types';

const EPS = 1e-6;

export function crewScale(n: number): number {
  return CREW_SCALE[Math.min(CREW_MAX, Math.max(1, n))];
}

export function spawnOrder(s: KitchenState, def: LevelDef) {
  const [r, next] = nextRandom(s.rng);
  s.rng = next;
  const dish = def.menu[Math.floor(r * def.menu.length)];
  s.orders.push({ id: ++s.orderSeq, dish, left: ORDER_TIME, total: ORDER_TIME });
  s.ordersV = ++s.rev;
}

/** Counts order timers down (clients extrapolate, so ticking alone doesn't mark orders changed). */
export function tickOrders(s: KitchenState, def: LevelDef, dt: number, events: KitchenEvent[]) {
  let expired = false;
  for (const o of s.orders) o.left -= dt;
  s.orders = s.orders.filter((o) => {
    if (o.left > EPS) return true;
    s.score = Math.max(0, s.score - EXPIRE_PENALTY);
    s.failed++;
    expired = true;
    events.push({ type: 'expired', dish: o.dish });
    return false;
  });
  if (expired) {
    s.streak = 0;
    s.ordersV = ++s.rev;
  }
  s.nextOrderIn -= dt;
  if (s.nextOrderIn <= EPS) {
    if (s.orders.length < MAX_ORDERS) spawnOrder(s, def);
    s.nextOrderIn += ORDER_EVERY * crewScale(Object.keys(s.chefs).length);
  }
}

export function serveDish(s: KitchenState, chef: string, dish: Dish, events: KitchenEvent[]): boolean {
  const idx = s.orders.findIndex((o) => o.dish === dish);
  if (idx < 0) {
    events.push({ type: 'rejected', chef });
    return false;
  }
  const o = s.orders[idx];
  s.streak = idx === 0 ? Math.min(STREAK_MAX, s.streak + 1) : 1;
  const points = SERVE_BASE + Math.round((TIP_MAX * Math.max(0, o.left)) / o.total) * s.streak;
  s.score += points;
  s.served++;
  s.orders.splice(idx, 1);
  s.returns.push(PLATE_RETURN);
  s.ordersV = ++s.rev;
  events.push({ type: 'served', chef, dish, points, streak: s.streak });
  return true;
}

export function starsFor(score: number, def: LevelDef): number {
  return def.stars.filter((t) => score >= t).length;
}
```

- [ ] **Step 4: Implement state creation** — `shared/src/kitchen/sim.ts`:

```ts
import { FIRST_ORDER, ROUND_TIME } from './constants';
import { levelDef, parseLevel } from './levels';
import { KitchenState } from './types';

export function createKitchen(levelId: string, seed: number, chefIds: string[] = [], roundTime = ROUND_TIME): KitchenState {
  const def = levelDef(levelId);
  if (!def) throw new Error(`unknown level ${levelId}`);
  const lv = parseLevel(def);
  const s: KitchenState = {
    level: def.id,
    w: lv.w,
    h: lv.h,
    solid: lv.solid,
    stations: lv.stations,
    spawns: lv.spawns,
    chefs: {},
    floor: [],
    orders: [],
    returns: [],
    roundTime,
    time: roundTime,
    tick: 0,
    nextOrderIn: FIRST_ORDER,
    orderSeq: 0,
    floorSeq: 0,
    score: 0,
    streak: 0,
    served: 0,
    failed: 0,
    rng: seed | 0,
    over: false,
    rev: 1,
    ordersV: 1,
    floorV: 1,
  };
  for (const id of chefIds) addChef(s, id);
  return s;
}

/** Chefs spawn on the first spawn tile nobody is standing on. */
export function addChef(s: KitchenState, id: string) {
  if (s.chefs[id]) return;
  const others = Object.values(s.chefs);
  const sp = s.spawns.find((p) => !others.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 0.5)) ?? s.spawns[0];
  s.chefs[id] = { id, x: sp.x, y: sp.y, fx: 0, fy: 1, held: null, dash: 0, dashCd: 0, seq: 0, chopping: false };
}

export function removeChef(s: KitchenState, id: string) {
  const c = s.chefs[id];
  if (!c) return;
  if (c.held) {
    s.floor.push({ id: ++s.floorSeq, x: c.x, y: c.y, item: c.held });
    s.floorV = ++s.rev;
  }
  delete s.chefs[id];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/orders.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/src/kitchen/orders.ts shared/src/kitchen/sim.ts shared/src/kitchen/orders.test.ts
git commit -m "feat(kitchen): kitchen state, order queue, scoring and stars"
```

---

### Task 5: Stations and the step function

**Files:**
- Create: `shared/src/kitchen/stations.ts`
- Modify: `shared/src/kitchen/sim.ts` (add `IDLE_INPUT`, `step`)
- Test: `shared/src/kitchen/stations.test.ts`

**Interfaces:**
- Produces:
  - `touch(s, st)`, `stationAt(s, tx, ty): Station | undefined`, `facingPoint(c): { x: number; y: number }`
  - `interact(s, c, events)`, `tickChop(s, c, use, dt, events)`, `tickStations(s, dt, events)`
  - `IDLE_INPUT: KitchenInput`
  - `step(s: KitchenState, inputs: Record<string, KitchenInput>, dt?: number): KitchenEvent[]`

Diner station tiles: crates T(1,0) L(2,0) O(3,0) M(4,0); window W(7,0),(8,0); plates P(10,0); return R(11,0); bin X(12,0); boards B(0,1),(0,4); stoves S(13,1),(13,4). Row y=1 is open floor from x=1 to x=12.

- [ ] **Step 1: Write the failing test** — `shared/src/kitchen/stations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BURN_AFTER, CHEF_R, CHOP_TIME, COOK_PER_ING, K_DT, PLATE_RETURN, POT_MAX } from './constants';
import { IDLE_INPUT, createKitchen, step } from './sim';
import { KitchenEvent, KitchenInput, KitchenState, PotItem } from './types';

/** Stand chef `id` next to station (tx,ty) and face it: top row from y=1, left wall from x=1, right wall from x=12. */
function faceTile(s: KitchenState, id: string, tx: number, ty: number) {
  const c = s.chefs[id];
  if (ty === 0) Object.assign(c, { x: tx + 0.5, y: 1 + CHEF_R, fx: 0, fy: -1 });
  else if (tx === 0) Object.assign(c, { x: 1 + CHEF_R, y: ty + 0.5, fx: -1, fy: 0 });
  else Object.assign(c, { x: tx - CHEF_R, y: ty + 0.5, fx: 1, fy: 0 });
}
const press = (s: KitchenState, id: string, extra: Partial<KitchenInput> = {}) => step(s, { [id]: { ...IDLE_INPUT, grab: true, ...extra } });
const idle = (s: KitchenState, ticks: number) => {
  const ev: KitchenEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...step(s, {}));
  return ev;
};
const station = (s: KitchenState, x: number, y: number) => s.stations.find((t) => t.x === x && t.y === y)!;

function kitchen() {
  const s = createKitchen('diner', 9, ['a']);
  s.nextOrderIn = 1e9; // tests add orders by hand
  return s;
}

describe('stations', () => {
  it('crate gives a raw ingredient; board chops it while Use is held', () => {
    const s = kitchen();
    faceTile(s, 'a', 1, 0);
    press(s, 'a');
    expect(s.chefs.a.held).toEqual({ kind: 'ing', ing: 'tomato', chopped: false });
    faceTile(s, 'a', 0, 1);
    press(s, 'a');
    expect(station(s, 0, 1).item).toMatchObject({ ing: 'tomato', chopped: false });
    const ev: KitchenEvent[] = [];
    const ticks = Math.round(CHOP_TIME / K_DT);
    for (let i = 0; i < ticks - 1; i++) ev.push(...step(s, { a: { ...IDLE_INPUT, use: true } }));
    expect(s.chefs.a.chopping).toBe(true);
    expect(station(s, 0, 1).item).toMatchObject({ chopped: false });
    ev.push(...step(s, { a: { ...IDLE_INPUT, use: true } }));
    expect(station(s, 0, 1).item).toMatchObject({ chopped: true });
    expect(ev).toContainEqual({ type: 'chopped', chef: 'a' });
    press(s, 'a');
    expect(s.chefs.a.held).toMatchObject({ ing: 'tomato', chopped: true });
    expect(station(s, 0, 1).item).toBeNull();
  });

  it('stove cooks a full pot, then burns it if left', () => {
    const s = kitchen();
    faceTile(s, 'a', 13, 1);
    for (let i = 0; i < POT_MAX; i++) {
      s.chefs.a.held = { kind: 'ing', ing: 'onion', chopped: true };
      press(s, 'a');
      expect(s.chefs.a.held).toBeNull();
    }
    const pot = () => station(s, 13, 1).item as PotItem;
    expect(pot().contents).toHaveLength(POT_MAX);
    idle(s, Math.round((COOK_PER_ING * POT_MAX) / K_DT));
    expect(pot().cook).toBeCloseTo(COOK_PER_ING * POT_MAX, 6);
    expect(pot().burnt).toBe(false);
    const ev = idle(s, Math.round(BURN_AFTER / K_DT) + 1);
    expect(pot().burnt).toBe(true);
    expect(ev).toContainEqual({ type: 'burnt', x: 13, y: 1 });
  });

  it('plate, pour, serve at the window, plate comes back at the return', () => {
    const s = kitchen();
    const stove = station(s, 13, 1);
    stove.item = { kind: 'pot', contents: ['tomato', 'tomato', 'tomato'], cook: COOK_PER_ING * POT_MAX, over: 0, burnt: false };
    s.orders = [{ id: 1, dish: 'soup_tomato', left: 60, total: 60 }];
    faceTile(s, 'a', 10, 0);
    press(s, 'a');
    expect(s.chefs.a.held).toEqual({ kind: 'plate', soup: null, parts: [] });
    expect(station(s, 10, 0).count).toBe(3);
    faceTile(s, 'a', 13, 1);
    press(s, 'a');
    expect(s.chefs.a.held).toMatchObject({ kind: 'plate', soup: 'tomato' });
    expect((stove.item as PotItem).contents).toEqual([]);
    faceTile(s, 'a', 7, 0);
    const ev = press(s, 'a');
    expect(ev.find((e) => e.type === 'served')).toMatchObject({ dish: 'soup_tomato' });
    expect(s.chefs.a.held).toBeNull();
    expect(s.score).toBeGreaterThan(0);
    idle(s, Math.round(PLATE_RETURN / K_DT) + 1);
    expect(station(s, 11, 0).count).toBe(1);
  });

  it('window rejects a dish nobody ordered and keeps the plate', () => {
    const s = kitchen();
    s.chefs.a.held = { kind: 'plate', soup: null, parts: ['lettuce'] };
    faceTile(s, 'a', 7, 0);
    expect(press(s, 'a')).toContainEqual({ type: 'rejected', chef: 'a' });
    expect(s.chefs.a.held).not.toBeNull();
  });

  it('counters hold one item and combine; bin empties; floor drop and pick up', () => {
    const s = kitchen();
    faceTile(s, 'a', 5, 0); // counter
    s.chefs.a.held = { kind: 'plate', soup: null, parts: [] };
    press(s, 'a');
    expect(station(s, 5, 0).item).toMatchObject({ kind: 'plate' });
    s.chefs.a.held = { kind: 'ing', ing: 'lettuce', chopped: true };
    press(s, 'a');
    expect(station(s, 5, 0).item).toMatchObject({ parts: ['lettuce'] });
    expect(s.chefs.a.held).toBeNull();

    s.chefs.a.held = { kind: 'ing', ing: 'onion', chopped: false };
    faceTile(s, 'a', 12, 0); // bin
    press(s, 'a');
    expect(s.chefs.a.held).toBeNull();

    Object.assign(s.chefs.a, { x: 6.5, y: 2.5, fx: 1, fy: 0 }); // open floor ahead
    s.chefs.a.held = { kind: 'ing', ing: 'mushroom', chopped: false };
    press(s, 'a');
    expect(s.floor).toHaveLength(1);
    press(s, 'a');
    expect(s.floor).toHaveLength(0);
    expect(s.chefs.a.held).toMatchObject({ ing: 'mushroom' });
  });

  it('the round ends once and stops stepping', () => {
    const s = createKitchen('diner', 1, ['a'], 1);
    const ev = idle(s, Math.round(1 / K_DT) + 5);
    expect(ev.filter((e) => e.type === 'end')).toHaveLength(1);
    expect(s.over).toBe(true);
    expect(s.time).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/stations.test.ts`
Expected: FAIL, `step` / `IDLE_INPUT` not exported.

- [ ] **Step 3: Implement stations** — `shared/src/kitchen/stations.ts`:

```ts
import { BURN_AFTER, CHOP_TIME, COOK_PER_ING, FLOOR_PICK_RADIUS, POT_MAX, REACH } from './constants';
import { binItem, combine, emptyPlate, plateDish } from './items';
import { serveDish } from './orders';
import { isSolid } from './physics';
import { Chef, Item, KitchenEvent, KitchenState, Station, StationKind } from './types';

const EPS = 1e-6;

export function touch(s: KitchenState, st: Station) {
  st.v = ++s.rev;
}

export function stationAt(s: KitchenState, tx: number, ty: number): Station | undefined {
  return s.stations.find((st) => st.x === tx && st.y === ty);
}

export function facingPoint(c: Pick<Chef, 'x' | 'y' | 'fx' | 'fy'>): { x: number; y: number } {
  return { x: c.x + c.fx * REACH, y: c.y + c.fy * REACH };
}

/** Which items a holding station accepts; stations missing here don't hold items. */
const HOLDS: Partial<Record<StationKind, (i: Item) => boolean>> = {
  counter: () => true,
  board: (i) => i.kind === 'ing',
  stove: (i) => i.kind === 'pot',
};

/** Grab / put down: acts on the station in front of the chef, else on the floor there. */
export function interact(s: KitchenState, c: Chef, events: KitchenEvent[]) {
  const p = facingPoint(c);
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  const st = stationAt(s, tx, ty);
  if (st) return useStation(s, c, st, events);
  if (isSolid(s.solid, s.w, s.h, tx, ty)) return;
  useFloor(s, c, p.x, p.y);
}

function useStation(s: KitchenState, c: Chef, st: Station, events: KitchenEvent[]) {
  const held = c.held;
  switch (st.kind) {
    case 'crate':
      if (!held && st.ing) c.held = { kind: 'ing', ing: st.ing, chopped: false };
      return;
    case 'plates':
    case 'return':
      if (!held && st.count > 0) {
        st.count--;
        c.held = emptyPlate();
        touch(s, st);
      }
      return;
    case 'bin':
      if (held) c.held = binItem(held);
      return;
    case 'window': {
      if (held?.kind !== 'plate') return;
      const dish = plateDish(held);
      if (!dish) events.push({ type: 'rejected', chef: c.id });
      else if (serveDish(s, c.id, dish, events)) c.held = null;
      return;
    }
  }
  const holds = HOLDS[st.kind];
  if (!holds) return;
  if (!held) {
    if (!st.item) return;
    c.held = st.item;
    st.item = null;
    st.chop = 0;
    touch(s, st);
    return;
  }
  if (!st.item) {
    if (!holds(held)) return;
    st.item = held;
    c.held = null;
    st.chop = 0;
    touch(s, st);
    return;
  }
  const r = combine(held, st.item);
  if (!r || (r.target && !holds(r.target))) return;
  c.held = r.held;
  st.item = r.target;
  if (!st.item) st.chop = 0;
  touch(s, st);
}

function useFloor(s: KitchenState, c: Chef, x: number, y: number) {
  if (c.held) {
    s.floor.push({ id: ++s.floorSeq, x, y, item: c.held });
    c.held = null;
    s.floorV = ++s.rev;
    return;
  }
  let best = -1;
  let bestD = FLOOR_PICK_RADIUS * FLOOR_PICK_RADIUS;
  s.floor.forEach((f, i) => {
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) return;
  c.held = s.floor[best].item;
  s.floor.splice(best, 1);
  s.floorV = ++s.rev;
}

/** Holding Use with empty hands in front of a board with a raw ingredient chops it. */
export function tickChop(s: KitchenState, c: Chef, use: boolean, dt: number, events: KitchenEvent[]) {
  c.chopping = false;
  if (!use || c.held) return;
  const p = facingPoint(c);
  const st = stationAt(s, Math.floor(p.x), Math.floor(p.y));
  if (st?.kind !== 'board' || st.item?.kind !== 'ing' || st.item.chopped) return;
  c.chopping = true;
  st.chop += dt;
  if (st.chop >= CHOP_TIME - EPS) {
    st.item = { ...st.item, chopped: true };
    st.chop = 0;
    events.push({ type: 'chopped', chef: c.id });
  }
  touch(s, st);
}

/** Pots on stoves cook (and burn); served plates come back to the return. */
export function tickStations(s: KitchenState, dt: number, events: KitchenEvent[]) {
  for (const st of s.stations) {
    if (st.kind !== 'stove' || st.item?.kind !== 'pot') continue;
    const pot = st.item;
    if (!pot.contents.length || pot.burnt) continue;
    const cap = COOK_PER_ING * pot.contents.length;
    if (pot.cook < cap) pot.cook = Math.min(cap, pot.cook + dt);
    else if (pot.contents.length === POT_MAX) {
      pot.over += dt;
      if (pot.over >= BURN_AFTER - EPS) {
        pot.burnt = true;
        events.push({ type: 'burnt', x: st.x, y: st.y });
      }
    } else continue;
    touch(s, st);
  }
  if (!s.returns.length) return;
  let back = 0;
  s.returns = s.returns
    .map((t) => t - dt)
    .filter((t) => {
      if (t > EPS) return true;
      back++;
      return false;
    });
  const ret = back ? s.stations.find((st) => st.kind === 'return') : undefined;
  if (ret) {
    ret.count += back;
    touch(s, ret);
  }
}
```

- [ ] **Step 4: Add `step` to sim** — replace the imports at the top of `shared/src/kitchen/sim.ts` and append:

```ts
import { FIRST_ORDER, K_DT, ROUND_TIME } from './constants';
import { levelDef, parseLevel } from './levels';
import { starsFor, tickOrders } from './orders';
import { moveChef, separateChefs } from './physics';
import { interact, tickChop, tickStations } from './stations';
import { KitchenEvent, KitchenInput, KitchenState } from './types';
```

```ts
export const IDLE_INPUT: KitchenInput = { seq: 0, mx: 0, my: 0, grab: false, use: false, dash: false };

/** One fixed step. Chefs act in sorted id order so the same inputs always give the same state. */
export function step(s: KitchenState, inputs: Record<string, KitchenInput>, dt = K_DT): KitchenEvent[] {
  const events: KitchenEvent[] = [];
  if (s.over) return events;
  const def = levelDef(s.level);
  if (!def) throw new Error(`unknown level ${s.level}`);
  const ids = Object.keys(s.chefs).sort();
  for (const id of ids) {
    const c = s.chefs[id];
    const inp = inputs[id] ?? IDLE_INPUT;
    if (inp.seq > c.seq) c.seq = inp.seq;
    moveChef(c, inp, dt, s.solid, s.w, s.h);
  }
  separateChefs(ids.map((id) => s.chefs[id]), s.solid, s.w, s.h);
  for (const id of ids) {
    const c = s.chefs[id];
    const inp = inputs[id] ?? IDLE_INPUT;
    if (inp.grab) interact(s, c, events);
    tickChop(s, c, inp.use, dt, events);
  }
  tickStations(s, dt, events);
  tickOrders(s, def, dt, events);
  s.tick++;
  s.time = Math.max(0, s.roundTime - s.tick * dt);
  if (s.time <= 1e-6) {
    s.time = 0;
    s.over = true;
    events.push({ type: 'end', score: s.score, stars: starsFor(s.score, def), served: s.served, failed: s.failed });
  }
  return events;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen`
Expected: PASS (all kitchen tests).

- [ ] **Step 6: Commit**

```bash
git add shared/src/kitchen/stations.ts shared/src/kitchen/sim.ts shared/src/kitchen/stations.test.ts
git commit -m "feat(kitchen): stations, chopping, cooking, serving and the fixed step"
```

---

### Task 6: Snapshots, determinism, package export

**Files:**
- Create: `shared/src/kitchen/snapshot.ts`, `shared/src/kitchen/index.ts`
- Modify: `shared/src/index.ts` (append one line)
- Test: `shared/src/kitchen/sim.test.ts`

**Interfaces:**
- Produces: `makeSnap(s: KitchenState, sinceRev: number, full: boolean): KitchenSnap`; `kitchen` namespace export from `@dovey/shared`.

- [ ] **Step 1: Write the failing test** — `shared/src/kitchen/sim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeSnap } from './snapshot';
import { createKitchen, step } from './sim';
import { KitchenInput } from './types';
import { kitchen } from '../index';

function play(seed: number, ticks = 900) {
  const ids = ['a', 'b', 'c'];
  const s = createKitchen('diner', seed, ids);
  let r = 7;
  const rand = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const seq: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let t = 0; t < ticks; t++) {
    const inputs: Record<string, KitchenInput> = {};
    for (const id of ids) inputs[id] = { seq: ++seq[id], mx: rand() * 2 - 1, my: rand() * 2 - 1, grab: rand() < 0.1, use: rand() < 0.5, dash: rand() < 0.02 };
    step(s, inputs);
  }
  return s;
}

describe('simulation', () => {
  it('is deterministic for the same seed and inputs', () => {
    expect(JSON.stringify(play(5))).toBe(JSON.stringify(play(5)));
    expect(play(5).rng).not.toBe(play(6).rng);
  });

  it('never lets a chef stand inside a solid tile', () => {
    const s = play(11, 1500);
    for (const c of Object.values(s.chefs)) expect(s.solid[Math.floor(c.y) * s.w + Math.floor(c.x)]).toBe(false);
  });
});

describe('snapshots', () => {
  it('full snapshots carry everything; deltas carry only what changed', () => {
    const s = createKitchen('diner', 2, ['a']);
    const full = makeSnap(s, 0, true);
    expect(full.full).toBe(true);
    expect(full.stations).toHaveLength(s.stations.length);
    expect(full.orders).toEqual([]);
    expect(full.acks).toEqual({ a: 0 });

    const since = s.rev;
    step(s, { a: { seq: 4, mx: 1, my: 0, grab: false, use: false, dash: false } });
    const quiet = makeSnap(s, since, false);
    expect(quiet.stations).toBeUndefined();
    expect(quiet.orders).toBeUndefined();
    expect(quiet.acks.a).toBe(4);
    expect(quiet.chefs[0].x).toBe(Math.round(s.chefs.a.x * 100) / 100);

    s.stations[0].count = 9;
    s.stations[0].v = ++s.rev;
    expect(makeSnap(s, since, false).stations).toEqual([{ i: 0, item: s.stations[0].item, chop: 0, count: 9 }]);
  });

  it('is exported from @dovey/shared as the kitchen namespace', () => {
    expect(typeof kitchen.step).toBe('function');
    expect(kitchen.LEVELS.diner.name).toBe('Dovey Diner');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchen/sim.test.ts`
Expected: FAIL, cannot resolve `./snapshot`.

- [ ] **Step 3: Implement snapshot** — `shared/src/kitchen/snapshot.ts`:

```ts
import { ChefSnap, KitchenSnap, KitchenState, StationSnap } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the server sends each snapshot. Chefs always; stations, orders and floor only when
 * they changed after `sinceRev` (the rev at the previous snapshot) or when `full`.
 */
export function makeSnap(s: KitchenState, sinceRev: number, full: boolean): KitchenSnap {
  const acks: Record<string, number> = {};
  const chefs: ChefSnap[] = [];
  for (const id of Object.keys(s.chefs).sort()) {
    const c = s.chefs[id];
    acks[id] = c.seq;
    chefs.push({ id, x: r2(c.x), y: r2(c.y), fx: r2(c.fx), fy: r2(c.fy), held: c.held, chop: c.chopping, dash: c.dash > 0 });
  }
  const snap: KitchenSnap = { tick: s.tick, time: r2(s.time), score: s.score, streak: s.streak, over: s.over, acks, chefs };
  const stations: StationSnap[] = [];
  s.stations.forEach((st, i) => {
    if (full || st.v > sinceRev) stations.push({ i, item: st.item, chop: r2(st.chop), count: st.count });
  });
  if (stations.length) snap.stations = stations;
  if (full || s.ordersV > sinceRev) snap.orders = s.orders.map((o) => ({ ...o, left: r2(o.left) }));
  if (full || s.floorV > sinceRev) snap.floor = s.floor.map((f) => ({ ...f, x: r2(f.x), y: r2(f.y) }));
  if (full) snap.full = true;
  return snap;
}
```

- [ ] **Step 4: Barrel and package export**

`shared/src/kitchen/index.ts`:

```ts
export * from './types';
export * from './constants';
export * from './rng';
export * from './levels';
export * from './physics';
export * from './items';
export * from './orders';
export * from './stations';
export * from './sim';
export * from './snapshot';
```

Append to `shared/src/index.ts`:

```ts
export * as kitchen from './kitchen';
```

- [ ] **Step 5: Run all shared tests and typecheck**

Run: `pnpm --filter @dovey/shared test && pnpm --filter @dovey/shared typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add shared/src/kitchen/snapshot.ts shared/src/kitchen/index.ts shared/src/kitchen/sim.test.ts shared/src/index.ts
git commit -m "feat(kitchen): delta snapshots, determinism test, kitchen namespace export"
```
