# Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/leaderboards` page (Leypark pasar-malam night style) ranking the top 50 players by coins ("Paling Kaya"), asset value ("Harta") and online time ("Kaki Lepak", this week / all time), with the viewer's own rank, an opt-out toggle, a landing "Ranking" link and an in-game trophy button.

**Architecture:** Four new `users` columns (`play_minutes`, `play_week`, `play_week_start`, `hide_rank`) via the `COLUMNS` migration array. Pure helpers in `server/src/leaderboards.ts` (KL Monday, price table, play-minute gate, 60 s cache). `Repo` computes boards and personal ranks with one scores CTE. The existing 60 s coin trickle in `GameRoom` also records play minutes. `api.ts` serves `GET /api/leaderboards` (cached) and `POST /api/leaderboards/me`, and `PATCH /api/me` accepts `hideRank`. Client: new route variant, a lazily loaded `Leaderboards` page with its own CSS, links from the landing nav and `RoomBar`.

**Tech Stack:** Node ≥ 22, pnpm 11, Express 5, Colyseus 0.16, PGlite (plain Postgres SQL), Vitest 2, React 18, Vite 5.

**Spec:** `docs/superpowers/specs/2026-09-14-leaderboards-design.md` (related: `docs/superpowers/specs/2026-09-14-friend-calls-design.md`, `docs/superpowers/specs/2026-09-14-friends-design.md`)

## Global Constraints

- Run every command from the worktree root `/Users/along/Documents/GitHub/jomville/.claude/worktrees/social` (branch `feat/social`). Stage explicit paths only (never `git add -A` / `git add .`); never bare `git stash`; never push.
- Base: execute on top of `feat/leypark` once that branch is merged into `main` (the landing nav link and the visual style assume the Leypark rebrand). Task 1 checks this. Task 7's landing edit tolerates either `Landing.tsx` version (dovey or Leypark) by targeting the `<nav>` elements, not surrounding copy.
- Node ≥ 22 (`node -v` → `v22.x`), pnpm 11 (`pnpm -v` → `11.x`).
- Ports: tests and dev servers use **2597** (dev server) and **2596** (API test) only. Never 5173 or 2567.
- The worktree path contains `/.claude/`; `express.static` refuses dot-directories, so when the server serves the built client, `CLIENT_DIST` must point to a symlink outside it: `ln -sfn "$PWD/client/dist" /tmp/leypark-social-dist` and `CLIENT_DIST=/tmp/leypark-social-dist`.
- Exact values: `BOARD_SIZE = 50`, `LEADERBOARD_TTL_MS = 60_000`, `LTD_ASSET_MULTIPLIER = 3`, `PLAY_MINUTE_GAP_MS = 50_000`, KL offset UTC+8 (no DST), week starts Monday. Time format `"12j 30m"`, coins `"12,345"`. HTTP `cache-control: public, max-age=30` on `GET /api/leaderboards`.
- `play_minutes` DDL must be exactly `alter table users add column play_minutes int not null default 0` (identical to the trading stage 2 design on `feat/trade-duel`) and appear **once** in `COLUMNS`. If trading already added it, do not add it again; if trading already increments `play_minutes` in the coin trickle, replace that increment with this plan's `addPlayMinutes` call (never both).
- Do **not** edit another session's areas: `client/src/ui/ChatBar.tsx`, `client/src/ui/ChatFeed.tsx`, `client/src/ui/Customizer.tsx`, `client/src/ui/VendingSheet.tsx`, `client/src/wear.ts`, `server/src/bots.ts`, and jomville-d7's friends code: `server/src/social.ts`, the friends routes in `server/src/api.ts` (the `// ---- friends` block after `PATCH /api/me`), the `GameRoom` friends block (`friend_invite`) and its `presence.*` lines in `onJoin`/`onLeave`, `client/src/friends.ts`, `client/src/ui/FriendsSheet.tsx`, `client/src/ui/FriendInvitePopup.tsx`, `client/src/ui/friends.css`.
- d7's claimed UI spots — avoid them:
  - App.tsx `.tray`: the friends HUD button goes directly after the shop (`<Icon name="bag" />`) button and before the owner-only build (`hammer`) button. The leaderboards trophy button goes in `client/src/ui/RoomBar.tsx` instead (this plan does not modify `App.tsx`). If it ever must live in App.tsx, it goes **after** the build/hammer button, never between shop and build.
  - `<FriendInvitePopup />` goes directly after `<VendingSheet />`; `friendsOpen ? <FriendsSheet />` goes right after `profile ? <ProfileSheet />` in the sheet chain. Nothing from this plan is mounted in those spots.
  - The `friends` icon goes in `client/src/ui/Icon.tsx` `PATHS` next to `home`. The `trophy` icon goes after `pencil` (end of `PATHS`), not next to `home`.
  - `friends.css` defines `.hud__btn { position: relative }` and `.hud__badge`; reuse, do not redefine.
- New CSS goes in `client/src/ui/leaderboards.css`, never `client/src/ui/../styles.css`.
- Commands: `pnpm --filter @dovey/server test`, `pnpm --filter @dovey/server typecheck`, `pnpm --filter @dovey/client test`, `pnpm --filter @dovey/client typecheck`, `pnpm --filter @dovey/client build`.
- Commit messages use exactly this form:

```
git commit -F - <<'MSG'
<type>(<scope>): <summary>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

## File Map

| File | Change | Responsibility |
| --- | --- | --- |
| `server/src/db.ts` | modify `COLUMNS` | 4 new `users` columns |
| `server/src/leaderboards.ts` | create | types, `klMonday`, `priceTable`, `PlayMinuteGate` + `playMinutes` singleton, `LeaderboardCache` |
| `server/src/leaderboards.test.ts` | create | pure helper + migration tests |
| `server/src/repo.ts` | modify (new `// ---- leaderboards` section after `pruneRolls`) | `addPlayMinutes`, `setHideRank`, `leaderboards`, `leaderboardRanks` |
| `server/src/leaderboards.repo.test.ts` | create | SQL tests on `openTestDb` |
| `server/src/GameRoom.ts` | modify coin trickle interval only | record play minutes |
| `server/src/api.ts` | modify (cache after `express.json`, `PATCH /api/me` body, routes after `/api/daily`) | leaderboard routes, `hideRank` |
| `server/src/leaderboards.api.test.ts` | create | HTTP test on port 2596 |
| `client/src/router.ts`, `client/src/router.test.ts` | modify | `{ kind: 'leaderboards' }`, `LEADERBOARDS_URL` |
| `client/src/identity.ts` | modify (append) | `storedToken()` |
| `client/src/leaderboards.ts`, `client/src/leaderboards.test.ts` | create | client types, fetchers, formatters |
| `client/src/ui/Leaderboards.tsx` | create | the page |
| `client/src/ui/leaderboards.css` | create | page styles |
| `client/src/Root.tsx` | modify | lazy route |
| `client/src/ui/Icon.tsx` | modify (after `pencil`) | `trophy` icon |
| `client/src/ui/RoomBar.tsx` | modify (after share button) | in-game trophy button |
| `client/src/ui/Landing.tsx` | modify (header + footer `<nav>`) | "Ranking" link |

---

### Task 1: Schema columns and pure server helpers

**Files:**
- Modify: `server/src/db.ts` — `COLUMNS` array, directly after the `{ table: 'users', column: 'coins', ... }` entry
- Create: `server/src/leaderboards.ts`
- Test: `server/src/leaderboards.test.ts`

**Interfaces:**
- Consumes: `FURNITURE: FurnitureDef[]` (`@dovey/shared`), `openTestDb(): Promise<Db>` (`server/src/db.ts`)
- Produces:
  - `type BoardKey = 'coins' | 'assets' | 'timeWeek' | 'timeAll'`
  - `interface BoardRow { rank: number; handle: string; avatar: string; value: number }`
  - `type BoardSet = Record<BoardKey, BoardRow[]>`
  - `interface Boards extends BoardSet { generatedAt: string }`
  - `interface MyRank { rank: number | null; value: number }`
  - `type MyRanks = { hidden: true } | ({ hidden: false } & Record<BoardKey, MyRank>)`
  - `const BOARD_KEYS: BoardKey[]`, `BOARD_SIZE = 50`, `LTD_ASSET_MULTIPLIER = 3`, `LEADERBOARD_TTL_MS = 60_000`, `PLAY_MINUTE_GAP_MS = 50_000`
  - `function klMonday(now: Date): string` (`'YYYY-MM-DD'`)
  - `function priceTable(defs?: ReadonlyArray<{ id: string; price: number }>): string` (JSON `{ id: price }` for `price > 0`)
  - `class PlayMinuteGate { constructor(gapMs?: number); take(userIds: Iterable<string>, now: number): string[] }`, `const playMinutes: PlayMinuteGate`

- [ ] **Step 1: Check the base branch**

