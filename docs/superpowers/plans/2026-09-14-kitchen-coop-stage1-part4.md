# Kitchen Co-op Stage 1 Plan — Part 4 (Tasks 10-12: client + smoke)

Continues `2026-09-14-kitchen-coop-stage1-part3.md`. Header, Global Constraints and File Map live in `2026-09-14-kitchen-coop-stage1.md`. Message names are listed in Part 3, Task 9 Interfaces.

---

### Task 10: Client model — view, interpolation, prediction, controls

**Files:**
- Create: `client/src/kitchen/view.ts`, `client/src/kitchen/interp.ts`, `client/src/kitchen/predict.ts`, `client/src/kitchen/controls.ts`
- Test: `client/src/kitchen/model.test.ts`

**Interfaces:**
- Produces:
  - `interface OrderView extends kitchen.Order { at: number }`
  - `interface KitchenView { level; w; h; solid; stations; floor; orders: OrderView[]; chefs: kitchen.ChefSnap[]; acks; time; timeAt; score; streak; over; tick }`
  - `createView(levelId): KitchenView`, `applySnap(v, snap, at): boolean`, `orderLeft(o, now): number`, `timeLeft(v, now): number`
  - `interface Pose { x; y; fx; fy }`, `INTERP_DELAY_MS = 100`, `class Interp { push(at, chefs); sample(id, now): Pose | null }`
  - `SNAP_DIST = 0.3`, `class Predictor { constructor(solid, w, h); input(inp); reconcile(server: kitchen.ChefSnap, ack); frame(dtMs); pose(): Pose | null }`
  - `class Controls { attach(target?): () => void; pressGrab(); pressDash(); setUse(on); setStick(mx, my); next(): kitchen.KitchenInput }`

- [ ] **Step 1: Write the failing test** — `client/src/kitchen/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { applySnap, createView, orderLeft } from './view';
import { Interp } from './interp';
import { Predictor } from './predict';
import { Controls } from './controls';

describe('view', () => {
  it('applies full then delta snapshots and ignores stale ones', () => {
    const s = kitchen.createKitchen('diner', 1, ['a']);
    const v = createView('diner');
    expect(applySnap(v, kitchen.makeSnap(s, 0, true), 1000)).toBe(true);
    const rev = s.rev;
    s.stations[3].count = 7;
    s.stations[3].v = ++s.rev;
    s.orders.push({ id: 1, dish: 'salad', left: 30, total: 60 });
    s.ordersV = ++s.rev;
    s.tick = 5;
    applySnap(v, kitchen.makeSnap(s, rev, false), 2000);
    expect(v.stations[3].count).toBe(7);
    expect(orderLeft(v.orders[0], 12_000)).toBeCloseTo(20, 6);
    s.tick = 2;
    expect(applySnap(v, kitchen.makeSnap(s, 0, true), 3000)).toBe(false);
  });
});

describe('Interp', () => {
  const chef = (x: number) => ({ id: 'b', x, y: 1, fx: 1, fy: 0 });
  it('interpolates 100ms in the past and extrapolates at most 150ms', () => {
    const i = new Interp();
    i.push(0, [chef(0)]);
    i.push(50, [chef(1)]);
    expect(i.sample('b', 50)?.x).toBe(0); // older than the first frame
    expect(i.sample('b', 125)?.x).toBeCloseTo(0.5, 6);
    expect(i.sample('b', 175)?.x).toBeCloseTo(1.5, 6);
    expect(i.sample('b', 1000)?.x).toBeCloseTo(4, 6);
    expect(i.sample('zz', 125)).toBeNull();
  });
});

describe('Predictor', () => {
  it('stays within a hair of the server under ~170ms of latency', () => {
    const lv = kitchen.parseLevel(kitchen.LEVELS.diner);
    const server: kitchen.MovingChef = { x: 2.5, y: 2.5, fx: 0, fy: 1, dash: 0, dashCd: 0 };
    const p = new Predictor(lv.solid, lv.w, lv.h);
    p.reconcile({ id: 'a', x: 2.5, y: 2.5, fx: 0, fy: 1, held: null, chop: false, dash: false }, 0);
    const LAG = 5;
    const history: Array<{ x: number; y: number; fx: number; fy: number; seq: number }> = [];
    let worst = 0;
    for (let seq = 1; seq <= 300; seq++) {
      const inp = { seq, mx: Math.sin(seq / 20), my: Math.cos(seq / 13), grab: false, use: false, dash: seq % 90 === 0 };
      p.input(inp);
      kitchen.moveChef(server, inp, kitchen.K_DT, lv.solid, lv.w, lv.h);
      history.push({ x: server.x, y: server.y, fx: server.fx, fy: server.fy, seq });
      const seen = history[history.length - 1 - LAG];
      if (seen) {
        p.reconcile({ id: 'a', ...seen, held: null, chop: false, dash: false }, seen.seq);
        const pose = p.pose()!;
        worst = Math.max(worst, Math.hypot(pose.x - server.x, pose.y - server.y));
      }
      p.frame(33);
    }
    expect(worst).toBeLessThan(0.05);
  });
});

describe('Controls', () => {
  it('turns presses into one-shot edges and falls back to the stick', () => {
    const c = new Controls();
    c.pressGrab();
    c.setStick(0.5, -1);
    expect(c.next()).toMatchObject({ seq: 1, mx: 0.5, my: -1, grab: true, dash: false });
    expect(c.next()).toMatchObject({ seq: 2, grab: false });
    c.setUse(true);
    expect(c.next().use).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/client exec vitest run src/kitchen/model.test.ts`
Expected: FAIL, cannot resolve `./view`.

- [ ] **Step 3: Implement view** — `client/src/kitchen/view.ts`:

```ts
import { kitchen } from '@dovey/shared';

export interface OrderView extends kitchen.Order {
  /** performance.now() when this order list arrived; left counts down from there */
  at: number;
}

export interface KitchenView {
  level: string;
  w: number;
  h: number;
  solid: boolean[];
  stations: kitchen.Station[];
  floor: kitchen.FloorItem[];
  orders: OrderView[];
  chefs: kitchen.ChefSnap[];
  acks: Record<string, number>;
  time: number;
  timeAt: number;
  score: number;
  streak: number;
  over: boolean;
  tick: number;
}

export function createView(levelId: string): KitchenView {
  const def = kitchen.levelDef(levelId);
  if (!def) throw new Error(`unknown level ${levelId}`);
  const lv = kitchen.parseLevel(def);
  return { level: def.id, w: lv.w, h: lv.h, solid: lv.solid, stations: lv.stations, floor: [], orders: [], chefs: [], acks: {}, time: 0, timeAt: 0, score: 0, streak: 0, over: false, tick: -1 };
}

/** false for a snapshot older than what the view already shows */
export function applySnap(v: KitchenView, snap: kitchen.KitchenSnap, at: number): boolean {
  if (snap.tick < v.tick) return false;
  v.tick = snap.tick;
  v.time = snap.time;
  v.timeAt = at;
  v.score = snap.score;
  v.streak = snap.streak;
  v.over = snap.over;
  v.chefs = snap.chefs;
  v.acks = snap.acks;
  for (const s of snap.stations ?? []) {
    const st = v.stations[s.i];
    if (!st) continue;
    st.item = s.item;
    st.chop = s.chop;
    st.count = s.count;
  }
  if (snap.orders) v.orders = snap.orders.map((o) => ({ ...o, at }));
  if (snap.floor) v.floor = snap.floor;
  return true;
}

export const orderLeft = (o: OrderView, now: number) => Math.max(0, o.left - (now - o.at) / 1000);

export const timeLeft = (v: KitchenView, now: number) => (v.over ? v.time : Math.max(0, v.time - (now - v.timeAt) / 1000));
```

- [ ] **Step 4: Implement interpolation** — `client/src/kitchen/interp.ts`:

```ts
export interface Pose {
  x: number;
  y: number;
  fx: number;
  fy: number;
}

export const INTERP_DELAY_MS = 100;
const MAX_EXTRAP_MS = 150;
const KEEP_FRAMES = 30;

/** Other chefs are drawn INTERP_DELAY_MS in the past, blended between the two snapshots around that time. */
export class Interp {
  private frames: Array<{ at: number; chefs: Map<string, Pose> }> = [];

  push(at: number, chefs: Array<Pose & { id: string }>) {
    this.frames.push({ at, chefs: new Map(chefs.map((c) => [c.id, { x: c.x, y: c.y, fx: c.fx, fy: c.fy }])) });
    if (this.frames.length > KEEP_FRAMES) this.frames.shift();
  }

  sample(id: string, now: number): Pose | null {
    const f = this.frames;
    if (!f.length) return null;
    const t = now - INTERP_DELAY_MS;
    let i = f.length - 1;
    while (i > 0 && f[i].at > t) i--;
    const a = f[i].chefs.get(id);
    if (!a) return f[f.length - 1].chefs.get(id) ?? null;
    if (f[i].at > t) return a;
    const next = f[i + 1];
    if (next) {
      const b = next.chefs.get(id);
      if (!b) return a;
      const k = (t - f[i].at) / (next.at - f[i].at);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, fx: b.fx, fy: b.fy };
    }
    const prevF = f[i - 1];
    const p = prevF?.chefs.get(id);
    if (!p || prevF.at === f[i].at) return a;
    const k = Math.min(t - f[i].at, MAX_EXTRAP_MS) / (f[i].at - prevF.at);
    return { x: a.x + (a.x - p.x) * k, y: a.y + (a.y - p.y) * k, fx: a.fx, fy: a.fy };
  }
}
```

- [ ] **Step 5: Implement prediction** — `client/src/kitchen/predict.ts`:

```ts
import { kitchen } from '@dovey/shared';
import type { Pose } from './interp';

export const SNAP_DIST = 0.3;
const SMOOTH_MS = 100;
const MAX_PENDING = 120;

interface Pending {
  inp: kitchen.KitchenInput;
  /** dash timers right before this input ran, so a replay dashes exactly like the first time */
  dash: number;
  dashCd: number;
}

/**
 * Local chef movement prediction: move at once on input, then on each snapshot restart
 * from the server position and replay the inputs it hasn't applied yet. Small corrections
 * are hidden in a decaying render offset; big ones snap.
 */
export class Predictor {
  private pending: Pending[] = [];
  private me: kitchen.MovingChef | null = null;
  private ox = 0;
  private oy = 0;

  constructor(
    private solid: boolean[],
    private w: number,
    private h: number,
  ) {}

  input(inp: kitchen.KitchenInput) {
    if (!this.me) return;
    this.pending.push({ inp, dash: this.me.dash, dashCd: this.me.dashCd });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    kitchen.moveChef(this.me, inp, kitchen.K_DT, this.solid, this.w, this.h);
  }

  reconcile(server: kitchen.ChefSnap, ack: number) {
    this.pending = this.pending.filter((p) => p.inp.seq > ack);
    const first = this.pending[0];
    const next: kitchen.MovingChef = {
      x: server.x,
      y: server.y,
      fx: server.fx,
      fy: server.fy,
      dash: first ? first.dash : (this.me?.dash ?? 0),
      dashCd: first ? first.dashCd : (this.me?.dashCd ?? 0),
    };
    for (const p of this.pending) {
      p.dash = next.dash;
      p.dashCd = next.dashCd;
      kitchen.moveChef(next, p.inp, kitchen.K_DT, this.solid, this.w, this.h);
    }
    if (this.me) {
      const ex = this.me.x + this.ox - next.x;
      const ey = this.me.y + this.oy - next.y;
      if (Math.hypot(ex, ey) < SNAP_DIST) {
        this.ox = ex;
        this.oy = ey;
      } else {
        this.ox = 0;
        this.oy = 0;
      }
    }
    this.me = next;
  }

  frame(dtMs: number) {
    const k = Math.exp(-dtMs / SMOOTH_MS);
    this.ox *= k;
    this.oy *= k;
  }

  pose(): Pose | null {
    return this.me && { x: this.me.x + this.ox, y: this.me.y + this.oy, fx: this.me.fx, fy: this.me.fy };
  }
}
```

- [ ] **Step 6: Implement controls** — `client/src/kitchen/controls.ts`:

```ts
import type { kitchen } from '@dovey/shared';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight']);

/** Keyboard (WASD/arrows, Space grab, E chop, Shift dash) and touch input, sampled at the sim rate. */
export class Controls {
  private keys = new Set<string>();
  private grabQ = false;
  private dashQ = false;
  private useKey = false;
  private useTouch = false;
  private stick = { mx: 0, my: 0 };
  private seq = 0;

  attach(target: Window = window): () => void {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.grabQ = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQ = true;
      if (e.code === 'KeyE') this.useKey = true;
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.useKey = false;
    };
    const blur = () => {
      this.keys.clear();
      this.useKey = false;
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  pressGrab() {
    this.grabQ = true;
  }

  pressDash() {
    this.dashQ = true;
  }

  setUse(on: boolean) {
    this.useTouch = on;
  }

  setStick(mx: number, my: number) {
    this.stick = { mx, my };
  }

  next(): kitchen.KitchenInput {
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    let mx = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
    let my = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
    if (!mx && !my) {
      mx = this.stick.mx;
      my = this.stick.my;
    }
    const inp = { seq: ++this.seq, mx, my, grab: this.grabQ, use: this.useKey || this.useTouch, dash: this.dashQ };
    this.grabQ = false;
    this.dashQ = false;
    return inp;
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @dovey/client exec vitest run src/kitchen/model.test.ts`
Expected: PASS (4 tests). If the Predictor test's `worst` is above 0.05, print it and check that `input()` records dash timers *before* `moveChef`.

