# Kitchen Co-op Stage 1 Plan — Part 3 (Tasks 7-9: world + server)

Continues `2026-09-14-kitchen-coop-stage1-part2.md`. Header, Global Constraints and File Map live in `2026-09-14-kitchen-coop-stage1.md`.

Extra deviation for this part: joining a crew that is already cooking is out of Stage 1 (the kitchen room only admits the userIds it was created with). A crew code walks you onto that crew's rug; you cook in the next round.

---

### Task 7: Kitchen world system room

**Files:**
- Create: `shared/src/kitchenWorld.ts`, `shared/src/kitchenWorld.test.ts`
- Modify: `shared/src/systemRooms.ts` (import + one `SYSTEM_ROOMS` entry), `shared/src/index.ts` (one export line)

**Interfaces:**
- Produces: `KITCHEN_WORLD` (`slug: 'kitchen'`), `KITCHEN_PADS: ReadonlyArray<{x,y}>` (top-left of each 2x2 rug), `padAt(x: number, y: number): number` (-1 if none), `padTiles(pad: number): Array<[number, number]>`, `kitchenWorldLayout(): Placement[]`.

- [ ] **Step 1: Write the failing test** — `shared/src/kitchenWorld.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KITCHEN_PADS, KITCHEN_WORLD, kitchenWorldLayout, padAt, padTiles } from './kitchenWorld';
import { SYSTEM_ROOMS } from './systemRooms';
import { ROOM_SLUG } from './constants';

describe('kitchen world', () => {
  it('is a system room with a valid slug', () => {
    expect(ROOM_SLUG.test(KITCHEN_WORLD.slug)).toBe(true);
    expect(SYSTEM_ROOMS.some((r) => r.slug === KITCHEN_WORLD.slug)).toBe(true);
  });

  it('maps every rug tile to its pad and nothing else', () => {
    KITCHEN_PADS.forEach((_, pad) => {
      for (const [x, y] of padTiles(pad)) expect(padAt(x, y)).toBe(pad);
    });
    expect(padAt(0, 0)).toBe(-1);
  });

  it('puts a walkable rug on every pad', () => {
    const layout = kitchenWorldLayout();
    for (const p of KITCHEN_PADS) expect(layout.find((l) => l.x === p.x && l.y === p.y)?.def).toBe('woven_rug');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchenWorld.test.ts`
Expected: FAIL, cannot resolve `./kitchenWorld`.

- [ ] **Step 3: Implement** — `shared/src/kitchenWorld.ts`:

```ts
import { Placement, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * Kitchen: the lobby for co-op cooking. Four crew rugs; stand on one with friends
 * and press Start to cook a round together.
 */
export const KITCHEN_WORLD = {
  slug: 'kitchen',
  name: 'Kitchen',
  category: 'games',
  theme: 'indoor' as RoomTheme,
  size: 14,
  featured: true,
} as const;

const S = KITCHEN_WORLD.size;

/** top-left tile of each 2x2 crew rug */
export const KITCHEN_PADS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 2, y: 3 },
  { x: 10, y: 3 },
  { x: 2, y: 9 },
  { x: 10, y: 9 },
];

export function padAt(x: number, y: number): number {
  return KITCHEN_PADS.findIndex((p) => x >= p.x && x < p.x + 2 && y >= p.y && y < p.y + 2);
}

export function padTiles(pad: number): Array<[number, number]> {
  const p = KITCHEN_PADS[pad];
  if (!p) return [];
  return [
    [p.x, p.y],
    [p.x + 1, p.y],
    [p.x, p.y + 1],
    [p.x + 1, p.y + 1],
  ];
}

export function kitchenWorldLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p: Placement = { id: `kw${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot };
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`kitchen world layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };

  // crew rugs, each with a sign
  for (const p of KITCHEN_PADS) put('woven_rug', p.x, p.y);
  put('sign', 4, 3);
  put('sign', 12, 3);
  put('sign', 4, 9);
  put('sign', 12, 9);

  // market stalls on the back wall, crates in the corners
  put('stall', 5, 0);
  put('stall', 8, 0);
  for (const [x, y] of [
    [0, 0],
    [13, 0],
    [0, 13],
    [13, 13],
  ] as const)
    put('crate_stack', x, y);
  for (const [x, y] of [
    [3, 0],
    [11, 0],
    [3, 13],
    [11, 13],
  ] as const)
    put('plant', x, y);
  put('shelf', 5, 13);
  put('shelf', 8, 13);
  put('lamp', 0, 6);
  put('lamp', 13, 6);

  // café corner
  put('table_round', 7, 11);
  put('stool', 6, 11);
  put('stool', 8, 11);

  // stone paths: across the middle and up to the stalls
  for (let x = 1; x <= 12; x++) put('path', x, 7);
  for (let y = 2; y <= 6; y++) put('path', 7, y);

  return out;
}
```