Run: `git log --oneline -1 main && git merge-base --is-ancestor feat/leypark HEAD && echo leypark-in || echo leypark-missing`
Expected: `leypark-in`. If `leypark-missing`, stop and ask the controller whether to rebase `feat/social` onto a `main` that contains `feat/leypark` (the plan still works on the dovey landing; Task 7 handles both).

- [ ] **Step 2: Write the failing tests**

Create `server/src/leaderboards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openTestDb } from './db';
import { PlayMinuteGate, klMonday, priceTable } from './leaderboards';

describe('klMonday', () => {
  it('uses Monday 00:00 Asia/Kuala_Lumpur as the week start', () => {
    // KL Sunday 23:59:59 -> previous Monday
    expect(klMonday(new Date('2026-09-13T15:59:59.000Z'))).toBe('2026-09-07');
    // KL Monday 00:00:00 -> that Monday
    expect(klMonday(new Date('2026-09-13T16:00:00.000Z'))).toBe('2026-09-14');
    expect(klMonday(new Date('2026-09-20T15:59:59.000Z'))).toBe('2026-09-14');
    // crosses a year boundary (KL Thursday 08:00)
    expect(klMonday(new Date('2026-01-01T00:00:00.000Z'))).toBe('2025-12-29');
  });
});

describe('priceTable', () => {
  it('keeps priced defs only', () => {
    const t = JSON.parse(priceTable([
      { id: 'a', price: 10 },
      { id: 'free', price: 0 },
      { id: 'b', price: 25000 },
    ]));
    expect(t).toEqual({ a: 10, b: 25000 });
  });
  it('defaults to the catalog', () => {
    const t = JSON.parse(priceTable()) as Record<string, number>;
    expect(Object.keys(t).length).toBeGreaterThan(0);
    expect(Object.values(t).every((p) => p > 0)).toBe(true);
  });
});

describe('PlayMinuteGate', () => {
  it('counts a user at most once per gap across rooms and sessions', () => {
    const g = new PlayMinuteGate(50_000);
    expect(g.take(['u1', 'u2', 'u1'], 0)).toEqual(['u1', 'u2']);
    // another room ticking 10 s later
    expect(g.take(['u1', 'u3'], 10_000)).toEqual(['u3']);
    expect(g.take(['u1', 'u2'], 49_999)).toEqual([]);
    expect(g.take(['u1', 'u2'], 60_000)).toEqual(['u1', 'u2']);
  });
});

describe('leaderboard columns', () => {
  it('migrates play time and hide_rank columns on users', async () => {
    const db = await openTestDb();
    const rows = await db.query<{ column_name: string; data_type: string; column_default: string | null }>(
      `select column_name, data_type, column_default from information_schema.columns
       where table_name = 'users' and column_name in ('play_minutes', 'play_week', 'play_week_start', 'hide_rank')
       order by column_name`,
    );
    expect(rows.map((r) => [r.column_name, r.data_type])).toEqual([
      ['hide_rank', 'boolean'],
      ['play_minutes', 'integer'],
      ['play_week', 'integer'],
      ['play_week_start', 'date'],
    ]);
    await db.close();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @dovey/server test -- leaderboards.test`
Expected: FAIL — `Failed to resolve import "./leaderboards"`.

- [ ] **Step 4: Add the columns**

In `server/src/db.ts`, in `COLUMNS`, directly after the line
`{ table: 'users', column: 'coins', ddl: 'alter table users add column coins int not null default 1500' },`
insert (skip the `play_minutes` line if `grep -n "play_minutes" server/src/db.ts` already finds it):

```ts
  { table: 'users', column: 'play_minutes', ddl: 'alter table users add column play_minutes int not null default 0' },
  { table: 'users', column: 'play_week', ddl: 'alter table users add column play_week int not null default 0' },
  { table: 'users', column: 'play_week_start', ddl: 'alter table users add column play_week_start date' },
  { table: 'users', column: 'hide_rank', ddl: 'alter table users add column hide_rank boolean not null default false' },
```

- [ ] **Step 5: Create the helpers**

Create `server/src/leaderboards.ts`:

```ts
import { FURNITURE } from '@dovey/shared';

/**
 * Leaderboards: who is richest in coins, in furniture, and who hangs out the
 * most. Pure helpers here; SQL lives in Repo, routes in api.ts.
 */
export type BoardKey = 'coins' | 'assets' | 'timeWeek' | 'timeAll';
export const BOARD_KEYS: BoardKey[] = ['coins', 'assets', 'timeWeek', 'timeAll'];

export interface BoardRow {
  rank: number;
  handle: string;
  /** serialized avatar (serializeAvatar) */
  avatar: string;
  value: number;
}
export type BoardSet = Record<BoardKey, BoardRow[]>;
export interface Boards extends BoardSet {
  generatedAt: string;
}
export interface MyRank {
  /** null when the value is 0 (not on the board) */
  rank: number | null;
  value: number;
}
export type MyRanks = { hidden: true } | ({ hidden: false } & Record<BoardKey, MyRank>);

export const BOARD_SIZE = 50;
/** limited-edition instances are worth this many times their shop price */
export const LTD_ASSET_MULTIPLIER = 3;
export const LEADERBOARD_TTL_MS = 60_000;
/** a user earns at most one online minute per this gap, however many rooms/tabs they have open */
export const PLAY_MINUTE_GAP_MS = 50_000;

/** Malaysia is UTC+8 all year (no DST). */
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Monday (Asia/Kuala_Lumpur) starting the week that contains `now`, as YYYY-MM-DD. */
export function klMonday(now: Date): string {
  const kl = new Date(now.getTime() + KL_OFFSET_MS);
  const sinceMonday = (kl.getUTCDay() + 6) % 7;
  kl.setUTCDate(kl.getUTCDate() - sinceMonday);
  return kl.toISOString().slice(0, 10);
}

/** Catalog prices as JSON for SQL (jsonb_each_text); unpriced defs are left out so they count 0. */
export function priceTable(defs: ReadonlyArray<{ id: string; price: number }> = FURNITURE): string {
  const out: Record<string, number> = {};
  for (const d of defs) if (d.price > 0) out[d.id] = d.price;
  return JSON.stringify(out);
}

/** Every room ticks its own minute; this keeps one minute per user per tick across all of them. */
export class PlayMinuteGate {
  private last = new Map<string, number>();

  constructor(private gapMs = PLAY_MINUTE_GAP_MS) {}

  take(userIds: Iterable<string>, now: number): string[] {
    const out: string[] = [];
    for (const id of userIds) {
      const prev = this.last.get(id);
      if (prev !== undefined && now - prev < this.gapMs) continue;
      this.last.set(id, now);
      out.push(id);
    }
    return out;
  }
}

export const playMinutes = new PlayMinuteGate();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @dovey/server test -- leaderboards.test`
Expected: PASS — `Test Files  1 passed (1)`, `Tests  5 passed (5)`.

- [ ] **Step 7: Commit**

```bash
git add server/src/db.ts server/src/leaderboards.ts server/src/leaderboards.test.ts
git commit -F - <<'MSG'
feat(server): leaderboard columns and pure helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 2: Repo — play minutes, hide flag, boards, personal ranks

**Files:**
- Modify: `server/src/repo.ts` — imports at top; new section inserted directly after the `pruneRolls` method (before `async room(slug: string)`)
- Test: `server/src/leaderboards.repo.test.ts`

**Interfaces:**
- Consumes: `Db`, `SYSTEM_HANDLE`, `normalizeAvatar`, `serializeAvatar` (already imported in repo.ts), `BoardKey`, `BoardRow`, `BoardSet`, `MyRank`, `MyRanks`, `BOARD_KEYS`, `BOARD_SIZE`, `LTD_ASSET_MULTIPLIER`, `priceTable` (Task 1)
- Produces (on `Repo`):
  - `addPlayMinutes(userIds: string[], monday: string): Promise<void>`
  - `setHideRank(userId: string, hide: boolean): Promise<void>`
  - `leaderboards(monday: string, limit?: number): Promise<BoardSet>`
  - `leaderboardRanks(userId: string, monday: string): Promise<MyRanks | null>` (null = unknown user)

- [ ] **Step 1: Write the failing tests**

Create `server/src/leaderboards.repo.test.ts`:

```ts
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, FURNITURE, SYSTEM_HANDLE, isInstanceDef } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';

const PLAIN = FURNITURE.find((d) => d.price > 0 && !isInstanceDef(d))!;
const LTD = FURNITURE.find((d) => !!d.ltd && d.price > 0)!;
const FREE = FURNITURE.find((d) => d.price === 0);

let db: Db;
let repo: Repo;

async function user(handle: string, coins = 1500): Promise<string> {
  const u = await repo.createUser(handle.padEnd(32, 'x'), DEFAULT_AVATAR);
  await db.query('update users set handle = $2, coins = $3 where id = $1', [u.id, handle, coins]);
  return u.id;
}