- [ ] **Step 8: Commit**

```bash
git add client/src/kitchen
git commit -m "feat(kitchen): client view, interpolation, prediction and controls"
```

---

### Task 11: Client round connection, renderer, UI and hooks

**Files:**
- Create: `client/src/kitchen/store.ts`, `client/src/kitchen/net.ts`, `client/src/kitchen/draw.ts`, `client/src/ui/KitchenRound.tsx`, `client/src/ui/KitchenLobby.tsx`
- Modify: `client/src/net.ts`, `client/src/game/Game.ts`, `client/src/game/instance.ts`, `client/src/App.tsx`, `client/src/styles.css`

**Interfaces:**
- Produces: `useKitchen` store and `dishName`; `KitchenRound` class; `drawKitchen(ctx, view, chefs, cssW, cssH, topPad, now)`, `CHEF_COLORS`; `KitchenLobby` and `KitchenRoundUI` components; `sendToWorld(type, data?)` and exported `endpoint()` from `client/src/net.ts`; `setGamePaused(paused)` from `client/src/game/instance.ts`.

- [ ] **Step 1: Store** — `client/src/kitchen/store.ts`:

```ts
import { create } from 'zustand';
import type { kitchen } from '@dovey/shared';
import type { KitchenView, OrderView } from './view';

export interface CrewInfo {
  pad: number;
  code: string;
  members: string[];
  names: string[];
  phase: 'open' | 'cooking';
}

export interface RoundResult {
  score: number;
  stars: number;
  served: number;
  failed: number;
  earned: number;
}

export type KitchenPhase = 'off' | 'joining' | 'playing' | 'results';

const DISH_NAMES: Record<kitchen.Dish, string> = {
  soup_tomato: 'tomato soup',
  soup_onion: 'onion soup',
  soup_mushroom: 'mushroom soup',
  salad: 'salad',
  salad_tomato: 'tomato salad',
};
export const dishName = (d: kitchen.Dish) => DISH_NAMES[d];

interface KitchenStore {
  crew: CrewInfo | null;
  phase: KitchenPhase;
  roomId: string | null;
  score: number;
  streak: number;
  time: number;
  timeAt: number;
  over: boolean;
  orders: OrderView[];
  lag: boolean;
  reconnecting: boolean;
  result: RoundResult | null;
  note: string | null;
  setCrew: (c: CrewInfo | null) => void;
  go: (roomId: string) => void;
  setPhase: (p: KitchenPhase) => void;
  setHud: (v: KitchenView) => void;
  setLag: (lag: boolean) => void;
  setReconnecting: (on: boolean) => void;
  setResult: (r: RoundResult) => void;
  onEvent: (e: kitchen.KitchenEvent, me: string) => void;
  lost: () => void;
  exit: () => void;
}

export const useKitchen = create<KitchenStore>((set, get) => ({
  crew: null,
  phase: 'off',
  roomId: null,
  score: 0,
  streak: 0,
  time: 0,
  timeAt: 0,
  over: false,
  orders: [],
  lag: false,
  reconnecting: false,
  result: null,
  note: null,
  setCrew: (crew) => set({ crew }),
  go: (roomId) => set({ roomId, phase: 'joining', result: null, note: null, score: 0, streak: 0, orders: [] }),
  setPhase: (phase) => set({ phase }),
  setHud: (v) => {
    const s = get();
    if (s.score === v.score && s.streak === v.streak && s.orders === v.orders && s.over === v.over && s.timeAt !== 0 && Math.abs(s.time - v.time) < 0.5) return;
    set({ score: v.score, streak: v.streak, orders: v.orders, over: v.over, time: v.time, timeAt: v.timeAt });
  },
  setLag: (lag) => {
    if (get().lag !== lag) set({ lag });
  },
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setResult: (result) => set({ result, phase: 'results' }),
  onEvent: (e, me) => {
    if (e.type === 'served') set({ note: `+${e.points} ${dishName(e.dish)}${e.streak > 1 ? ` · combo x${e.streak}` : ''}` });
    else if (e.type === 'expired') set({ note: `missed ${dishName(e.dish)}` });
    else if (e.type === 'burnt') set({ note: 'soup burnt! bin it' });
    else if (e.type === 'rejected' && e.chef === me) set({ note: 'nobody ordered that' });
  },
  lost: () => set({ phase: 'off', roomId: null, reconnecting: false, note: 'lost the kitchen' }),
  exit: () => set({ phase: 'off', roomId: null, result: null, reconnecting: false }),
}));
```

- [ ] **Step 2: World net hooks** — in `client/src/net.ts`:

1. Change `function endpoint(): string {` to `export function endpoint(): string {`.
2. Add after the `onTableEnd` import: `import { CrewInfo, useKitchen } from './kitchen/store';`
3. Add above `export class Net {`:

```ts
/** the joined world connection, for UI outside the game (kitchen lobby) */
let active: Net | null = null;

export function sendToWorld(type: string, data?: unknown) {
  active?.send(type, data);
}
```

4. Add a method to `Net` right before `leave() {`:

```ts
  send(type: string, data?: unknown) {
    this.room?.send(type, data);
  }
```

5. In `join()`, right after `this.room = room;` add `active = this;`. In `leave()`, as its first line add `if (active === this) active = null;`.
6. After `room.onMessage('tg_end', onTableEnd);` add:

```ts
    room.onMessage('k_crew', (m: { crew: CrewInfo | null }) => useKitchen.getState().setCrew(m.crew));
    room.onMessage('k_go', (m: { roomId: string }) => useKitchen.getState().go(m.roomId));
```

7. In the `sys` handler's `msgs` object, after `no_duel: 'no duel going on',` add:

```ts
        not_in_crew: 'stand on a crew rug first',
        already_cooking: 'your crew is already cooking',
        bad_code: 'no crew with that code',
        kitchen_failed: 'the kitchen could not open, try again',
```

- [ ] **Step 3: Pause the world while cooking**

In `client/src/game/Game.ts` add a method right before `destroy() {`:

```ts
  /** stop rendering the world while a full-screen minigame covers it */
  setPaused(paused: boolean) {
    if (paused) this.app.ticker?.stop();
    else this.app.ticker?.start();
  }
```