If `systemRooms.test.ts` rejects a def (placement rules differ per kind), swap that item for `plant` at the same tile and re-run.

- [ ] **Step 4: Register the room**

In `shared/src/systemRooms.ts` add the import next to the others:

```ts
import { KITCHEN_WORLD, kitchenWorldLayout } from './kitchenWorld';
```

and append to `SYSTEM_ROOMS` after the Game Den entry:

```ts
  { ...KITCHEN_WORLD, mask: () => null, layout: kitchenWorldLayout },
```

Append to `shared/src/index.ts`:

```ts
export * from './kitchenWorld';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dovey/shared exec vitest run src/kitchenWorld.test.ts src/systemRooms.test.ts`
Expected: PASS, including `system room Kitchen` (count, overlaps, reachability).

- [ ] **Step 6: Commit**

```bash
git add shared/src/kitchenWorld.ts shared/src/kitchenWorld.test.ts shared/src/systemRooms.ts shared/src/index.ts
git commit -m "feat(kitchen): Kitchen world system room with four crew rugs"
```

---

### Task 8: Server bookkeeping — input sanitizing, rewards, crews

**Files:**
- Create: `server/src/kitchen/input.ts`, `server/src/kitchen/rewards.ts`, `server/src/kitchen/crews.ts`
- Test: `server/src/kitchen/kitchen.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeInput(m: unknown): kitchen.KitchenInput | null`
  - `class KitchenRewards { constructor(now?: () => number); grant(userId: string, stars: number): number }`
  - `type CrewPhase = 'open' | 'cooking'`
  - `interface CrewView { pad: number; code: string; members: string[]; phase: CrewPhase }`
  - `type CrewEvent = { type: 'crew'; to: string; crew: CrewView | null } | { type: 'go'; to: string; roomId: string } | { type: 'error'; to: string; code: string }`
  - `class CrewBook` with `sync(onPads: string[][]): CrewEvent[]`, `start(member): { pad: number; members: string[] } | CrewEvent[]`, `began(pad, roomId): CrewEvent[]`, `finish(pad): CrewEvent[]`, `leave(member): CrewEvent[]`, `padForCode(code: string): number`, `padForRoom(roomId: string): number`, `codeOf(pad): string`
  - `COOKING_TIMEOUT_MS`