async function instance(owner: string, def: string, serial: number | null, placed: string | null = null) {
  await db.query('insert into items (id, def, owner_id, serial, placed_room) values ($1, $2, $3, $4, $5)', [
    `${owner.slice(0, 6)}-${def}-${serial ?? 'n'}-${Math.random().toString(36).slice(2, 8)}`,
    def,
    owner,
    serial,
    placed,
  ]);
}

beforeEach(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.ensureSystemRooms();
});
afterEach(() => db.close());

describe('leaderboards repo', () => {
  it('ranks coins with ties, excluding hidden and system users', async () => {
    await user('lb_a', 5000);
    await user('lb_b', 3000);
    await user('lb_c', 3000);
    const h = await user('lb_h', 9000);
    await repo.setHideRank(h, true);
    const boards = await repo.leaderboards('2026-09-14');
    expect(boards.coins.map((r) => [r.rank, r.handle, r.value])).toEqual([
      [1, 'lb_a', 5000],
      [2, 'lb_b', 3000],
      [2, 'lb_c', 3000],
    ]);
    expect(boards.coins.some((r) => r.handle === SYSTEM_HANDLE)).toBe(false);
    expect(typeof boards.coins[0].avatar).toBe('string');
    expect(JSON.parse(boards.coins[0].avatar)).toBeTypeOf('object');
  });

  it('values assets: inventory, placed and unplaced instances, LTD at 3x, price-0 and unknown defs at 0', async () => {
    expect(PLAIN).toBeDefined();
    expect(LTD).toBeDefined();
    const a = await user('lb_a', 1);
    const b = await user('lb_b', 1);
    await user('lb_c', 1); // owns nothing: not on the board
    const h = await user('lb_h', 1);
    await repo.addItem(a, PLAIN.id, 2);
    await instance(a, LTD.id, 1);
    await instance(a, PLAIN.id, null, 'someroom');
    if (FREE) await repo.addItem(a, FREE.id, 5);
    await repo.addItem(a, 'no_such_def', 10);
    await repo.addItem(b, PLAIN.id, 1);
    await instance(h, LTD.id, 2);
    await repo.setHideRank(h, true);
    const boards = await repo.leaderboards('2026-09-14');
    expect(boards.assets.map((r) => [r.rank, r.handle, r.value])).toEqual([
      [1, 'lb_a', 3 * PLAIN.price + 3 * LTD.price],
      [2, 'lb_b', PLAIN.price],
    ]);
  });

  it('counts play minutes with a lazy weekly reset at the KL Monday boundary', async () => {
    const a = await user('lb_a');
    const b = await user('lb_b');
    await repo.addPlayMinutes([a, b], '2026-09-07');
    await repo.addPlayMinutes([a, b], '2026-09-07');
    await repo.addPlayMinutes([a], '2026-09-14');
    const raw = await db.query<{ handle: string; play_minutes: number; play_week: number; s: string }>(
      "select handle, play_minutes, play_week, play_week_start::text as s from users where handle like 'lb_%' order by handle",
    );
    expect(raw).toEqual([
      { handle: 'lb_a', play_minutes: 3, play_week: 1, s: '2026-09-14' },
      { handle: 'lb_b', play_minutes: 2, play_week: 2, s: '2026-09-07' },
    ]);
    const boards = await repo.leaderboards('2026-09-14');
    // b's week is stale: 0 this week, so not listed
    expect(boards.timeWeek.map((r) => [r.handle, r.value])).toEqual([['lb_a', 1]]);
    expect(boards.timeAll.map((r) => [r.rank, r.handle, r.value])).toEqual([
      [1, 'lb_a', 3],
      [2, 'lb_b', 2],
    ]);
    await repo.addPlayMinutes([b], '2026-09-14');
    const [rb] = await db.query<{ play_week: number; s: string }>("select play_week, play_week_start::text as s from users where handle = 'lb_b'");
    expect(rb).toEqual({ play_week: 1, s: '2026-09-14' });
    await repo.addPlayMinutes([], '2026-09-14'); // no-op
  });

  it('limits each board', async () => {
    for (let i = 0; i < 4; i++) await user(`lb_${i}`, 2000 + i);
    const boards = await repo.leaderboards('2026-09-14', 2);
    expect(boards.coins.map((r) => r.handle)).toEqual(['lb_3', 'lb_2']);
  });

  it('gives personal ranks outside the top list, null for zero, hidden flag for hidden users', async () => {
    await user('lb_a', 5000);
    const b = await user('lb_b', 3000);
    const c = await user('lb_c', 3000);
    const h = await user('lb_h', 9000);
    await repo.setHideRank(h, true);
    await repo.addPlayMinutes([b], '2026-09-14');
    const rc = await repo.leaderboardRanks(c, '2026-09-14');
    expect(rc).toEqual({
      hidden: false,
      coins: { rank: 2, value: 3000 },
      assets: { rank: null, value: 0 },
      timeWeek: { rank: null, value: 0 },
      timeAll: { rank: null, value: 0 },
    });
    const rb = await repo.leaderboardRanks(b, '2026-09-14');
    expect(rb && !rb.hidden && rb.timeWeek).toEqual({ rank: 1, value: 1 });
    expect(await repo.leaderboardRanks(h, '2026-09-14')).toEqual({ hidden: true });
    expect(await repo.leaderboardRanks('nobody', '2026-09-14')).toBeNull();
    await repo.setHideRank(h, false);
    const rh = await repo.leaderboardRanks(h, '2026-09-14');
    expect(rh && !rh.hidden && rh.coins).toEqual({ rank: 1, value: 9000 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dovey/server test -- leaderboards.repo`
Expected: FAIL — `repo.setHideRank is not a function` / `repo.leaderboards is not a function`.

- [ ] **Step 3: Implement the repo section**

In `server/src/repo.ts`, after the existing `import { Db } from './db';` line add:

```ts
import {
  BOARD_KEYS,
  BOARD_SIZE,
  BoardKey,
  BoardRow,
  BoardSet,
  LTD_ASSET_MULTIPLIER,
  MyRank,
  MyRanks,
  priceTable,
} from './leaderboards';
```

Above `export class Repo {` add:

```ts
/** SQL column per board, from the scores CTE below. Whitelisted: interpolated into SQL. */
const BOARD_COLUMN: Record<BoardKey, string> = { coins: 'coins', assets: 'assets', timeWeek: 'time_week', timeAll: 'time_all' };

/**
 * One row per rankable user. Params: $1 price table JSON, $2 system handle, $3 current KL Monday.
 * Hidden users and the system user are left out, so they neither show nor push others down.
 */
const SCORES_SQL = `
with price as (
  select key as def, value::int as price from jsonb_each_text($1::jsonb)
),
inv as (
  select i.user_id, sum(i.qty::bigint * p.price) as v
  from inventory i join price p on p.def = i.def
  where i.qty > 0
  group by i.user_id
),
inst as (
  select it.owner_id as user_id,
         sum(p.price::bigint * case when it.serial is not null then ${LTD_ASSET_MULTIPLIER} else 1 end) as v
  from items it join price p on p.def = it.def
  group by it.owner_id
),
scores as (
  select u.id, u.handle, u.avatar,
         u.coins::float8 as coins,
         (coalesce(inv.v, 0) + coalesce(inst.v, 0))::float8 as assets,
         (case when u.play_week_start >= $3::date then u.play_week else 0 end)::float8 as time_week,
         u.play_minutes::float8 as time_all
  from users u
  left join inv on inv.user_id = u.id
  left join inst on inst.user_id = u.id
  where not u.hide_rank and u.handle <> $2
)`;
```

Directly after the `pruneRolls` method (inside the class) add:

```ts
  // ---- leaderboards

  /**
   * One online minute for each user. The weekly counter resets lazily: a
   * play_week_start before this Monday starts the week over at 1.
   */
  async addPlayMinutes(userIds: string[], monday: string): Promise<void> {
    if (!userIds.length) return;
    await this.db.query(
      `update users set
         play_minutes = play_minutes + 1,
         play_week = case when play_week_start >= $2::date then play_week + 1 else 1 end,
         play_week_start = greatest(coalesce(play_week_start, $2::date), $2::date)
       where id in (select jsonb_array_elements_text($1::jsonb))`,
      [JSON.stringify(userIds), monday],
    );
  }

  async setHideRank(userId: string, hide: boolean): Promise<void> {
    await this.db.query('update users set hide_rank = $2 where id = $1', [userId, hide]);
  }

  /** Top `limit` per board, value > 0 only, ties share a rank. */
  async leaderboards(monday: string, limit = BOARD_SIZE): Promise<BoardSet> {
    const params = [priceTable(), SYSTEM_HANDLE, monday, limit];
    const out = {} as BoardSet;
    for (const key of BOARD_KEYS) {
      const col = BOARD_COLUMN[key];
      const rows = await this.db.query<{ rank: number; handle: string; avatar: unknown; value: number }>(
        `${SCORES_SQL}
         select rank() over (order by ${col} desc)::int as rank, handle, avatar, ${col} as value
         from scores
         where ${col} > 0
         order by ${col} desc, handle
         limit $4`,
        params,
      );
      out[key] = rows.map(
        (r): BoardRow => ({ rank: r.rank, handle: r.handle, avatar: serializeAvatar(normalizeAvatar(r.avatar)), value: Number(r.value) }),
      );
    }
    return out;
  }

  /** The user's own rank on every board: 1 + visible users with a strictly greater value. */
  async leaderboardRanks(userId: string, monday: string): Promise<MyRanks | null> {
    const flag = await this.db.query<{ hide_rank: boolean }>('select hide_rank from users where id = $1', [userId]);
    if (!flag.length) return null;
    if (flag[0].hide_rank) return { hidden: true };
    const select = BOARD_KEYS.map((key) => {
      const col = BOARD_COLUMN[key];
      return `m.${col} as ${col}, (select count(*) from scores s where s.${col} > m.${col})::int as ${col}_above`;
    }).join(',\n       ');
    const rows = await this.db.query<Record<string, number>>(
      `${SCORES_SQL}
       select ${select}
       from scores m where m.id = $4`,
      [priceTable(), SYSTEM_HANDLE, monday, userId],
    );
    const row = rows[0];
    if (!row) return { hidden: true }; // only the system user lands here
    const mine = (key: BoardKey): MyRank => {
      const value = Number(row[BOARD_COLUMN[key]]);
      return { rank: value > 0 ? Number(row[`${BOARD_COLUMN[key]}_above`]) + 1 : null, value };
    };
    return { hidden: false, coins: mine('coins'), assets: mine('assets'), timeWeek: mine('timeWeek'), timeAll: mine('timeAll') };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dovey/server test -- leaderboards.repo`
Expected: PASS — `Tests  5 passed (5)`.

- [ ] **Step 5: Full server suite and typecheck**

Run: `pnpm --filter @dovey/server test && pnpm --filter @dovey/server typecheck`
Expected: all test files pass; typecheck exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add server/src/repo.ts server/src/leaderboards.repo.test.ts
git commit -F - <<'MSG'
feat(server): leaderboard queries, play minutes and hide flag in the repo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 3: Record online minutes in the coin trickle

**Files:**
- Modify: `server/src/GameRoom.ts` — import block (after `import { presence } from './social';`, without editing that line) and the `// ---- coins: everyone online earns a trickle` `this.clock.setInterval(..., 60_000)` callback only

**Interfaces:**
- Consumes: `playMinutes.take(userIds, now): string[]`, `klMonday(now): string` (Task 1), `Repo.addPlayMinutes(userIds, monday)` (Task 2)
- Produces: nothing new (side effect: `users.play_minutes`, `play_week`, `play_week_start` advance once a minute per connected human)

- [ ] **Step 1: Check for an existing play-minute increment (trading)**

Run: `grep -n "play_minutes\|addPlayMinute" server/src/GameRoom.ts server/src/repo.ts`
Expected: only the Task 2 lines in `repo.ts`. If `GameRoom.ts` already increments `play_minutes` (trading stage 2), delete that increment in this step so Step 3's call is the only one, and keep any trading repo method only if other code still calls it.

- [ ] **Step 2: Add the import**

After the line `import { presence } from './social';` add a new line:

```ts
import { klMonday, playMinutes } from './leaderboards';
```

- [ ] **Step 3: Extend the trickle**

Replace:

```ts
    this.clock.setInterval(() => {
      for (const c of this.clients) {
        const u = c.auth as User | undefined;
        if (!u) continue;
        void GameRoom.repo.creditCoins(u.id, COINS_PER_MINUTE).then((coins) => c.send('coins', { coins, earned: COINS_PER_MINUTE }));
      }
    }, 60_000);
```

with:

```ts
    this.clock.setInterval(() => {
      for (const c of this.clients) {
        const u = c.auth as User | undefined;
        if (!u) continue;
        void GameRoom.repo.creditCoins(u.id, COINS_PER_MINUTE).then((coins) => c.send('coins', { coins, earned: COINS_PER_MINUTE }));
      }
      // leaderboards: one online minute per human (bots are never clients), once across all rooms/tabs
      const humans = this.clients.flatMap((c) => {
        const u = c.auth as User | undefined;
        return u ? [u.id] : [];
      });
      const counted = playMinutes.take(humans, Date.now());
      if (counted.length) {
        void GameRoom.repo.addPlayMinutes(counted, klMonday(new Date())).catch((e) => console.error('[leaderboards]', e));
      }
    }, 60_000);
```

- [ ] **Step 4: Typecheck and run the server suite**

Run: `pnpm --filter @dovey/server typecheck && pnpm --filter @dovey/server test`
Expected: typecheck exits 0; all test files pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/GameRoom.ts
git commit -F - <<'MSG'
feat(server): count online minutes for leaderboards in the coin trickle

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 4: Cache and API routes

**Files:**
- Modify: `server/src/leaderboards.ts` (append `LeaderboardCache`)
- Modify: `server/src/leaderboards.test.ts` (append cache tests)
- Modify: `server/src/api.ts` — imports; cache declared directly after `app.use(express.json({ limit: '16kb' }));`; `hideRank` handling inside the existing `app.patch('/api/me', ...)` handler (after the `onboarded` line — the handler predates d7's friends block, which starts after it and stays untouched); new routes directly after the `app.post('/api/daily', ...)` handler
- Test: `server/src/leaderboards.api.test.ts`

**Interfaces:**
- Consumes: `Repo.leaderboards`, `Repo.leaderboardRanks`, `Repo.setHideRank` (Task 2), `klMonday` (Task 1)
- Produces:
  - `class LeaderboardCache { constructor(load: () => Promise<BoardSet>, ttlMs?: number, now?: () => number); get(): Promise<Boards>; invalidate(): void }`
  - `GET /api/leaderboards` → `Boards` (`cache-control: public, max-age=30`)
  - `POST /api/leaderboards/me {token}` → `MyRanks` | 401 `{ error: 'unknown' }`
  - `PATCH /api/me {token, hideRank?: boolean}` → existing `meJson` shape

- [ ] **Step 1: Write the failing cache tests**

Append to `server/src/leaderboards.test.ts`:

```ts
import { LeaderboardCache } from './leaderboards';
import type { BoardSet } from './leaderboards';

const EMPTY: BoardSet = { coins: [], assets: [], timeWeek: [], timeAll: [] };

describe('LeaderboardCache', () => {
  it('reuses a load for 60 s and shares an in-flight load', async () => {
    let t = 1_000_000;
    let loads = 0;
    const cache = new LeaderboardCache(async () => {
      loads++;
      return EMPTY;
    }, 60_000, () => t);
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    expect(loads).toBe(1);
    expect(a).toBe(b);
    expect(a.generatedAt).toBe(new Date(1_000_000).toISOString());
    t += 59_999;
    await cache.get();
    expect(loads).toBe(1);
    t += 1;
    const c = await cache.get();
    expect(loads).toBe(2);
    expect(c.generatedAt).toBe(new Date(1_060_000).toISOString());
  });

  it('invalidate forces the next get to reload, even over an in-flight load', async () => {
    let loads = 0;
    let release: () => void = () => {};
    const cache = new LeaderboardCache(async () => {
      loads++;
      if (loads === 1) await new Promise<void>((r) => (release = r));
      return EMPTY;
    }, 60_000, () => 0);
    const first = cache.get();
    cache.invalidate();
    release();
    await first;
    await cache.get();
    expect(loads).toBe(2);
  });
});
```

(Move the two new `import` lines to the top of the file next to the existing imports so the file has one import block.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dovey/server test -- leaderboards.test`
Expected: FAIL — `LeaderboardCache is not a constructor` (or missing export).

- [ ] **Step 3: Implement the cache**

Append to `server/src/leaderboards.ts`:

```ts
/**
 * Boards are recomputed at most once per TTL. Concurrent callers share one
 * load; invalidate() (hide toggle) makes the next get reload and discards an
 * in-flight result started before it.
 */
export class LeaderboardCache {
  private value: Boards | null = null;
  private at = 0;
  private inflight: Promise<Boards> | null = null;
  private gen = 0;

  constructor(
    private load: () => Promise<BoardSet>,
    private ttlMs = LEADERBOARD_TTL_MS,
    private now: () => number = Date.now,
  ) {}

  get(): Promise<Boards> {
    const t = this.now();
    if (this.value && t - this.at < this.ttlMs) return Promise.resolve(this.value);
    if (this.inflight) return this.inflight;
    const gen = this.gen;
    const p = this.load()
      .then((set) => {
        const boards: Boards = { generatedAt: new Date(t).toISOString(), ...set };
        if (gen === this.gen) {
          this.value = boards;
          this.at = t;
        }
        return boards;
      })
      .finally(() => {
        if (this.inflight === p) this.inflight = null;
      });
    this.inflight = p;
    return p;
  }

  invalidate() {
    this.gen++;
    this.value = null;
    this.inflight = null;
  }
}
```

- [ ] **Step 4: Run the cache tests**

Run: `pnpm --filter @dovey/server test -- leaderboards.test`
Expected: PASS — `Tests  7 passed (7)`.

- [ ] **Step 5: Write the failing API test**

Create `server/src/leaderboards.api.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { buildApi } from './api';

const PORT = 2596;
const BASE = `http://localhost:${PORT}`;
const TOKEN = 'l'.repeat(32);

let db: Db;
let repo: Repo;
let server: Server;
let userId = '';

const post = (path: string, body: unknown, method = 'POST') =>
  fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  const u = await repo.createUser(TOKEN, DEFAULT_AVATAR);
  userId = u.id;
  await db.query("update users set handle = 'lb_rich', coins = 9000 where id = $1", [userId]);
  const app = buildApi(repo);
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => resolve());
  });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

describe('leaderboards api', () => {
  it('serves cached boards, personal ranks and the hide toggle', async () => {
    const r1 = await fetch(`${BASE}/api/leaderboards`);
    expect(r1.status).toBe(200);
    expect(r1.headers.get('cache-control')).toBe('public, max-age=30');
    const b1 = await r1.json();
    expect(Object.keys(b1).sort()).toEqual(['assets', 'coins', 'generatedAt', 'timeAll', 'timeWeek']);
    expect(b1.coins[0]).toMatchObject({ rank: 1, handle: 'lb_rich', value: 9000 });

    const me = await (await post('/api/leaderboards/me', { token: TOKEN })).json();
    expect(me).toMatchObject({ hidden: false, coins: { rank: 1, value: 9000 } });
    expect((await post('/api/leaderboards/me', { token: 'z'.repeat(32) })).status).toBe(401);
    expect((await post('/api/leaderboards/me', {})).status).toBe(401);

    // cached: a change in the db does not show within the TTL
    await db.query('update users set coins = 100 where id = $1', [userId]);
    const b2 = await (await fetch(`${BASE}/api/leaderboards`)).json();
    expect(b2.generatedAt).toBe(b1.generatedAt);
    expect(b2.coins[0].value).toBe(9000);

    // hiding invalidates the cache
    expect((await post('/api/me', { token: TOKEN, hideRank: true }, 'PATCH')).status).toBe(200);
    const b3 = await (await fetch(`${BASE}/api/leaderboards`)).json();
    expect(b3.coins.some((r: { handle: string }) => r.handle === 'lb_rich')).toBe(false);
    expect(await (await post('/api/leaderboards/me', { token: TOKEN })).json()).toEqual({ hidden: true });

    await post('/api/me', { token: TOKEN, hideRank: false }, 'PATCH');
    const b4 = await (await fetch(`${BASE}/api/leaderboards`)).json();
    expect(b4.coins[0]).toMatchObject({ handle: 'lb_rich', value: 100 });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @dovey/server test -- leaderboards.api`
Expected: FAIL — first expectation gets status `200` from nothing? No: `GET /api/leaderboards` has no route, Express 5 answers `404`, so `expected 404 to be 200`.

- [ ] **Step 7: Wire the routes**

In `server/src/api.ts`, after `import { wardrobe } from './vending';` add:

```ts
import { LeaderboardCache, klMonday } from './leaderboards';
```

Directly after `app.use(express.json({ limit: '16kb' }));` add:

```ts
  /** leaderboards are recomputed at most once a minute */
  const boards = new LeaderboardCache(() => repo.leaderboards(klMonday(new Date())));
```

Inside `app.patch('/api/me', ...)`, replace the line

```ts
    if (req.body?.onboarded === true) await repo.setOnboarded(user.id);
```

with

```ts
    if (req.body?.onboarded === true) await repo.setOnboarded(user.id);
    if (typeof req.body?.hideRank === 'boolean') {
      await repo.setHideRank(user.id, req.body.hideRank);
      boards.invalidate();
    }
```

Directly after the whole `app.post('/api/daily', ...)` handler (its closing `});`) add:

```ts
  /** Public leaderboards: top 50 per board, recomputed at most once a minute. */
  app.get('/api/leaderboards', async (_req, res) => {
    res.set('cache-control', 'public, max-age=30');
    res.json(await boards.get());
  });

  /** The caller's own rank on every board, live. Never creates a user. */
  app.post('/api/leaderboards/me', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    const ranks = await repo.leaderboardRanks(user.id, klMonday(new Date()));
    if (!ranks) return res.status(401).json({ error: 'unknown' });
    res.json(ranks);
  });
```

Also add these lines to the route doc comment above `buildApi`:

```ts
 *   GET  /api/leaderboards      -> { generatedAt, coins, assets, timeWeek, timeAll } top 50 each
 *   POST /api/leaderboards/me   -> { hidden } | { hidden:false, coins|assets|timeWeek|timeAll: { rank, value } }
```

- [ ] **Step 8: Run the API test, full suite, typecheck**

Run: `pnpm --filter @dovey/server test -- leaderboards && pnpm --filter @dovey/server test && pnpm --filter @dovey/server typecheck`
Expected: `leaderboards.test.ts`, `leaderboards.repo.test.ts`, `leaderboards.api.test.ts` pass; full suite passes; typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add server/src/leaderboards.ts server/src/leaderboards.test.ts server/src/api.ts server/src/leaderboards.api.test.ts
git commit -F - <<'MSG'
feat(server): leaderboards API with a one-minute cache and hide toggle

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 5: Client route, token helper, data module

**Files:**
- Modify: `client/src/router.ts`, `client/src/router.test.ts`
- Modify: `client/src/identity.ts` (append)
- Create: `client/src/leaderboards.ts`
- Test: `client/src/leaderboards.test.ts`

**Interfaces:**
- Consumes: `GET /api/leaderboards`, `POST /api/leaderboards/me`, `PATCH /api/me` (Task 4)
- Produces:
  - router: `Route` gains `{ kind: 'leaderboards' }`; `const LEADERBOARDS_URL = '/leaderboards'`
  - identity: `storedToken(): string | null`
  - leaderboards: `type BoardKey`, `BoardRow`, `Boards`, `MyRank`, `MyRanks` (same shapes as server), `type Tab = 'coins' | 'assets' | 'time'`, `type TimeSpan = 'week' | 'all'`, `TABS: Array<{ id: Tab; label: string }>`, `SPANS: Array<{ id: TimeSpan; label: string }>`, `boardKey(tab: Tab, span: TimeSpan): BoardKey`, `isTimeBoard(key: BoardKey): boolean`, `formatCoins(n: number): string`, `formatPlayTime(minutes: number): string`, `formatValue(key: BoardKey, value: number): string`, `rankLabel(me: MyRanks | null, key: BoardKey): string | null`, `fetchBoards(fresh?: boolean): Promise<Boards>`, `fetchMyRanks(): Promise<MyRanks | null>`, `setHideRank(hide: boolean): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

In `client/src/router.test.ts`, inside `it('routes landing, play, room', ...)` after the `/nope` expectation add:

```ts
    expect(routeFromPath('/leaderboards')).toEqual({ kind: 'leaderboards' });
    expect(routeFromPath('/leaderboards/')).toEqual({ kind: 'leaderboards' });
    expect(routeFromPath('/leaderboardsx')).toEqual({ kind: 'landing' });
```

Create `client/src/leaderboards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { boardKey, formatCoins, formatPlayTime, formatValue, isTimeBoard, rankLabel } from './leaderboards';

describe('leaderboard formatting', () => {
  it('formats coins with thousands separators', () => {
    expect(formatCoins(0)).toBe('0');
    expect(formatCoins(999)).toBe('999');
    expect(formatCoins(1000)).toBe('1,000');
    expect(formatCoins(1234567)).toBe('1,234,567');
    expect(formatCoins(12.9)).toBe('12');
  });

  it('formats play time as jam and minit', () => {
    expect(formatPlayTime(750)).toBe('12j 30m');
    expect(formatPlayTime(60)).toBe('1j 0m');
    expect(formatPlayTime(45)).toBe('45m');
    expect(formatPlayTime(0)).toBe('0m');
  });

  it('picks the board and the formatter', () => {
    expect(boardKey('coins', 'week')).toBe('coins');
    expect(boardKey('assets', 'all')).toBe('assets');
    expect(boardKey('time', 'week')).toBe('timeWeek');
    expect(boardKey('time', 'all')).toBe('timeAll');
    expect(isTimeBoard('timeAll')).toBe(true);
    expect(isTimeBoard('assets')).toBe(false);
    expect(formatValue('timeWeek', 750)).toBe('12j 30m');
    expect(formatValue('assets', 25000)).toBe('25,000');
  });

  it('labels the viewer rank', () => {
    const mine = { rank: 7, value: 10 };
    const none = { rank: null, value: 0 };
    const me = { hidden: false as const, coins: mine, assets: none, timeWeek: mine, timeAll: mine };
    expect(rankLabel(null, 'coins')).toBeNull();
    expect(rankLabel({ hidden: true }, 'coins')).toBe('Kedudukan kau: Tersembunyi');
    expect(rankLabel(me, 'coins')).toBe('Kedudukan kau: #7');
    expect(rankLabel(me, 'assets')).toBe('Kedudukan kau: –');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dovey/client test -- router leaderboards`
Expected: FAIL — router expects `{ kind: 'leaderboards' }` but receives `{ kind: 'landing' }`; `Failed to resolve import "./leaderboards"`.

- [ ] **Step 3: Router variant**

In `client/src/router.ts`:

Replace the doc comment block

```ts
/**
 * URL scheme:
 *   /            landing page
 *   /play        your own room
 *   /r/:slug     a specific room
 */
export type Route = { kind: 'landing' } | { kind: 'play' } | { kind: 'room'; slug: string };
```

with

```ts
/**
 * URL scheme:
 *   /              landing page
 *   /play          your own room
 *   /r/:slug       a specific room
 *   /leaderboards  public rankings
 */
export type Route = { kind: 'landing' } | { kind: 'play' } | { kind: 'room'; slug: string } | { kind: 'leaderboards' };

export const LEADERBOARDS_URL = '/leaderboards';
```

and in `routeFromPath`, directly after the `/play` line add:

```ts
  if (/^\/leaderboards\/?$/.test(path)) return { kind: 'leaderboards' };
```

- [ ] **Step 4: Token helper**

Append to `client/src/identity.ts`:

```ts
/** The stored token without minting one: null in a browser that has never played. */
export function storedToken(): string | null {
  try {
    const t = localStorage.getItem(KEY);
    return t && t.length >= 16 ? t : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Data module**

Create `client/src/leaderboards.ts`:

```ts
import { storedToken } from './identity';

/** Mirrors server/src/leaderboards.ts. Kept free of the game store so the page chunk stays small. */
export type BoardKey = 'coins' | 'assets' | 'timeWeek' | 'timeAll';
export interface BoardRow {
  rank: number;
  handle: string;
  avatar: string;
  value: number;
}
export type Boards = { generatedAt: string } & Record<BoardKey, BoardRow[]>;
export interface MyRank {
  rank: number | null;
  value: number;
}
export type MyRanks = { hidden: true } | ({ hidden: false } & Record<BoardKey, MyRank>);

export type Tab = 'coins' | 'assets' | 'time';
export type TimeSpan = 'week' | 'all';

export const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'coins', label: 'Paling Kaya' },
  { id: 'assets', label: 'Harta' },
  { id: 'time', label: 'Kaki Lepak' },
];

export const SPANS: Array<{ id: TimeSpan; label: string }> = [
  { id: 'week', label: 'Minggu ini' },
  { id: 'all', label: 'Sepanjang masa' },
];

export function boardKey(tab: Tab, span: TimeSpan): BoardKey {
  if (tab === 'time') return span === 'week' ? 'timeWeek' : 'timeAll';
  return tab;
}

export function isTimeBoard(key: BoardKey): boolean {
  return key === 'timeWeek' || key === 'timeAll';
}

/** 1234567 -> "1,234,567" (no Intl: the same output on every device) */
export function formatCoins(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 750 -> "12j 30m", 45 -> "45m" */
export function formatPlayTime(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}j ${m % 60}m` : `${m}m`;
}

export function formatValue(key: BoardKey, value: number): string {
  return isTimeBoard(key) ? formatPlayTime(value) : formatCoins(value);
}

export function rankLabel(me: MyRanks | null, key: BoardKey): string | null {
  if (!me) return null;
  if (me.hidden) return 'Kedudukan kau: Tersembunyi';
  const r = me[key].rank;
  return `Kedudukan kau: ${r === null ? '–' : `#${r}`}`;
}

const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** `fresh` skips the HTTP cache (after the hide toggle). */
export async function fetchBoards(fresh = false): Promise<Boards> {
  const r = await fetch(`${base}/api/leaderboards`, fresh ? { cache: 'no-store' } : undefined);
  if (!r.ok) throw new Error('leaderboards failed');
  return r.json();
}

export async function fetchMyRanks(): Promise<MyRanks | null> {
  const token = storedToken();
  if (!token) return null;
  try {
    const r = await fetch(`${base}/api/leaderboards/me`, send('POST', { token }));
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function setHideRank(hide: boolean): Promise<boolean> {
  const token = storedToken();
  if (!token) return false;
  try {
    const r = await fetch(`${base}/api/me`, send('PATCH', { token, hideRank: hide }));
    return r.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter @dovey/client test -- router leaderboards && pnpm --filter @dovey/client typecheck`
Expected: `router.test.ts` and `leaderboards.test.ts` pass (`Tests  7 passed (7)`); typecheck exits 0. (If typecheck reports `App.tsx` exhaustiveness errors, none are expected: `App` only compares `ROUTE.kind === 'landing'`.)

- [ ] **Step 7: Commit**

```bash
git add client/src/router.ts client/src/router.test.ts client/src/identity.ts client/src/leaderboards.ts client/src/leaderboards.test.ts
git commit -F - <<'MSG'
feat(client): leaderboards route, data module and formatters

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 6: Leaderboards page

**Files:**
- Create: `client/src/ui/Leaderboards.tsx`
- Create: `client/src/ui/leaderboards.css`
- Modify: `client/src/Root.tsx`

**Interfaces:**
- Consumes: everything exported by `client/src/leaderboards.ts` (Task 5); `AvatarPreview({ cfg, scale, animate, fx, focus, className })` (`client/src/ui/AvatarPreview.tsx`); `CoinIcon({ size })` (`client/src/ui/Icon.tsx`); `parseAvatar(s)` (`@dovey/shared`)
- Produces: `export function Leaderboards(): JSX.Element`; route `/leaderboards` renders it in its own lazy chunk

- [ ] **Step 1: Create the page**

Create `client/src/ui/Leaderboards.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { parseAvatar } from '@dovey/shared';
import { AvatarPreview } from './AvatarPreview';
import { CoinIcon } from './Icon';
import {
  BoardKey,
  Boards,
  MyRanks,
  SPANS,
  TABS,
  Tab,
  TimeSpan,
  boardKey,
  fetchBoards,
  fetchMyRanks,
  formatValue,
  isTimeBoard,
  rankLabel,
  setHideRank,
} from '../leaderboards';
import './leaderboards.css';

const MEDALS = ['gold', 'silver', 'bronze'] as const;

function Head({ avatar, scale }: { avatar: string; scale: number }) {
  const cfg = useMemo(() => parseAvatar(avatar), [avatar]);
  return <AvatarPreview cfg={cfg} focus="head" animate={false} fx={false} scale={scale} className="lb-head" />;
}

function Value({ k, value }: { k: BoardKey; value: number }) {
  return (
    <span className="lb-value">
      {!isTimeBoard(k) && <CoinIcon size={16} />}
      {formatValue(k, value)}
    </span>
  );
}

/** Public rankings at /leaderboards: coins, furniture value, time spent lepak. */
export function Leaderboards() {
  const [boards, setBoards] = useState<Boards | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('coins');
  const [span, setSpan] = useState<TimeSpan>('week');
  const [me, setMe] = useState<MyRanks | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggleError, setToggleError] = useState(false);

  const load = (fresh = false) => {
    setError(false);
    fetchBoards(fresh).then(setBoards, () => setError(true));
    void fetchMyRanks().then(setMe);
  };

  useEffect(() => {
    document.title = 'Ranking · Leypark';
    load();
  }, []);

  const key = boardKey(tab, span);
  const rows = boards?.[key] ?? [];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const hidden = me?.hidden === true;

  const toggleHide = async () => {
    setSaving(true);
    setToggleError(false);
    const ok = await setHideRank(!hidden);
    setSaving(false);
    if (!ok) return setToggleError(true);
    load(true);
  };

  return (
    <div className="lb">
      <header className="lb-top">
        <a className="lb-brand" href="/" aria-label="Leypark home">
          <img
            src="/leypark-mark.svg"
            alt=""
            width={32}
            height={32}
            onError={(e) => {
              e.currentTarget.hidden = true;
            }}
          />
          <span>Leypark</span>
        </a>
        <a className="lb-play" href="/play">
          Main sekarang
        </a>
      </header>

      <main className="lb-wrap">
        <div className="lb-lights" aria-hidden="true" />
        <h1 className="lb-title">Ranking Leypark</h1>
        <p className="lb-sub">Siapa paling power malam ni?</p>

        <div className="lb-tabs" role="tablist" aria-label="Papan ranking">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`lb-tab ${tab === t.id ? 'lb-tab--on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'time' && (
          <div className="lb-spans" role="group" aria-label="Tempoh">
            {SPANS.map((s) => (
              <button
                key={s.id}
                aria-pressed={span === s.id}
                className={`lb-span ${span === s.id ? 'lb-span--on' : ''}`}
                onClick={() => setSpan(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <div className="lb-empty">
            <p>Alamak, tak dapat load ranking. Cuba lagi.</p>
            <button className="lb-retry" onClick={() => load(true)}>
              Cuba lagi
            </button>
          </div>
        ) : !boards ? (
          <p className="lb-empty">Tengah kira…</p>
        ) : rows.length === 0 ? (
          <p className="lb-empty">Belum ada orang lagi. Jadi yang pertama!</p>
        ) : (
          <>
            <ol className="lb-podium">
              {top.map((r, i) => (
                <li key={r.handle} className={`lb-stall lb-stall--${MEDALS[i]}`}>
                  <span className="lb-medal">#{r.rank}</span>
                  <Head avatar={r.avatar} scale={3} />
                  <span className="lb-handle">{r.handle}</span>
                  <Value k={key} value={r.value} />
                </li>
              ))}
            </ol>
            {rest.length > 0 && (
              <ol className="lb-list">
                {rest.map((r) => (
                  <li key={r.handle} className="lb-row">
                    <span className="lb-rank">#{r.rank}</span>
                    <Head avatar={r.avatar} scale={1.5} />
                    <span className="lb-handle">{r.handle}</span>
                    <Value k={key} value={r.value} />
                  </li>
                ))}
              </ol>
            )}
            <p className="lb-updated">
              Dikemas kini {new Date(boards.generatedAt).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </>
        )}

        {me && (
          <section className="lb-me" aria-live="polite">
            <span className="lb-me__rank">{rankLabel(me, key)}</span>
            <label className="lb-me__hide">
              <input type="checkbox" checked={hidden} disabled={saving} onChange={toggleHide} />
              Sembunyi dari leaderboard
            </label>
            {toggleError && <span className="lb-me__err">Tak jadi. Cuba lagi.</span>}
          </section>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create the styles**

Create `client/src/ui/leaderboards.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap');

/* Leaderboards: pasar malam at night. One committed look, colours painted explicitly. */
.lb {
  --lb-night: #1a0f2e;
  --lb-night-2: #2a1440;
  --lb-plum: #4a1631;
  --lb-gold-1: #ffe08a;
  --lb-gold-2: #f4b73c;
  --lb-gold-3: #d98a1c;
  --lb-silver: #d9dde8;
  --lb-bronze: #d08a5a;
  --lb-ink: #fff6e6;
  --lb-muted: #c9b8dc;
  --lb-card: rgba(255, 246, 230, 0.07);
  --lb-line: rgba(255, 224, 138, 0.22);
  min-height: 100vh;
  background:
    radial-gradient(1200px 500px at 50% -120px, rgba(244, 183, 60, 0.28), transparent 70%),
    linear-gradient(180deg, var(--lb-night-2), var(--lb-night) 60%);
  color: var(--lb-ink);
  font-family: 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif;
  padding-inline: 16px;
  padding-block: 0 48px;
  overflow-x: hidden;
}
.lb a { color: inherit; text-decoration: none; }

.lb-top { max-width: 880px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding-block: 16px; gap: 12px; }
.lb-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 22px; color: var(--lb-gold-1); }
.lb-play {
  padding: 8px 16px; border-radius: 999px; font-weight: 800;
  background: linear-gradient(180deg, var(--lb-gold-1), var(--lb-gold-2) 55%, var(--lb-gold-3));
  color: var(--lb-plum); box-shadow: 0 3px 0 var(--lb-plum);
}
.lb-play:hover { filter: brightness(1.05); }

.lb-wrap { position: relative; max-width: 880px; margin: 0 auto; }
.lb-lights {
  height: 18px; margin: 4px 0 20px;
  background: radial-gradient(circle at 12px 6px, var(--lb-gold-1) 0 4px, transparent 5px) 0 0 / 36px 18px repeat-x;
  filter: drop-shadow(0 0 6px rgba(255, 224, 138, 0.8));
  opacity: 0.9;
}
.lb-title { margin: 0; text-align: center; font-size: clamp(32px, 7vw, 52px); font-weight: 800; line-height: 1; color: var(--lb-gold-1); text-shadow: 0 3px 0 var(--lb-plum), 0 0 24px rgba(244, 183, 60, 0.45); }
.lb-sub { margin: 8px 0 24px; text-align: center; color: var(--lb-muted); font-size: 17px; }

.lb-tabs, .lb-spans { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 12px; }
.lb-tab, .lb-span, .lb-retry {
  font: inherit; font-weight: 700; cursor: pointer; border-radius: 999px;
  border: 2px solid var(--lb-line); background: var(--lb-card); color: var(--lb-ink);
  padding: 8px 18px; font-size: 16px;
}
.lb-span { padding: 4px 14px; font-size: 14px; }
.lb-tab--on, .lb-span--on { background: linear-gradient(180deg, var(--lb-gold-1), var(--lb-gold-2)); color: var(--lb-plum); border-color: var(--lb-gold-3); }
.lb-tab:focus-visible, .lb-span:focus-visible, .lb-retry:focus-visible, .lb-play:focus-visible { outline: 3px solid var(--lb-gold-1); outline-offset: 2px; }

.lb-empty { text-align: center; color: var(--lb-muted); margin: 40px 0; font-size: 17px; }

.lb-podium { list-style: none; padding: 0; margin: 20px 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; }
.lb-stall {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
  padding: 28px 10px 14px; border-radius: 18px 18px 12px 12px; background: var(--lb-card);
  border: 2px solid var(--lb-line); min-width: 0;
}
/* striped stall awning */
.lb-stall::before {
  content: ''; position: absolute; inset: -2px -2px auto -2px; height: 16px; border-radius: 16px 16px 0 0;
  background: repeating-linear-gradient(90deg, var(--lb-accent) 0 16px, var(--lb-ink) 16px 32px);
}
.lb-stall--gold { --lb-accent: var(--lb-gold-2); border-color: var(--lb-gold-2); box-shadow: 0 0 28px rgba(244, 183, 60, 0.35); order: 2; padding-top: 40px; }
.lb-stall--silver { --lb-accent: var(--lb-silver); border-color: var(--lb-silver); order: 1; }
.lb-stall--bronze { --lb-accent: var(--lb-bronze); border-color: var(--lb-bronze); order: 3; }
.lb-medal { font-weight: 800; font-size: 20px; color: var(--lb-accent); }
.lb-head { image-rendering: pixelated; display: block; max-width: 100%; height: auto; }
.lb-handle { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.lb-value { display: inline-flex; align-items: center; gap: 4px; font-weight: 800; color: var(--lb-gold-1); font-variant-numeric: tabular-nums; }

.lb-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.lb-row { display: grid; grid-template-columns: 48px 54px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 12px; border-radius: 12px; background: var(--lb-card); border: 1px solid var(--lb-line); }
.lb-rank { font-weight: 800; color: var(--lb-muted); font-variant-numeric: tabular-nums; }

.lb-updated { text-align: center; color: var(--lb-muted); font-size: 13px; margin: 16px 0 0; }

.lb-me {
  position: sticky; bottom: 12px; margin-top: 20px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px;
  padding: 12px 16px; border-radius: 16px; background: var(--lb-plum); border: 2px solid var(--lb-gold-2); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.lb-me__rank { font-weight: 800; font-size: 18px; color: var(--lb-gold-1); }
.lb-me__hide { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.lb-me__hide input { width: 18px; height: 18px; accent-color: var(--lb-gold-2); }
.lb-me__err { color: #ffb4b4; font-size: 14px; width: 100%; }

@media (max-width: 520px) {
  .lb-podium { grid-template-columns: 1fr; }
  .lb-stall--gold, .lb-stall--silver, .lb-stall--bronze { order: 0; }
  .lb-row { grid-template-columns: 40px 54px minmax(0, 1fr) auto; padding: 6px 8px; gap: 8px; }
}

@media (prefers-reduced-motion: no-preference) {
  .lb-stall--gold { animation: lb-glow 2.4s ease-in-out infinite alternate; }
  @keyframes lb-glow { from { box-shadow: 0 0 18px rgba(244, 183, 60, 0.25); } to { box-shadow: 0 0 36px rgba(244, 183, 60, 0.5); } }
}
```

- [ ] **Step 3: Route it in Root**

In `client/src/Root.tsx`, replace:

```tsx
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));

export function Root() {
  if (routeFromPath().kind === 'landing') return <Landing />;
```

with:

```tsx
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
/** rankings: no Pixi, no game store */
const Leaderboards = lazy(() => import('./ui/Leaderboards').then((m) => ({ default: m.Leaderboards })));

export function Root() {
  const route = routeFromPath();
  if (route.kind === 'landing') return <Landing />;
  if (route.kind === 'leaderboards') {
    return (
      <Suspense
        fallback={
          <div className="boot">
            <span className="boot__mark" />
            <span>memuatkan ranking…</span>
          </div>
        }
      >
        <Leaderboards />
      </Suspense>
    );
  }
```

(`App.tsx` is not modified.)

- [ ] **Step 4: Typecheck, test and build**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test && pnpm --filter @dovey/client build`
Expected: typecheck exits 0; all client tests pass; build prints `✓ built in` and lists a separate `Leaderboards-*.js` chunk and a `Leaderboards-*.css` (or `leaderboards-*.css`) asset.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/Leaderboards.tsx client/src/ui/leaderboards.css client/src/Root.tsx
git commit -F - <<'MSG'
feat(client): leaderboards page in the pasar malam night style

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 7: Links — trophy icon, RoomBar button, landing nav

**Files:**
- Modify: `client/src/ui/Icon.tsx` — `IconName` union (after `'pencil'`) and `PATHS` (after the `pencil:` entry; **not** next to `home`, which d7 uses for `friends`)
- Modify: `client/src/ui/RoomBar.tsx` — router import; new button after the share button, before `<i className="tray__sep" />`
- Modify: `client/src/ui/Landing.tsx` — header nav and footer nav elements only

**Interfaces:**
- Consumes: `LEADERBOARDS_URL` (Task 5)
- Produces: `IconName` gains `'trophy'`; in-game button `aria-label="leaderboards"`; landing links `href="/leaderboards"` text `Ranking`

- [ ] **Step 1: Trophy icon**

In `client/src/ui/Icon.tsx` replace

```ts
  | 'pencil';
```

with

```ts
  | 'pencil'
  | 'trophy';
```

and replace

```tsx
  pencil: <path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />,
};
```

with

```tsx
  pencil: <path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />,
  trophy: (
    <>
      <path d="M7.5 3.5h9V9a4.5 4.5 0 0 1-9 0Z" />
      <path d="M7.5 5.5h-3a3 3 0 0 0 3 4.5M16.5 5.5h3a3 3 0 0 1-3 4.5" />
      <path d="M12 13.5v3.5M8 20.5h8M9.5 20.5l.5-3.5h4l.5 3.5" />
    </>
  ),
};
```

(If d7's `friends` entry has already been added next to `home`, leave it untouched; only the `pencil` anchor matters here.)

- [ ] **Step 2: RoomBar button**

In `client/src/ui/RoomBar.tsx` replace

```ts
import { goToRoom } from '../router';
```

with

```ts
import { LEADERBOARDS_URL, goToRoom } from '../router';
```

and replace

```tsx
        <button className="hud__btn" onClick={share} aria-label="share room link" title="share room link">
          <Icon name="share" />
        </button>
        <i className="tray__sep" />
```

with

```tsx
        <button className="hud__btn" onClick={share} aria-label="share room link" title="share room link">
          <Icon name="share" />
        </button>
        <button className="hud__btn" onClick={() => location.assign(LEADERBOARDS_URL)} aria-label="leaderboards" title="Ranking">
          <Icon name="trophy" />
        </button>
        <i className="tray__sep" />
```

- [ ] **Step 3: Landing nav (either Landing.tsx version)**

Run: `grep -n "<nav\|</nav>" client/src/ui/Landing.tsx`
Expected: two `<nav` lines — the header nav (dovey: `<nav className="lp-nav__links" aria-label="sections">`; Leypark may use different copy/classes) and the footer nav (dovey: `<nav aria-label="footer">`).

Edit by element, not by surrounding copy:
- In the **first** `<nav ...>` (inside `<header`), insert as the last child, directly before its `</nav>`:

```tsx
            <a href="/leaderboards">Ranking</a>
```

- In the **last** `<nav ...>` (inside `<footer`), insert as the last child, directly before its `</nav>`:

```tsx
            <a href="/leaderboards">Ranking</a>
```

- If the header has a separate mobile menu (a list rendered when a menu button is open; the dovey `.lp-nav__links` is simply hidden under 1048 px-rule `display: none`), add the same `<a href="/leaderboards">Ranking</a>` as its last item too. Match indentation of the sibling links; if sibling links carry a className, copy it.

Run: `grep -c 'href="/leaderboards"' client/src/ui/Landing.tsx`
Expected: `2` (or `3` with a mobile menu).

- [ ] **Step 4: Typecheck, test, build**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test && pnpm --filter @dovey/client build`
Expected: typecheck exits 0; tests pass; `✓ built in`.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/Icon.tsx client/src/ui/RoomBar.tsx client/src/ui/Landing.tsx
git commit -F - <<'MSG'
feat(client): ranking links from the landing nav and the room bar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 8: Manual browser check (controller)

**Files:** none (verification only)

**Interfaces:**
- Consumes: the whole feature
- Produces: a pass/fail note in the task report

- [ ] **Step 1: Build and serve on port 2597**

```bash
pnpm --filter @dovey/client build
ln -sfn "$PWD/client/dist" /tmp/leypark-social-dist
PORT=2597 CLIENT_DIST=/tmp/leypark-social-dist PGLITE_DIR=/tmp/leypark-social-pglite pnpm --filter @dovey/server dev
```

Expected log lines: `[dovey] serving client from /tmp/leypark-social-dist` and `[dovey] listening on http://localhost:2597 (ws + api)` (brand prefix may read `[leypark]` after the rebrand).

- [ ] **Step 2: Generate data**

- Open `http://localhost:2597/play` in two browser profiles, finish onboarding, stay in a room for over a minute (both earn coins and one online minute).
- `curl -s localhost:2597/api/leaderboards | head -c 400` → JSON with `generatedAt`, `coins` containing both handles, `timeAll` with value `1` each after the first minute (may take up to 60 s more due to the cache).

- [ ] **Step 3: Check the page**

- `http://localhost:2597/leaderboards` at 1280 px: title, tabs Paling Kaya / Harta / Kaki Lepak, sub-toggle Minggu ini / Sepanjang masa only under Kaki Lepak, top 3 stall cards gold/silver/bronze with head portraits, values `1,500`-style and `1j 0m`/`1m`-style, "Dikemas kini HH:MM".
- Footer "Kedudukan kau: #n" in the profile that has played; absent in a fresh private window.
- Tick "Sembunyi dari leaderboard": footer shows "Kedudukan kau: Tersembunyi", your handle leaves every board; untick restores it.
- 400 px width: stall cards stack into one column, no horizontal page scroll, list rows readable.
- Landing `http://localhost:2597/` → "Ranking" link in the header (desktop) and footer opens `/leaderboards`.
- In game, the trophy button in the room bar opens `/leaderboards`; the right-side tray (voice, wardrobe, shop, [friends], build) is unchanged.

- [ ] **Step 4: Stop the server**

Stop the dev server (Ctrl+C). `rm -rf /tmp/leypark-social-pglite` if the test data should not persist.

---

## Done when

- All server and client tests pass, both typechecks exit 0, client build succeeds.
- `GET /api/leaderboards` returns four boards of at most 50 rows, hidden and system users excluded, recomputed at most once a minute.
- `POST /api/leaderboards/me` returns ranks or `{ hidden: true }`; `PATCH /api/me {hideRank}` toggles and invalidates the cache.
- Online minutes advance once per minute per human across rooms; weekly counter resets lazily at Monday 00:00 KL.
- `/leaderboards` page, landing "Ranking" link and RoomBar trophy button work at desktop and 400 px.
- No edits to the files listed as other sessions' areas; `App.tsx` and `styles.css` untouched.

## Self-review against the spec

| Spec requirement | Task |
| --- | --- |
| `/leaderboards` route, own CSS, pasar-malam night style | 5, 6 |
| Tabs Paling Kaya / Harta / Kaki Lepak + Minggu ini / Sepanjang masa | 5 (`TABS`, `SPANS`), 6 |
| Top 50, rank, head portrait, handle, formatted value, top 3 gold/silver/bronze | 2 (`BOARD_SIZE`), 6 |
| "Kedudukan kau: #n" incl. outside top 50, "Tersembunyi" | 2 (`leaderboardRanks`), 5 (`rankLabel`), 6 |
| Asset value with LTD 3×, price-0 = 0, placed + unplaced, coins excluded | 2 (`SCORES_SQL`, test) |
| `play_minutes` identical DDL, once in code; `play_week` + `play_week_start` lazy KL-Monday reset; bots excluded | 1, 2, 3 |
| `hide_rank`, toggle "Sembunyi dari leaderboard" via `PATCH /api/me {hideRank}` | 1, 2, 4, 6 |
| `GET /api/leaderboards` shape, SQL, 60 s memory cache; `POST /api/leaderboards/me` | 2, 4 |
| Bots never appear (not users rows); system user excluded | 2 (test), spec note |
| Landing "Ranking" nav link, in-game trophy button without colliding with d7 | 7, Global Constraints |
| Tests: SQL (LTD 3×, price-0, hidden, weekly reset), cache, client formatting, manual check | 1, 2, 4, 5, 8 |