In `client/src/game/instance.ts` add after `detachGame`:

```ts
export function setGamePaused(paused: boolean) {
  game?.setPaused(paused);
}
```

- [ ] **Step 4: Round connection** — `client/src/kitchen/net.ts`:

```ts
import { Client, Room } from 'colyseus.js';
import { kitchen } from '@dovey/shared';
import { endpoint } from '../net';
import { deviceToken } from '../identity';
import { Controls } from './controls';
import { Interp } from './interp';
import { Predictor } from './predict';
import { KitchenView, applySnap, createView } from './view';
import { useKitchen } from './store';

const CONSENTED = 4000;
const LAG_MS = 250;

/** One cooking round: joins the kitchen room, sends inputs at 30Hz, folds snapshots into a view. */
export class KitchenRound {
  view: KitchenView | null = null;
  me = '';
  names: Record<string, string> = {};
  readonly away = new Set<string>();
  readonly controls = new Controls();
  readonly interp = new Interp();
  predictor: Predictor | null = null;
  private client = new Client(endpoint());
  private room: Room | null = null;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private closed = false;

  async join(roomId: string) {
    const room = await this.client.joinById(roomId, { token: deviceToken() });
    if (this.closed) return void room.leave();
    this.bind(room);
  }

  leave() {
    this.closed = true;
    this.stop();
    this.room?.leave();
    this.room = null;
  }

  private bind(room: Room) {
    this.room = room;
    room.onMessage('k_hello', (m: { you: string; level: string; names: Record<string, string> }) => {
      this.me = m.you;
      this.names = m.names;
      if (!this.view || this.view.level !== m.level) {
        this.view = createView(m.level);
        this.predictor = new Predictor(this.view.solid, this.view.w, this.view.h);
      }
      useKitchen.getState().setPhase('playing');
    });
    room.onMessage('k_roster', (m: { names: Record<string, string> }) => (this.names = m.names));
    room.onMessage('k_snap', (snap: kitchen.KitchenSnap) => this.onSnap(snap));
    room.onMessage('k_event', (e: kitchen.KitchenEvent) => useKitchen.getState().onEvent(e, this.me));
    room.onMessage('k_result', (r: { score: number; stars: number; served: number; failed: number; earned: number }) => useKitchen.getState().setResult(r));
    room.onMessage('k_away', (m: { id: string; away: boolean }) => (m.away ? this.away.add(m.id) : this.away.delete(m.id)));
    room.onMessage('k_pong', (m: { t: number }) => useKitchen.getState().setLag(performance.now() - m.t > LAG_MS));
    room.onLeave((code) => {
      if (this.room !== room) return;
      this.stop();
      this.room = null;
      if (this.closed || code === CONSENTED || useKitchen.getState().phase === 'results') return;
      void this.reconnect(room.reconnectionToken);
    });
    this.stop();
    this.timers.push(setInterval(() => this.sendInput(), 1000 / kitchen.K_TICK_HZ));
    this.timers.push(setInterval(() => this.room?.send('k_ping', { t: performance.now() }), 2000));
  }

  private async reconnect(token: string) {
    useKitchen.getState().setReconnecting(true);
    const until = Date.now() + kitchen.RECONNECT_SECONDS * 1000;
    while (!this.closed && Date.now() < until) {
      try {
        const room = await this.client.reconnect(token);
        if (this.closed) return void room.leave();
        useKitchen.getState().setReconnecting(false);
        this.bind(room);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!this.closed) useKitchen.getState().lost();
  }

  private sendInput() {
    if (!this.room || !this.view || this.view.over) return;
    const inp = this.controls.next();
    this.room.send('k_in', inp);
    this.predictor?.input(inp);
  }

  private onSnap(snap: kitchen.KitchenSnap) {
    const view = this.view;
    if (!view) return;
    const at = performance.now();
    if (!applySnap(view, snap, at)) return;
    this.interp.push(at, snap.chefs);
    const mine = snap.chefs.find((c) => c.id === this.me);
    if (mine) this.predictor?.reconcile(mine, snap.acks[this.me] ?? 0);
    useKitchen.getState().setHud(view);
  }

  private stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
```

- [ ] **Step 5: Renderer** — `client/src/kitchen/draw.ts`:

```ts
import { kitchen } from '@dovey/shared';
import type { KitchenView } from './view';

export interface ChefDraw {
  id: string;
  x: number;
  y: number;
  fx: number;
  fy: number;
  held: kitchen.Item | null;
  chop: boolean;
  name: string;
  color: string;
  away: boolean;
  me: boolean;
}

export const CHEF_COLORS = ['#ff8a5b', '#5b9dff', '#58c98b', '#f5c542'];
const ING: Record<kitchen.Ingredient, string> = { tomato: '#e5483b', lettuce: '#6cc04a', onion: '#c9a0dc', mushroom: '#a0785a' };

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, color: string) {
  const h = Math.max(4, w * 0.12);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, k)), h - 2);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = '#ffffff') {
  ctx.font = `bold ${Math.round(px)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawItem(ctx: CanvasRenderingContext2D, item: kitchen.Item, cx: number, cy: number, s: number, now: number) {
  if (item.kind === 'ing') {
    if (!item.chopped) return circle(ctx, cx, cy, s * 0.2, ING[item.ing], '#00000040');
    for (const [dx, dy] of [
      [-0.12, 0.05],
      [0.1, -0.06],
      [0.03, 0.12],
    ])
      circle(ctx, cx + dx * s, cy + dy * s, s * 0.09, ING[item.ing], '#00000040');
    return;
  }
  if (item.kind === 'plate') {
    circle(ctx, cx, cy, s * 0.3, '#ffffff', '#cfcfcf');
    if (item.soup) circle(ctx, cx, cy, s * 0.2, ING[item.soup]);
    item.parts.forEach((p, i) => circle(ctx, cx + (i ? 0.09 : -0.09) * s, cy, s * 0.1, ING[p]));
    return;
  }
  circle(ctx, cx, cy, s * 0.32, item.burnt ? '#1b1b1b' : '#4a4a55', '#2a2a30');
  if (!item.contents.length || item.burnt) return;
  circle(ctx, cx, cy, s * (0.1 + 0.04 * item.contents.length), ING[item.contents[0]]);
  if (kitchen.potDone(item)) {
    const danger = item.over / kitchen.BURN_AFTER;
    if (danger > 0.4 && Math.floor(now / (danger > 0.75 ? 120 : 250)) % 2) {
      ctx.lineWidth = s * 0.06;
      ctx.strokeStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    label(ctx, '✓', cx, cy, s * 0.3);
  } else {
    bar(ctx, cx, cy + s * 0.34, s * 0.7, item.cook / (kitchen.COOK_PER_ING * kitchen.POT_MAX), '#58c98b');
  }
}

function drawStation(ctx: CanvasRenderingContext2D, st: kitchen.Station, px: number, py: number, s: number, now: number) {
  ctx.fillStyle = '#b97a4c';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#d99a68';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 6);
  const cx = px + s / 2;
  const cy = py + s / 2;
  switch (st.kind) {
    case 'crate':
      ctx.fillStyle = '#7a4d2e';
      ctx.fillRect(px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.65);
      if (st.ing) circle(ctx, cx, cy, s * 0.2, ING[st.ing], '#00000055');
      return;
    case 'board':
      ctx.fillStyle = '#f1d7a8';
      ctx.fillRect(px + s * 0.15, py + s * 0.2, s * 0.7, s * 0.55);
      break;
    case 'stove':
      ctx.fillStyle = '#3d3d46';
      ctx.fillRect(px + 3, py + 3, s - 6, s - 8);
      circle(ctx, cx, cy, s * 0.36, st.item?.kind === 'pot' && st.item.contents.length && !st.item.burnt ? '#e0663d' : '#55555f');
      break;
    case 'plates':
    case 'return':
      if (st.kind === 'return') {
        ctx.fillStyle = '#9cc7e8';
        ctx.fillRect(px + 4, py + 4, s - 8, s - 10);
      }
      for (let i = 0; i < Math.min(st.count, 4); i++) circle(ctx, cx, cy - i * s * 0.06, s * 0.28, '#ffffff', '#cfcfcf');
      return;
    case 'window':
      ctx.fillStyle = '#ffd35c';
      ctx.fillRect(px + 2, py + 2, s - 4, s - 6);
      label(ctx, 'SERVE', cx, cy, s * 0.2, '#3b2a2a');
      return;
    case 'bin':
      circle(ctx, cx, cy, s * 0.32, '#7d8591', '#4d535c');
      return;
  }
  if (st.item) drawItem(ctx, st.item, cx, cy, s, now);
  if (st.kind === 'board' && st.chop > 0) bar(ctx, cx, py + s * 0.8, s * 0.7, st.chop / kitchen.CHOP_TIME, '#f5c542');
}

export function drawKitchen(ctx: CanvasRenderingContext2D, view: KitchenView, chefs: ChefDraw[], cssW: number, cssH: number, topPad: number, now: number) {
  const { w, h } = view;
  const s = Math.max(8, Math.floor(Math.min(cssW / (w + 0.4), (cssH - topPad) / (h + 0.4))));
  const ox = Math.round((cssW - s * w) / 2);
  const oy = Math.round(topPad + (cssH - topPad - s * h) / 2);
  ctx.fillStyle = '#2b2233';
  ctx.fillRect(0, 0, cssW, cssH);
  const stationAt = new Map(view.stations.map((st) => [st.y * w + st.x, st]));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = ox + x * s;
      const py = oy + y * s;
      const st = stationAt.get(y * w + x);
      if (st) drawStation(ctx, st, px, py, s, now);
      else {
        ctx.fillStyle = view.solid[y * w + x] ? '#5b4636' : (x + y) % 2 ? '#f3e2c0' : '#ead4ab';
        ctx.fillRect(px, py, s, s);
      }
    }
  for (const f of view.floor) drawItem(ctx, f.item, ox + f.x * s, oy + f.y * s, s * 0.9, now);
  for (const c of [...chefs].sort((a, b) => a.y - b.y)) {
    const cx = ox + c.x * s;
    const cy = oy + c.y * s;
    ctx.globalAlpha = c.away ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.3, s * 0.32, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, cx, cy, s * 0.34, c.color, c.me ? '#ffffff' : '#3b2a2a');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - s * 0.18, cy - s * 0.52, s * 0.36, s * 0.2); // chef hat
    circle(ctx, cx + c.fx * s * 0.12 - c.fy * s * 0.1, cy + c.fy * s * 0.12 + c.fx * s * 0.1, s * 0.05, '#3b2a2a');
    circle(ctx, cx + c.fx * s * 0.12 + c.fy * s * 0.1, cy + c.fy * s * 0.12 - c.fx * s * 0.1, s * 0.05, '#3b2a2a');
    if (c.held) drawItem(ctx, c.held, cx + c.fx * s * 0.42, cy + c.fy * s * 0.42, s * 0.8, now);
    if (c.chop) {
      const a = Math.sin(now / 60) * 0.8;
      ctx.strokeStyle = '#dfe6ee';
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx + c.fx * s * 0.3, cy + c.fy * s * 0.3);
      ctx.lineTo(cx + c.fx * s * 0.3 + Math.cos(a) * s * 0.25, cy + c.fy * s * 0.3 - Math.abs(Math.sin(a)) * s * 0.25);
      ctx.stroke();
    }
    ctx.font = `bold ${Math.max(10, Math.round(s * 0.24))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3b2a2a';
    ctx.strokeText(c.name, cx, cy - s * 0.55);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(c.name, cx, cy - s * 0.55);
    ctx.globalAlpha = 1;
  }
}
```