- [ ] **Step 1: Write the failing test** — `server/src/kitchen/kitchen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { sanitizeInput } from './input';
import { KitchenRewards } from './rewards';
import { COOKING_TIMEOUT_MS, CrewBook, CrewEvent } from './crews';

describe('sanitizeInput', () => {
  it('clamps sticks, coerces flags and requires a positive integer seq', () => {
    expect(sanitizeInput({ seq: 3, mx: 5, my: -0.5, grab: true, use: 'yes', dash: 1 })).toEqual({ seq: 3, mx: 1, my: -0.5, grab: true, use: false, dash: false });
    expect(sanitizeInput({ seq: 1, mx: NaN, my: Infinity })).toMatchObject({ mx: 0, my: 0 });
    for (const bad of [null, 'x', {}, { seq: 0 }, { seq: 1.5 }, { seq: -2 }]) expect(sanitizeInput(bad)).toBeNull();
  });
});

describe('KitchenRewards', () => {
  it('pays stars x 10 and caps each user per rolling hour', () => {
    let t = 0;
    const r = new KitchenRewards(() => t);
    expect(r.grant('u', 3)).toBe(3 * kitchen.KITCHEN_COINS_PER_STAR);
    for (let i = 0; i < 10; i++) r.grant('u', 3);
    expect(r.grant('u', 3)).toBe(0);
    expect(r.grant('other', 1)).toBe(kitchen.KITCHEN_COINS_PER_STAR);
    t += 3_600_001;
    expect(r.grant('u', 2)).toBe(20);
  });
});

function book() {
  let t = 1000;
  let i = 0;
  const rand = () => ((i++ * 7919) % 97) / 97;
  return { b: new CrewBook(() => t, rand), advance: (ms: number) => (t += ms) };
}
const crewFor = (ev: CrewEvent[], to: string) => ev.filter((e) => e.type === 'crew' && e.to === to).at(-1) as Extract<CrewEvent, { type: 'crew' }> | undefined;

describe('CrewBook', () => {
  it('gives every pad a distinct 4-letter code', () => {
    const { b } = book();
    const codes = [0, 1, 2, 3].map((p) => b.codeOf(p));
    expect(new Set(codes).size).toBe(4);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{4}$/);
    expect(b.padForCode(codes[2].toLowerCase())).toBe(2);
    expect(b.padForCode('ZZZZ9')).toBe(-1);
  });

  it('forms crews from people standing on pads, capped at 4, and tells leavers', () => {
    const { b } = book();
    const ev = b.sync([['a', 'b'], [], [], []]);
    expect(crewFor(ev, 'a')?.crew).toMatchObject({ pad: 0, members: ['a', 'b'], phase: 'open' });
    expect(b.sync([['a', 'b'], [], [], []])).toEqual([]); // no change, no events
    const ev2 = b.sync([['b', 'c', 'd', 'e', 'f'], [], [], []]);
    expect(crewFor(ev2, 'a')?.crew).toBeNull();
    expect(crewFor(ev2, 'b')?.crew?.members).toEqual(['b', 'c', 'd', 'e']);
  });

  it('starts once, sends go to every member, and reopens when finished', () => {
    const { b } = book();
    b.sync([['a', 'b'], [], [], []]);
    expect(b.start('zzz')).toEqual([{ type: 'error', to: 'zzz', code: 'not_in_crew' }]);
    expect(b.start('a')).toEqual({ pad: 0, members: ['a', 'b'] });
    expect(b.start('b')).toEqual([{ type: 'error', to: 'b', code: 'already_cooking' }]);
    const go = b.began(0, 'room1');
    expect(go.filter((e) => e.type === 'go').map((e) => e.to)).toEqual(['a', 'b']);
    expect(b.padForRoom('room1')).toBe(0);
    expect(b.sync([[], [], [], []])).toEqual([]); // cooking crews keep their roster
    const done = b.finish(0);
    expect(crewFor(done, 'a')?.crew?.phase).toBe('open');
    expect(b.padForRoom('room1')).toBe(-1);
  });

  it('times out a cooking crew that never reported back', () => {
    const { b, advance } = book();
    b.sync([['a'], [], [], []]);
    b.start('a');
    b.began(0, 'r');
    advance(COOKING_TIMEOUT_MS + 1);
    const ev = b.sync([['a'], [], [], []]);
    expect(crewFor(ev, 'a')?.crew?.phase).toBe('open');
  });

  it('leave removes a member and updates the rest', () => {
    const { b } = book();
    b.sync([['a', 'b'], [], [], []]);
    expect(crewFor(b.leave('a'), 'b')?.crew?.members).toEqual(['b']);
    expect(b.leave('nobody')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/server exec vitest run src/kitchen/kitchen.test.ts`
Expected: FAIL, cannot resolve `./input`.

- [ ] **Step 3: Implement input** — `server/src/kitchen/input.ts`:

```ts
import type { kitchen } from '@dovey/shared';

const stick = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Untrusted `k_in` payload to a KitchenInput; null drops the message. */
export function sanitizeInput(m: unknown): kitchen.KitchenInput | null {
  if (!m || typeof m !== 'object') return null;
  const r = m as Record<string, unknown>;
  if (typeof r.seq !== 'number' || !Number.isInteger(r.seq) || r.seq <= 0) return null;
  return { seq: r.seq, mx: stick(r.mx), my: stick(r.my), grab: r.grab === true, use: r.use === true, dash: r.dash === true };
}
```

- [ ] **Step 4: Implement rewards** — `server/src/kitchen/rewards.ts`:

```ts
import { kitchen } from '@dovey/shared';

const HOUR_MS = 3_600_000;

/** End-of-round coins: stars × 10, at most KITCHEN_COINS_HOURLY_CAP per user per rolling hour. */
export class KitchenRewards {
  private earned = new Map<string, Array<{ at: number; coins: number }>>();

  constructor(private now: () => number = Date.now) {}

  grant(userId: string, stars: number): number {
    const since = this.now() - HOUR_MS;
    const recent = (this.earned.get(userId) ?? []).filter((e) => e.at > since);
    const got = recent.reduce((sum, e) => sum + e.coins, 0);
    const coins = Math.max(0, Math.min(stars * kitchen.KITCHEN_COINS_PER_STAR, kitchen.KITCHEN_COINS_HOURLY_CAP - got));
    if (coins) recent.push({ at: this.now(), coins });
    this.earned.set(userId, recent);
    return coins;
  }
}
```

- [ ] **Step 5: Implement crews** — `server/src/kitchen/crews.ts`:

```ts
import { KITCHEN_PADS, kitchen } from '@dovey/shared';

/**
 * Crews in the Kitchen world: whoever stands on a rug is in that rug's crew.
 * Pure bookkeeping with an injectable clock (like TableBook); KitchenLobby
 * turns the events into messages and creates the kitchen rooms.
 */

export type CrewPhase = 'open' | 'cooking';

export interface CrewView {
  pad: number;
  code: string;
  members: string[];
  phase: CrewPhase;
}

export type CrewEvent =
  | { type: 'crew'; to: string; crew: CrewView | null }
  | { type: 'go'; to: string; roomId: string }
  | { type: 'error'; to: string; code: string };

interface Crew extends CrewView {
  roomId: string | null;
  startedAt: number;
}

/** a round plus results screen; after this a crew that never reported back reopens */
export const COOKING_TIMEOUT_MS = (kitchen.ROUND_TIME + 90) * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export class CrewBook {
  private crews: Crew[];

  constructor(
    private now: () => number = Date.now,
    rand: () => number = Math.random,
    pads = KITCHEN_PADS.length,
  ) {
    const used = new Set<string>();
    this.crews = Array.from({ length: pads }, (_, pad) => {
      let code = '';
      do code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('');
      while (used.has(code));
      used.add(code);
      return { pad, code, members: [], phase: 'open', roomId: null, startedAt: 0 };
    });
  }

  codeOf(pad: number): string {
    return this.crews[pad]?.code ?? '';
  }

  padForCode(code: string): number {
    const c = code.trim().toUpperCase();
    return this.crews.findIndex((x) => x.code === c);
  }

  padForRoom(roomId: string): number {
    return this.crews.findIndex((x) => x.roomId === roomId);
  }

  /** who stands on each pad right now (session ids, per pad index) */
  sync(onPads: string[][]): CrewEvent[] {
    const out: CrewEvent[] = [];
    for (const c of this.crews) {
      if (c.phase === 'cooking') {
        if (this.now() - c.startedAt <= COOKING_TIMEOUT_MS) continue;
        out.push(...this.finish(c.pad));
      }
      const here = onPads[c.pad] ?? [];
      const next = [...c.members.filter((m) => here.includes(m)), ...here.filter((m) => !c.members.includes(m))].slice(0, kitchen.CREW_MAX);
      if (same(next, c.members)) continue;
      const gone = c.members.filter((m) => !next.includes(m));
      c.members = next;
      for (const m of gone) out.push({ type: 'crew', to: m, crew: null });
      out.push(...this.tell(c));
    }
    return out;
  }

  start(member: string): { pad: number; members: string[] } | CrewEvent[] {
    const c = this.crewOf(member);
    if (!c) return [{ type: 'error', to: member, code: 'not_in_crew' }];
    if (c.phase === 'cooking') return [{ type: 'error', to: member, code: 'already_cooking' }];
    c.phase = 'cooking';
    c.startedAt = this.now();
    c.roomId = null;
    return { pad: c.pad, members: [...c.members] };
  }

  began(pad: number, roomId: string): CrewEvent[] {
    const c = this.crews[pad];
    if (!c) return [];
    c.roomId = roomId;
    return [...c.members.map((m): CrewEvent => ({ type: 'go', to: m, roomId })), ...this.tell(c)];
  }

  finish(pad: number): CrewEvent[] {
    const c = this.crews[pad];
    if (!c) return [];
    c.phase = 'open';
    c.roomId = null;
    return this.tell(c);
  }

  leave(member: string): CrewEvent[] {
    const c = this.crewOf(member);
    if (!c) return [];
    c.members = c.members.filter((m) => m !== member);
    return this.tell(c);
  }

  private crewOf(member: string): Crew | undefined {
    return this.crews.find((c) => c.members.includes(member));
  }

  private tell(c: Crew): CrewEvent[] {
    const view: CrewView = { pad: c.pad, code: c.code, members: [...c.members], phase: c.phase };
    return c.members.map((m) => ({ type: 'crew', to: m, crew: view }));
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @dovey/server exec vitest run src/kitchen/kitchen.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/kitchen
git commit -m "feat(kitchen): server input sanitizing, capped rewards and crew book"
```

---

### Task 9: KitchenRoom, lobby glue, GameRoom and index hooks

**Files:**
- Create: `server/src/kitchen/rounds.ts`, `server/src/kitchen/lobby.ts`, `server/src/kitchen/KitchenRoom.ts`
- Test: `server/src/kitchen/lobby.test.ts`
- Modify: `server/src/index.ts`, `server/src/GameRoom.ts`

**Interfaces:**
- Consumes: Task 8, `kitchen` namespace, `KITCHEN_PADS`, `padAt`, `padTiles`, `KITCHEN_WORLD`.
- Produces:
  - `rounds: EventEmitter` emitting `'done', roomId`
  - `interface LobbyPlayer { sessionId; userId; handle; x; y; moving }`, `interface LobbyHost { players(); send(sessionId, type, data); walkTo(sessionId, x, y) }`
  - `type CreateRound = (o: { level: string; seed: number; userIds: string[]; roundTime?: number }) => Promise<string>`
  - `class KitchenLobby { readonly book; tick(); start(sessionId): Promise<void>; join(sessionId, code); leave(sessionId); dispose() }`
  - Room `kitchen`. Client → server: `k_in` KitchenInput, `k_ping {t}`. Server → client: `k_hello {you, level, names}`, `k_roster {names}`, `k_snap` KitchenSnap, `k_event` KitchenEvent, `k_away {id, away}`, `k_result {score, stars, served, failed, earned}`, `k_pong {t}`.
  - World room messages: client → `k_start`, `k_code {code}`; server → `k_crew {crew: CrewView & {names} | null}`, `k_go {roomId}`, `sys {code}` with `not_in_crew | already_cooking | bad_code | kitchen_failed`.

- [ ] **Step 1: Write the failing lobby test** — `server/src/kitchen/lobby.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { padTiles } from '@dovey/shared';
import { KitchenLobby, LobbyPlayer } from './lobby';
import { rounds } from './rounds';

function setup(create: () => Promise<string> = async () => 'room-1') {
  const sent: Array<{ to: string; type: string; data: any }> = [];
  const walks: Array<[string, number, number]> = [];
  const [x0, y0] = padTiles(0)[0];
  const players: LobbyPlayer[] = [
    { sessionId: 's1', userId: 'u1', handle: 'ann', x: x0, y: y0, moving: false },
    { sessionId: 's2', userId: 'u2', handle: 'bo', x: x0 + 1, y: y0, moving: false },
    { sessionId: 's3', userId: 'u3', handle: 'cy', x: 7, y: 7, moving: false },
  ];
  const calls: unknown[] = [];
  const lobby = new KitchenLobby(
    { players: () => players, send: (to, type, data) => sent.push({ to, type, data }), walkTo: (id, x, y) => walks.push([id, x, y]) },
    async (o) => {
      calls.push(o);
      return create();
    },
  );
  return { lobby, sent, walks, calls };
}

describe('KitchenLobby', () => {
  it('announces crews with handles and starts a round for their users', async () => {
    const { lobby, sent, calls } = setup();
    lobby.tick();
    expect(sent.find((m) => m.to === 's1' && m.type === 'k_crew')?.data.crew).toMatchObject({ pad: 0, members: ['s1', 's2'], names: ['ann', 'bo'] });
    await lobby.start('s1');
    expect(calls[0]).toMatchObject({ level: 'diner', userIds: ['u1', 'u2'] });
    expect(sent.filter((m) => m.type === 'k_go').map((m) => [m.to, m.data.roomId])).toEqual([
      ['s1', 'room-1'],
      ['s2', 'room-1'],
    ]);
    rounds.emit('done', 'room-1');
    expect(sent.at(-1)).toMatchObject({ type: 'k_crew', data: { crew: { phase: 'open' } } });
    lobby.dispose();
  });

  it('reports a failed room and reopens the crew', async () => {
    const { lobby, sent } = setup(async () => {
      throw new Error('boom');
    });
    lobby.tick();
    await lobby.start('s2');
    expect(sent.filter((m) => m.type === 'sys').map((m) => m.data.code)).toEqual(['kitchen_failed', 'kitchen_failed']);
    lobby.dispose();
  });

  it('walks a player to a free rug tile for a crew code, rejects bad codes', () => {
    const { lobby, sent, walks } = setup();
    lobby.join('s3', lobby.book.codeOf(0));
    expect(walks).toEqual([['s3', ...padTiles(0)[2]]]);
    lobby.join('s3', 'nope');
    expect(sent.at(-1)).toEqual({ to: 's3', type: 'sys', data: { code: 'bad_code' } });
    lobby.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/server exec vitest run src/kitchen/lobby.test.ts`
Expected: FAIL, cannot resolve `./lobby`.

- [ ] **Step 3: Implement rounds bus** — `server/src/kitchen/rounds.ts`:

```ts
import { EventEmitter } from 'node:events';

/** KitchenRoom emits 'done' with its roomId on dispose so the world lobby can reopen that crew. */
export const rounds = new EventEmitter();
rounds.setMaxListeners(0);
```

- [ ] **Step 4: Implement lobby** — `server/src/kitchen/lobby.ts`:

```ts
import { KITCHEN_PADS, padAt, padTiles } from '@dovey/shared';
import { CrewBook, CrewEvent } from './crews';
import { rounds } from './rounds';

export interface LobbyPlayer {
  sessionId: string;
  userId: string;
  handle: string;
  x: number;
  y: number;
  moving: boolean;
}

export interface LobbyHost {
  players(): LobbyPlayer[];
  send(sessionId: string, type: string, data: unknown): void;
  walkTo(sessionId: string, x: number, y: number): void;
}

export type CreateRound = (o: { level: string; seed: number; userIds: string[]; roundTime?: number }) => Promise<string>;

/** Test/smoke override: KITCHEN_ROUND_SECONDS=60 shortens rounds. */
function roundSeconds(): number | undefined {
  const n = Number(process.env.KITCHEN_ROUND_SECONDS);
  return Number.isFinite(n) && n >= 10 ? n : undefined;
}

/** Kitchen world glue: rugs -> crews -> kitchen rooms. GameRoom owns one when its slug is the Kitchen. */
export class KitchenLobby {
  private onDone = (roomId: string) => {
    const pad = this.book.padForRoom(roomId);
    if (pad >= 0) this.dispatch(this.book.finish(pad));
  };

  constructor(
    private host: LobbyHost,
    private createRound: CreateRound,
    readonly book = new CrewBook(),
  ) {
    rounds.on('done', this.onDone);
  }

  tick() {
    const onPads: string[][] = KITCHEN_PADS.map(() => []);
    for (const p of this.host.players()) {
      if (p.moving) continue;
      const pad = padAt(Math.round(p.x), Math.round(p.y));
      if (pad >= 0) onPads[pad].push(p.sessionId);
    }
    this.dispatch(this.book.sync(onPads));
  }

  async start(sessionId: string) {
    const r = this.book.start(sessionId);
    if (Array.isArray(r)) return this.dispatch(r);
    const byId = new Map(this.host.players().map((p) => [p.sessionId, p]));
    const userIds = [...new Set(r.members.map((m) => byId.get(m)?.userId).filter((u): u is string => !!u))];
    try {
      const roomId = await this.createRound({ level: 'diner', seed: Math.floor(Math.random() * 2 ** 31), userIds, roundTime: roundSeconds() });
      this.dispatch(this.book.began(r.pad, roomId));
    } catch (e) {
      console.error('[kitchen] could not create round', e);
      this.dispatch([...this.book.finish(r.pad), ...r.members.map((m): CrewEvent => ({ type: 'error', to: m, code: 'kitchen_failed' }))]);
    }
  }

  /** crew code: walk to a free tile on that crew's rug */
  join(sessionId: string, code: unknown) {
    const pad = this.book.padForCode(String(code ?? ''));
    if (pad < 0) return this.dispatch([{ type: 'error', to: sessionId, code: 'bad_code' }]);
    const taken = new Set(
      this.host
        .players()
        .filter((p) => p.sessionId !== sessionId)
        .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`),
    );
    const tiles = padTiles(pad);
    const [x, y] = tiles.find(([tx, ty]) => !taken.has(`${tx},${ty}`)) ?? tiles[0];
    this.host.walkTo(sessionId, x, y);
  }

  leave(sessionId: string) {
    this.dispatch(this.book.leave(sessionId));
  }

  dispose() {
    rounds.off('done', this.onDone);
  }

  private dispatch(events: CrewEvent[]) {
    if (!events.length) return;
    const names = new Map(this.host.players().map((p) => [p.sessionId, p.handle]));
    for (const e of events) {
      if (e.type === 'crew') this.host.send(e.to, 'k_crew', { crew: e.crew && { ...e.crew, names: e.crew.members.map((m) => names.get(m) ?? 'chef') } });
      else if (e.type === 'go') this.host.send(e.to, 'k_go', { roomId: e.roomId });
      else this.host.send(e.to, 'sys', { code: e.code });
    }
  }
}
```

- [ ] **Step 5: Run lobby test to verify it passes**

Run: `pnpm --filter @dovey/server exec vitest run src/kitchen/lobby.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Implement KitchenRoom** — `server/src/kitchen/KitchenRoom.ts`:

```ts
import { Client, Room, ServerError } from 'colyseus';
import { RateLimiter, kitchen } from '@dovey/shared';
import type { Repo, User } from '../repo';
import { sanitizeInput } from './input';
import { KitchenRewards } from './rewards';
import { rounds } from './rounds';

export interface KitchenCreate {
  level: string;
  seed: number;
  userIds: string[];
  roundTime?: number;
}

const INPUT_BUFFER = 4;
const RESULTS_LINGER_MS = 60_000;
const NOBODY_CAME_MS = 30_000;

/**
 * One cooking round. Server-authoritative 30Hz simulation; clients send inputs
 * and get delta snapshots 20/s (full every 2s). Only the crew's users may join.
 */
export class KitchenRoom extends Room {
  static repo: Repo;
  static rewards = new KitchenRewards();
  maxClients = kitchen.CREW_MAX;
  private sim!: kitchen.KitchenState;
  private allowed = new Set<string>();
  private handles = new Map<string, string>();
  private queues = new Map<string, kitchen.KitchenInput[]>();
  private last = new Map<string, kitchen.KitchenInput>();
  private limit = new RateLimiter(40, 1000);
  private sentRev = 0;
  private ended = false;

  async onCreate(o: KitchenCreate) {
    if (!kitchen.levelDef(String(o?.level))) throw new ServerError(400, 'bad level');
    this.allowed = new Set(Array.isArray(o.userIds) ? o.userIds.map(String) : []);
    const roundTime = typeof o.roundTime === 'number' && o.roundTime >= 10 && o.roundTime <= 600 ? o.roundTime : kitchen.ROUND_TIME;
    this.sim = kitchen.createKitchen(o.level, Number(o.seed) | 0, [], roundTime);
    await this.setPrivate(true);
    this.onMessage('k_in', (client, m: unknown) => this.onInput(client, m));
    this.onMessage('k_ping', (client, m: { t?: unknown }) => client.send('k_pong', { t: m?.t }));
    this.setSimulationInterval(() => this.tick(), 1000 / kitchen.K_TICK_HZ);
    this.clock.setInterval(() => this.sendSnap(false), 1000 / kitchen.K_SNAP_HZ);
    this.clock.setInterval(() => this.sendSnap(true), 2000);
    this.clock.setTimeout(() => {
      if (!this.clients.length) void this.disconnect();
    }, NOBODY_CAME_MS);
  }

  async onAuth(_client: Client, options: { token?: unknown }): Promise<User> {
    const user = await KitchenRoom.repo.userByToken(options?.token);
    if (!user || !this.allowed.has(user.id)) throw new ServerError(403, 'not in this crew');
    return user;
  }

  onJoin(client: Client, _options: unknown, user: User) {
    this.handles.set(user.id, user.handle);
    kitchen.addChef(this.sim, user.id);
    if (!this.queues.has(user.id)) this.queues.set(user.id, []);
    const names = Object.fromEntries(this.handles);
    client.send('k_hello', { you: user.id, level: this.sim.level, names });
    this.broadcast('k_roster', { names }, { except: client });
    client.send('k_snap', kitchen.makeSnap(this.sim, 0, true));
  }

  async onLeave(client: Client, consented: boolean) {
    const u = client.auth as User | undefined;
    this.limit.forget(client.sessionId);
    if (!u) return;
    this.last.delete(u.id); // freeze the chef instead of replaying its last stick
    this.queues.set(u.id, []);
    if (!consented && !this.ended) {
      this.broadcast('k_away', { id: u.id, away: true });
      try {
        const back = await this.allowReconnection(client, kitchen.RECONNECT_SECONDS);
        this.broadcast('k_away', { id: u.id, away: false });
        back.send('k_snap', kitchen.makeSnap(this.sim, 0, true));
        return;
      } catch {
        /* window expired */
      }
    }
    if (this.clients.some((c) => (c.auth as User | undefined)?.id === u.id)) return; // another tab still in
    kitchen.removeChef(this.sim, u.id);
    this.queues.delete(u.id);
    this.broadcast('k_away', { id: u.id, away: false });
  }

  onDispose() {
    rounds.emit('done', this.roomId);
  }

  private onInput(client: Client, m: unknown) {
    const u = client.auth as User | undefined;
    if (!u || !this.limit.allow(client.sessionId)) return;
    const inp = sanitizeInput(m);
    const q = this.queues.get(u.id);
    if (!inp || !q) return;
    q.push(inp);
    if (q.length > INPUT_BUFFER) {
      const dropped = q.shift()!;
      q[0].grab ||= dropped.grab;
      q[0].dash ||= dropped.dash;
    }
  }

  private tick() {
    if (this.ended) return;
    const inputs: Record<string, kitchen.KitchenInput> = {};
    for (const [id, q] of this.queues) {
      const next = q.shift();
      if (next) {
        inputs[id] = next;
        this.last.set(id, { ...next, grab: false, dash: false });
      } else {
        const prev = this.last.get(id);
        if (prev) inputs[id] = prev; // a late packet: keep walking, never repeat a press
      }
    }
    for (const e of kitchen.step(this.sim, inputs)) {
      if (e.type === 'end') this.finish(e);
      else this.broadcast('k_event', e);
    }
  }

  private sendSnap(full: boolean) {
    if (!this.clients.length) return;
    const snap = kitchen.makeSnap(this.sim, this.sentRev, full);
    this.sentRev = this.sim.rev;
    this.broadcast('k_snap', snap);
  }

  private finish(e: Extract<kitchen.KitchenEvent, { type: 'end' }>) {
    this.ended = true;
    this.sendSnap(true);
    for (const c of this.clients) {
      const u = c.auth as User | undefined;
      if (!u) continue;
      const earned = KitchenRoom.rewards.grant(u.id, e.stars);
      c.send('k_result', { score: e.score, stars: e.stars, served: e.served, failed: e.failed, earned });
      if (earned) void KitchenRoom.repo.creditCoins(u.id, earned);
    }
    this.clock.setTimeout(() => void this.disconnect(), RESULTS_LINGER_MS);
  }
}
```