- [ ] **Step 6: Round UI** — `client/src/ui/KitchenRound.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { kitchen } from '@dovey/shared';
import { KitchenRound } from '../kitchen/net';
import { CHEF_COLORS, drawKitchen } from '../kitchen/draw';
import { dishName, useKitchen } from '../kitchen/store';
import { orderLeft } from '../kitchen/view';
import { setGamePaused } from '../game/instance';

const TOP_PAD = 86;

export function KitchenRoundUI() {
  const phase = useKitchen((s) => s.phase);
  const roomId = useKitchen((s) => s.roomId);
  if (phase === 'off' || !roomId) return null;
  return <RoundScreen roomId={roomId} />;
}

function RoundScreen({ roomId }: { roomId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [round, setRound] = useState<KitchenRound | null>(null);

  useEffect(() => {
    const r = new KitchenRound();
    setRound(r);
    setGamePaused(true);
    const detach = r.controls.attach(window);
    r.join(roomId).catch(() => useKitchen.getState().lost());
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const view = r.view;
      if (!canvas || !view) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      r.predictor?.frame(now - last);
      last = now;
      const chefs = view.chefs.map((c, i) => {
        const pose = (c.id === r.me ? r.predictor?.pose() : r.interp.sample(c.id, now)) ?? c;
        return { ...c, x: pose.x, y: pose.y, fx: pose.fx, fy: pose.fy, name: r.names[c.id] ?? 'chef', color: CHEF_COLORS[i % CHEF_COLORS.length], away: r.away.has(c.id), me: c.id === r.me };
      });
      drawKitchen(ctx, view, chefs, cssW, cssH, TOP_PAD, now);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      detach();
      r.leave();
      setGamePaused(false);
    };
  }, [roomId]);

  return (
    <div className="kr" role="application" aria-label="kitchen round">
      <canvas ref={canvasRef} className="kr__canvas" />
      <Hud />
      {round && <TouchPad round={round} />}
      <Results />
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Hud() {
  const phase = useKitchen((s) => s.phase);
  const orders = useKitchen((s) => s.orders);
  const score = useKitchen((s) => s.score);
  const streak = useKitchen((s) => s.streak);
  const time = useKitchen((s) => s.time);
  const timeAt = useKitchen((s) => s.timeAt);
  const over = useKitchen((s) => s.over);
  const lag = useKitchen((s) => s.lag);
  const reconnecting = useKitchen((s) => s.reconnecting);
  const note = useKitchen((s) => s.note);
  const now = useNow(250);
  const [shownNote, setShownNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    setShownNote(note);
    const t = setTimeout(() => setShownNote(null), 1800);
    return () => clearTimeout(t);
  }, [note]);

  const left = over ? time : Math.max(0, time - (now - timeAt) / 1000);
  const clock = `${Math.floor(left / 60)}:${Math.floor(left % 60)
    .toString()
    .padStart(2, '0')}`;

  return (
    <>
      <div className="kr-hud">
        <div className="kr-orders">
          {orders.map((o) => {
            const l = orderLeft(o, now);
            return (
              <div key={o.id} className={`kr-order ${l < kitchen.ORDER_WARN ? 'kr-order--late' : ''}`}>
                <span>{dishName(o.dish)}</span>
                <i style={{ width: `${(l / o.total) * 100}%` }} />
              </div>
            );
          })}
        </div>
        <div className="kr-stats">
          <b className="kr-time">{clock}</b>
          <b>{score}</b>
          {streak > 1 && <em>x{streak}</em>}
          {lag && <span title="slow connection">📶</span>}
          <button className="kr-leave" onClick={() => useKitchen.getState().exit()} aria-label="leave kitchen">
            ✕
          </button>
        </div>
      </div>
      {phase === 'joining' && <div className="kr-note">opening the kitchen…</div>}
      {reconnecting && <div className="kr-note">reconnecting…</div>}
      {shownNote && <div className="kr-note kr-note--pop">{shownNote}</div>}
    </>
  );
}

function TouchPad({ round }: { round: KitchenRound }) {
  const [coarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const stickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  if (!coarse) return null;

  const move = (e: React.PointerEvent) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (e.clientX - (r.left + rad)) / rad;
    let dy = (e.clientY - (r.top + rad)) / rad;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setKnob({ x: dx, y: dy });
    round.controls.setStick(dx, dy);
  };
  const release = () => {
    setKnob({ x: 0, y: 0 });
    round.controls.setStick(0, 0);
  };

  return (
    <div className="kr-touch">
      <div
        ref={stickRef}
        className="kr-stick"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <i style={{ transform: `translate(${knob.x * 32}px, ${knob.y * 32}px)` }} />
      </div>
      <div className="kr-btns">
        <button className="kr-btn" onPointerDown={() => round.controls.pressDash()}>
          dash
        </button>
        <button className="kr-btn" onPointerDown={() => round.controls.setUse(true)} onPointerUp={() => round.controls.setUse(false)} onPointerCancel={() => round.controls.setUse(false)}>
          chop
        </button>
        <button className="kr-btn kr-btn--big" onPointerDown={() => round.controls.pressGrab()}>
          grab
        </button>
      </div>
    </div>
  );
}

function Results() {
  const result = useKitchen((s) => s.result);
  if (!result) return null;
  return (
    <div className="kr-result" role="dialog" aria-label="round results">
      <div className="kr-result__card">
        <h2>time's up!</h2>
        <p className="kr-stars">{[0, 1, 2].map((i) => (i < result.stars ? '★' : '☆')).join(' ')}</p>
        <p>
          score <b>{result.score}</b> · served {result.served} · missed {result.failed}
        </p>
        {result.earned > 0 && <p>+{result.earned} coins</p>}
        <button className="btn" onClick={() => useKitchen.getState().exit()}>
          back to the kitchen
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Lobby UI** — `client/src/ui/KitchenLobby.tsx`:

```tsx
import { useState } from 'react';
import { KITCHEN_WORLD } from '@dovey/shared';
import { useAppStore } from '../store';
import { useKitchen } from '../kitchen/store';
import { sendToWorld } from '../net';

/** Kitchen world card: your crew, its code, Start; or join a friend's crew by code. */
export function KitchenLobby() {
  const slug = useAppStore((s) => s.room?.slug);
  const crew = useKitchen((s) => s.crew);
  const phase = useKitchen((s) => s.phase);
  const [code, setCode] = useState('');
  if (slug !== KITCHEN_WORLD.slug || phase !== 'off') return null;

  if (!crew)
    return (
      <div className="kl">
        <b>🍳 co-op kitchen</b>
        <span>stand on a rug with up to 3 friends to form a crew</span>
        <form
          className="kl__join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) sendToWorld('k_code', { code: code.trim() });
          }}
        >
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="CODE" aria-label="crew code" />
          <button className="btn" type="submit">
            join
          </button>
        </form>
      </div>
    );

  return (
    <div className="kl">
      <b>
        crew <span className="kl__code">{crew.code}</span>
      </b>
      <span>
        {crew.names.join(', ')} · {crew.members.length}/4
      </span>
      {crew.phase === 'cooking' ? (
        <span>cooking…</span>
      ) : (
        <button className="btn kl__start" onClick={() => sendToWorld('k_start')}>
          start cooking
        </button>
      )}
      <small>WASD move · Space grab · E chop · Shift dash</small>
    </div>
  );
}
```

- [ ] **Step 8: Mount in App** — in `client/src/App.tsx` add imports after `TableGameUI`:

```tsx
import { KitchenLobby } from './ui/KitchenLobby';
import { KitchenRoundUI } from './ui/KitchenRound';
```

and after `<TableGameUI />`:

```tsx
      <KitchenLobby />
      <KitchenRoundUI />
```

- [ ] **Step 9: Styles** — append to `client/src/styles.css`:

```css
/* ---- co-op kitchen: world lobby card */
.kl { position: absolute; top: 72px; left: 50%; transform: translateX(-50%); z-index: 30; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 16px; background: #fff8ec; border: 3px solid var(--ink); border-radius: 16px; box-shadow: 0 3px 0 var(--ink); font-weight: 700; font-size: 13px; max-width: calc(100vw - 32px); text-align: center; }
.kl small { opacity: 0.6; font-size: 11px; }
.kl__code { font-family: ui-monospace, monospace; letter-spacing: 2px; background: var(--accent); color: #fff; padding: 1px 6px; border-radius: 6px; }
.kl__join { display: flex; gap: 6px; }
.kl__join input { width: 72px; font: inherit; font-family: ui-monospace, monospace; letter-spacing: 2px; text-align: center; border: 2px solid var(--ink); border-radius: 8px; padding: 4px; }

/* ---- co-op kitchen: round */
.kr { position: fixed; inset: 0; z-index: 200; background: #2b2233; touch-action: none; user-select: none; -webkit-user-select: none; }
.kr__canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.kr-hud { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 10px 16px; pointer-events: none; }
.kr-orders { display: flex; gap: 6px; flex-wrap: wrap; }
.kr-order { position: relative; min-width: 92px; padding: 6px 8px 10px; background: #fff; border: 3px solid var(--ink); border-radius: 10px; font-weight: 800; font-size: 12px; overflow: hidden; }
.kr-order i { position: absolute; left: 0; bottom: 0; height: 5px; background: #58c98b; transition: width 0.25s linear; }
.kr-order--late i { background: #ff3b30; }
.kr-order--late { animation: kr-shake 0.5s infinite; }
@keyframes kr-shake { 50% { transform: translateX(2px); } }
.kr-stats { display: flex; align-items: center; gap: 10px; color: #fff; font-weight: 900; font-size: 20px; pointer-events: auto; }
.kr-stats em { font-style: normal; color: #f5c542; }
.kr-leave { background: #fff; border: 2px solid var(--ink); border-radius: 8px; font-weight: 900; cursor: pointer; }
.kr-note { position: absolute; top: 96px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 6px 14px; border-radius: 999px; font-weight: 800; pointer-events: none; }
.kr-note--pop { animation: kr-pop 0.25s ease-out; }
@keyframes kr-pop { from { transform: translate(-50%, 8px) scale(0.9); opacity: 0; } }
.kr-touch { position: absolute; left: 16px; right: 16px; bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; pointer-events: none; }
.kr-stick { width: 120px; height: 120px; border-radius: 50%; background: rgba(255, 255, 255, 0.18); border: 3px solid rgba(255, 255, 255, 0.5); display: grid; place-items: center; pointer-events: auto; touch-action: none; }
.kr-stick i { width: 52px; height: 52px; border-radius: 50%; background: #fff; }
.kr-btns { display: flex; gap: 10px; align-items: flex-end; pointer-events: auto; }
.kr-btn { width: 64px; height: 64px; border-radius: 50%; border: 3px solid var(--ink); background: #fff; font-weight: 900; touch-action: none; }
.kr-btn--big { width: 84px; height: 84px; background: var(--accent); color: #fff; }
.kr-result { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.45); padding: 0 16px; }
.kr-result__card { background: #fff8ec; border: 3px solid var(--ink); border-radius: 18px; padding: 18px 22px; text-align: center; font-weight: 700; max-width: 100%; }
.kr-stars { font-size: 40px; color: #f5c542; margin: 4px 0; }
```

- [ ] **Step 10: Typecheck, tests, build**

Run: `pnpm -r run typecheck && pnpm test && pnpm build`
Expected: no type errors, all tests PASS, client build succeeds.

- [ ] **Step 11: Commit**

```bash
git add client/src/kitchen client/src/ui/KitchenRound.tsx client/src/ui/KitchenLobby.tsx client/src/net.ts client/src/game/Game.ts client/src/game/instance.ts client/src/App.tsx client/src/styles.css
git commit -m "feat(kitchen): round screen, renderer, touch controls and world lobby card"
```

---

### Task 12: Network smoke test and manual verification

**Files:**
- Create: `client/scripts/smoke-kitchen.mjs`

- [ ] **Step 1: Write the smoke script** — `client/scripts/smoke-kitchen.mjs`:

```js
/**
 * End-to-end check of the co-op kitchen against a running server:
 * four players stand on a crew rug, start a round, join the kitchen room,
 * snapshots flow at ~20/s, one bot cooks and serves the oldest order, the round ends.
 *
 *   KITCHEN_ROUND_SECONDS=60 PORT=2567 pnpm start      (another shell)
 *   node client/scripts/smoke-kitchen.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2567';
const WS = API.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (label, ok) => {
  checks.push(!!ok);
  console.log(ok ? '  ok  ' : '  FAIL', label);
};
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(50);
  }
  return false;
}
async function me(token) {
  const r = await fetch(`${API}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  return r.json();
}

// Diner layout (shared/src/kitchen/levels.ts) to find station indices by tile
const ROWS = ['#TLOMCCWWCPRX#', 'B............S', 'C.1........2.C', 'C...CCCCCC...C', 'B............S', 'C...CCCCCC...C', 'C.3........4.C', 'C............C', '##CCCCCCCCCC##'];
const stationIndex = new Map();
ROWS.forEach((row, y) => [...row].forEach((ch, x) => /[CTLOMBSPWXR]/.test(ch) && stationIndex.set(`${x},${y}`, stationIndex.size)));
const CRATE_X = { tomato: 1, lettuce: 2, onion: 3, mushroom: 4 };

const client = new Client(WS);
const tokens = [0, 1, 2, 3].map((i) => `kitchenSmoke${i}`.padEnd(32, String(i)));
for (const t of tokens) await me(t);
const worlds = await Promise.all(tokens.map((token) => client.joinOrCreate('room', { slug: 'kitchen', token })));
const crew = [null, null, null, null];
let roomId = null;
worlds.forEach((w, i) => {
  w.onMessage('k_crew', (m) => (crew[i] = m.crew));
  w.onMessage('k_go', (m) => (roomId = m.roomId));
  for (const t of ['chat', 'emote', 'coins', 'sys', 'love', 'tg_state', 'tg_status', 'tg_end', 'call_state', 'duel_over', 'maze_win']) w.onMessage(t, () => {});
});
await wait(600);
const PAD = [
  [2, 3],
  [3, 3],
  [2, 4],
  [3, 4],
];
worlds.forEach((w, i) => w.send('move', { x: PAD[i][0], y: PAD[i][1] }));
check('four players form one crew on the first rug', await until(() => crew.every((c) => c?.members.length === 4), 15000));

worlds[0].send('k_start');
check('start sends everyone to the same kitchen room', await until(() => !!roomId));

const kitchens = await Promise.all(tokens.map((token) => client.joinById(roomId, { token })));
const st = kitchens.map(() => ({ you: null, snaps: 0, chefs: [], stations: [], orders: [], score: 0, events: [], result: null }));
kitchens.forEach((k, i) => {
  k.onMessage('k_hello', (m) => (st[i].you = m.you));
  k.onMessage('k_snap', (s) => {
    const v = st[i];
    v.snaps++;
    v.chefs = s.chefs;
    v.score = s.score;
    for (const x of s.stations ?? []) v.stations[x.i] = x;
    if (s.orders) v.orders = s.orders;
  });
  k.onMessage('k_event', (e) => st[i].events.push(e));
  k.onMessage('k_result', (r) => (st[i].result = r));
  for (const t of ['k_roster', 'k_away', 'k_pong']) k.onMessage(t, () => {});
});
check('every player gets a hello', await until(() => st.every((s) => s.you)));
const before = st[0].snaps;
await wait(2000);
const rate = (st[0].snaps - before) / 2;
check(`snapshots flow at ~20/s (got ${rate})`, rate >= 14 && rate <= 26);

// ---- bot A cooks
const A = kitchens[0];
const a = st[0];
let seq = 0;
const mine = () => a.chefs.find((c) => c.id === a.you);
const send = (inp) => A.send('k_in', { seq: ++seq, mx: 0, my: 0, grab: false, use: false, dash: false, ...inp });
async function goTo(x, y) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    const c = mine();
    if (c) {
      const dx = x - c.x;
      const dy = y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.12) break;
      const k = Math.min(1, d * 3) / d;
      send({ mx: dx * k, my: dy * k });
    }
    await wait(33);
  }
  send({});
  await wait(120);
}
async function face(mx, my) {
  for (let i = 0; i < 4; i++) {
    send({ mx, my });
    await wait(33);
  }
  send({});
  await wait(150);
}
async function grab() {
  send({ grab: true });
  await wait(250);
}
async function chop() {
  const end = Date.now() + 2400;
  while (Date.now() < end) {
    send({ use: true });
    await wait(33);
  }
  send({});
  await wait(150);
}
/** crate -> board -> chopped in hand */
async function prep(ing) {
  await goTo(CRATE_X[ing] + 0.5, 1.5);
  await face(0, -1);
  await grab();
  await goTo(1.5, 1.5);
  await face(-1, 0);
  await grab();
  await chop();
  await grab();
}
async function cook(dish) {
  if (dish.startsWith('soup_')) {
    const ing = dish.slice(5);
    for (let i = 0; i < 3; i++) {
      await prep(ing);
      await goTo(12.5, 1.5);
      await face(1, 0);
      await grab();
    }
    const stove = stationIndex.get('13,1');
    await until(() => {
      const p = a.stations[stove]?.item;
      return p && p.contents.length === 3 && p.cook >= 9;
    }, 15000);
    await goTo(10.5, 1.5);
    await face(0, -1);
    await grab(); // plate
    await goTo(12.5, 1.5);
    await face(1, 0);
    await grab(); // pour
  } else {
    await prep('lettuce');
    await goTo(9.5, 1.5);
    await face(0, -1);
    await grab(); // lettuce on counter (9,0)
    if (dish === 'salad_tomato') {
      await prep('tomato');
      await goTo(6.5, 1.5);
      await face(0, -1);
      await grab(); // tomato on counter (6,0)
    }
    await goTo(10.5, 1.5);
    await face(0, -1);
    await grab(); // plate
    await goTo(9.5, 1.5);
    await face(0, -1);
    await grab(); // scoop lettuce
    if (dish === 'salad_tomato') {
      await goTo(6.5, 1.5);
      await face(0, -1);
      await grab();
    }
  }
  await goTo(7.5, 1.5);
  await face(0, -1);
  await grab(); // serve
}

check('an order arrives', await until(() => a.orders.length > 0, 10000));
const dish = a.orders[0]?.dish;
console.log('  cooking', dish);
await cook(dish);
check('serving scores points', await until(() => a.score > 0, 4000));
check('everyone saw the served event', st.every((s) => s.events.some((e) => e.type === 'served')));

check('the round ends with a result for everyone', await until(() => st.every((s) => s.result), 90000));
console.log('  result', st[0].result);

for (const k of kitchens) await k.leave();
for (const w of worlds) await w.leave();
const pass = checks.every(Boolean);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
```

- [ ] **Step 2: Run it against a local server**

Run the server in the background with `KITCHEN_ROUND_SECONDS=60 PORT=2567 PGLITE_DIR=<scratch dir>/pg pnpm start` (after `pnpm build`), then `node client/scripts/smoke-kitchen.mjs`.

Expected: every line `ok`, final `PASS`, exit code 0. If the bot misses a station, print `mine()` before each `grab()` and adjust the stand position by ±0.1.

- [ ] **Step 3: Manual verification**

With the server running on port 2600 (`pnpm build`, then `PORT=2600 pnpm start` from the repo root):

1. Open `http://localhost:2600/r/kitchen` in 3 desktop tabs and 1 tab in device mode (phone size, touch).
2. Walk all 4 onto the same rug; each tab shows the crew card with the same code and 4 names.
3. Press **start cooking** in one tab; all 4 switch to the kitchen screen within ~1s.
4. Desktop: WASD moves smoothly with no visible jitter; Space picks up and puts down; E chops (bar fills); Shift dashes.
5. Phone tab: joystick moves, grab/chop/dash buttons work.
6. Cook and serve one soup and one salad; score and combo show; a pot left on the stove flashes red, then burns.
7. Close one desktop tab mid-round and reopen within 20s: that chef fades, then comes back.
8. Chrome Performance panel on one tab: steady ~60fps while four chefs move.
9. After the round: results with stars on every tab; **back to the kitchen** returns to the world and the crew can start again.

- [ ] **Step 4: Commit**

```bash
git add client/scripts/smoke-kitchen.mjs
git commit -m "test(kitchen): network smoke test for a full co-op round"
```

---

## Self-review notes

- Spec coverage: architecture (Tasks 1-9), gameplay rules (Tasks 1-5), networking and smoothness (Tasks 6, 9, 10, 11), Kitchen world and joining (Tasks 7, 9, 11), rewards (Tasks 8-9), error handling (sys codes in Tasks 9 and 11; reconnect in 9 and 11), testing (unit tests in Tasks 1-10, smoke and manual in Task 12). Deviations are listed in Global Constraints and at the top of Part 3.
- Cross-task names: `kitchen.createKitchen`, `kitchen.step`, `kitchen.makeSnap`, `kitchen.moveChef`, `kitchen.parseLevel`, `kitchen.levelDef`, `kitchen.potDone`, `KitchenLobby`, `CrewBook`, `KitchenRound`, `useKitchen`, `dishName`, `sendToWorld`, `setGamePaused`, `drawKitchen`, `CHEF_COLORS` — each defined once and used with the same signature.