- [ ] **Step 7: Register the room** — in `server/src/index.ts` add after `import { GameRoom } from './GameRoom';`:

```ts
import { KitchenRoom } from './kitchen/KitchenRoom';
```

after `GameRoom.repo = repo;`:

```ts
  KitchenRoom.repo = repo;
```

and after `gameServer.define('room', GameRoom).filterBy(['slug']);`:

```ts
  // one private room per cooking round, created by the Kitchen world lobby
  gameServer.define('kitchen', KitchenRoom);
```

- [ ] **Step 8: Hook GameRoom** — in `server/src/GameRoom.ts`:

Change the first import line to include `matchMaker`:

```ts
import { AuthContext, Client, Room, ServerError, matchMaker } from 'colyseus';
```

Add imports after the `LoveEvent` import:

```ts
import { KITCHEN_WORLD } from '@dovey/shared';
import { KitchenLobby } from './kitchen/lobby';
```

Add a field after `private loveRecent ...`:

```ts
  /** crew rugs in the Kitchen world; null everywhere else */
  private kitchen: KitchenLobby | null = null;
```

In `onCreate`, after `if (row.id === MAIN_LOBBY.slug) this.spawnBots();` add:

```ts
    if (row.id === KITCHEN_WORLD.slug) this.setupKitchen();
```

Add the method right before `/** Who sits in each game table's chairs ...` (`syncTables`):

```ts
  /** Kitchen world: stand on a crew rug, press start, cook in a private kitchen room. */
  private setupKitchen() {
    const limit = new RateLimiter(10, 5000);
    this.kitchen = new KitchenLobby(
      {
        players: () =>
          this.clients.flatMap((c) => {
            const p = this.state.players.get(c.sessionId);
            return p ? [{ sessionId: c.sessionId, userId: p.userId, handle: p.handle, x: p.x, y: p.y, moving: p.moving }] : [];
          }),
        send: (id, type, data) => this.clients.find((c) => c.sessionId === id)?.send(type, data),
        walkTo: (id, x, y) => {
          const p = this.state.players.get(id);
          if (p) this.sim.requestMove(id, p, { x, y });
        },
      },
      async (o) => (await matchMaker.createRoom('kitchen', o)).roomId,
    );
    this.onMessage('k_start', (client) => {
      if (limit.allow(client.sessionId)) void this.kitchen?.start(client.sessionId);
    });
    this.onMessage('k_code', (client, msg: { code?: unknown }) => {
      if (limit.allow(client.sessionId)) this.kitchen?.join(client.sessionId, msg?.code);
    });
    this.clock.setInterval(() => this.kitchen?.tick(), 250);
  }
```

In `onLeave`, as the first line: `this.kitchen?.leave(client.sessionId);`
In `onDispose`, as the first line: `this.kitchen?.dispose();`

- [ ] **Step 9: Typecheck and run server tests**

Run: `pnpm --filter @dovey/server typecheck && pnpm --filter @dovey/server test`
Expected: no type errors; all server tests PASS.

- [ ] **Step 10: Boot check**

Run the server in the background with `PORT=2599 PGLITE_DIR=<scratch dir>/pg pnpm --filter @dovey/server start`, then `curl -s localhost:2599/api/health`.
Expected: `{"ok":true}` and no errors in the log. Stop the server afterwards.

- [ ] **Step 11: Commit**

```bash
git add server/src/kitchen server/src/index.ts server/src/GameRoom.ts
git commit -m "feat(kitchen): kitchen round room, world lobby and room registration"
```
