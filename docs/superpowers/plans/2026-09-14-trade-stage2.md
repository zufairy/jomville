# Trading (Casino Stage 2) Implementation Plan — Part 1 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Part 1 (this file): header, file map, Tasks 1-5 (DB transaction, shared trade types, migrations, trade ledger, gates + offer checks).
> Part 2: `docs/superpowers/plans/2026-09-14-trade-stage2-part2.md` — Tasks 6-9 (TradeBook, TradeController, GameRoom hooks, mod API).
> Part 3: `docs/superpowers/plans/2026-09-14-trade-stage2-part3.md` — Tasks 10-15 (client logic/store/net, TradeWindow + trade.css, ProfileSheet + App, smoke, manual check, self-review).

**Goal:** A safe player-to-player trade window in the same room for coins, stackable furniture and instance items (including LTD rares with their serials), executed atomically in one real database transaction, logged, reportable, and visible to moderators.

**Architecture:** A pure `TradeBook` (injectable clock) holds invites and sessions per room; a `TradeController` in `server/src/trade/` validates messages, applies gates and rate limits, and calls `repo.executeTrade`, which moves coins, stacks and instances inside `Db.transaction` (PGlite `pg.transaction()`) and writes a `trades` log row. `GameRoom` only forwards the seven `t_*` messages, the leave, the 5 s sweep and the per-minute `play_minutes` tick; the client keeps trade state in its own zustand store (`client/src/trade.ts`, like `tableGames.ts`), re-fetches inventory over HTTP after every `t_done`, and renders `TradeWindow` inside the existing `VipModal` shell.

**Tech Stack:** pnpm 11 workspace, TypeScript 5, Colyseus 0.16, PGlite 0.5.8 (raw SQL), Express 5, React 18 + zustand 5, vitest 2.

**Spec:** `docs/superpowers/specs/2026-09-14-trade-stage2-design.md` (binding addendum) on top of `docs/superpowers/specs/2026-09-14-casino-trade-design.md` Section 3 (Trading) and Section 4 "Report inside trade" + "Mod view".

## Global Constraints

- Node ≥ 22, pnpm 11. Run every command from the worktree root `/Users/along/Documents/GitHub/jomville/.claude/worktrees/trade-duel`. Never touch `/Users/along/Documents/GitHub/jomville` itself or other worktrees.
- Test/smoke/manual servers use ports **2597** (smoke) and **2596** (manual browser check) only. Never 5173 or 2567 (another session uses them).
- The worktree path contains `/.claude/`; express.static refuses dot-segments, so a server that serves the client must set `CLIENT_DIST` to a symlink outside the dot path (`/tmp/dovey-trade-dist`).
- Do NOT edit (another session's uncommitted work): `client/src/styles.css`, `client/src/ui/ChatBar.tsx`, `client/src/ui/ChatFeed.tsx`, `server/src/bots.ts`, `server/src/bots.test.ts`, the `bots` import / `spawnBots` in `server/src/GameRoom.ts`, `customizeFocus` in `client/src/store.ts` (this plan does not edit `client/src/store.ts` at all), `client/src/ui/VendingSheet.tsx`, `client/src/ui/Customizer.tsx`, `client/src/wear.ts`.
- All trade CSS lives in `client/src/ui/trade.css`, imported by `client/src/ui/TradeWindow.tsx`.
- `server/src/GameRoom.ts` (1057 lines) gets only thin hooks next to the duel block; all trade rules live in `server/src/trade/*`.
- Gates (`too_new`: account < 24 h via `users.created_at` or < 30 `users.play_minutes`) apply only when `NODE_ENV === 'production'` and `TRADE_GATES !== 'off'`.
- Session rules: invite TTL 20 000 ms; ≤ 9 slots per side; stack qty integer 1..9999; coins integer 0..1 000 000 000; confirm unlocks 3000 ms after both accept; idle close after 300 000 ms; any offer change resets both accepts and the countdown.
- Rate limits: all `t_*` messages 10 per 1000 ms per client; `t_invite` 1 per 5000 ms per client.
- Refused invites use `sys {code}` with `no_such_player`, `trade_busy`, `blocked_pair`, `too_new`, `trade_off`, `rate_limited`.
- Messages client → server: `t_invite {id}`, `t_respond {ok}`, `t_offer {slots, coins}`, `t_accept`, `t_confirm`, `t_cancel`, `t_report {note?}`. Server → client: `t_incoming {from, handle}`, `t_waiting {to}`, `t_state {partner:{id,handle}, you, them, acceptedYou, acceptedThem, confirmAt}`, `t_done {ok, code?}`, plus `coins {coins, earned:0}` after a successful trade.
- `t_state.confirmAt` is sent as **milliseconds remaining** until Confirm unlocks (`0` = unlocked, `null` = not both accepted), mirroring `tg_state.turnLeft`, so client clock skew cannot break the countdown.
- System-room furniture (`itemId === ''`) and placed instances are never offerable.
- Every commit uses exactly:
  ```
  git commit -F - <<'MSG'
  <type>(trade): <summary>

  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
  MSG
  ```
- A parallel duel plan also works in this worktree. If `git commit` fails with an `index.lock` error, wait a few seconds and retry. Only `git add` the files named in the task.

## File Map

| File | Change | Responsibility |
| --- | --- | --- |
| `server/src/db.ts` | modify | `Db.transaction`, `trades` table + indexes, `play_minutes` and `trade_enabled` column migrations |
| `server/src/db.transaction.test.ts` | create | commit / rollback / error identity tests for `Db.transaction` |
| `shared/src/trade.ts` | create | trade constants, `Offer`/`ResolvedOffer`/`TradeStateMsg`/`TradeLogOffer` types, `parseOffer` |
| `shared/src/trade.test.ts` | create | `parseOffer` shape tests |
| `shared/src/index.ts` | modify | `export * from './trade'` |
| `server/src/repo.ts` | modify | `RoomRow.trade_enabled`, `tradeStanding`, `addPlayMinute`, `executeTrade`, `tradesFor` |
| `server/src/trade/ledger.ts` | create | `TradeAbort`, `moveCoins`, `moveStack`, `transferInstance` (tx-only SQL guards) |
| `server/src/trade/tradeRepo.test.ts` | create | migrations, standing, `executeTrade` happy path + rollbacks, log, `tradesFor` |
| `server/src/trade/gates.ts` | create | `tradeGatesOn(env)`, `isTooNew(standing, now)` |
| `server/src/trade/gates.test.ts` | create | prod on / dev off / `TRADE_GATES=off` / age + minutes |
| `server/src/trade/offers.ts` | create | `checkOffer(inventory, offer)` → resolved names + serials or failure code |
| `server/src/trade/offers.test.ts` | create | coins / stack / instance / placed checks |
| `server/src/trade/TradeBook.ts` | create | pure invite + session state machine (TTL, reset, countdown, idle, close) |
| `server/src/trade/TradeBook.test.ts` | create | fake-clock tests |
| `server/src/trade/controller.ts` | create | `TradeController`: message handling, gates, rate limits, execute, report, leave, sweep |
| `server/src/trade/controller.test.ts` | create | end-to-end server flow against PGlite with a fake host |
| `server/src/GameRoom.ts` | modify | thin hooks: import, fields, `trade_enabled` cache, `play_minutes`, message forwarding, sweep, leave |
| `server/src/api.ts` | modify | `GET /api/mod/trades?user=` |
| `server/src/trade/modApi.test.ts` | create | mod token guard + listing |
| `client/src/tradeLogic.ts` | create | pure offer editing, changed-slot flash keys, countdown math |
| `client/src/tradeLogic.test.ts` | create | tests for the above |
| `client/src/trade.ts` | create | trade zustand store, sender binding, `trade` actions, server message handlers, inventory re-fetch |
| `client/src/trade.test.ts` | create | store transitions + `t_done` re-fetch |
| `client/src/net.ts` | modify | register `t_*` handlers, trade `sys` texts, `onTradeSys` |
| `client/src/game/Game.ts` | modify | `bindTradeSender`, reset trade store on rejoin |
| `client/src/ui/BuildBar.tsx` | modify | export `Thumb` for reuse |
| `client/src/ui/TradeWindow.tsx` | create | incoming popup, waiting, trade window (columns, picker, coins, accept/confirm ring, warning, report, flash) |
| `client/src/ui/trade.css` | create | all trade styles |
| `client/src/ui/ProfileSheet.tsx` | modify | 🤝 Trade button next to the duel button |
| `client/src/App.tsx` | modify | mount `<TradeWindow />` |
| `server/scripts/seed-trade-smoke.ts` | create | seed two smoke users with coins, chairs and two LTD thrones |
| `client/scripts/smoke-trade.mjs` | create | two-client trade smoke incl. placed-mid-trade failure |

---

### Task 1: `Db.transaction` (shared helper with the duel plan)

**Files:**
- Modify: `server/src/db.ts` (interface `Db` lines 9-12; `openDb` return lines 134-140; `openTestDb` return lines 148-154; import line 1)
- Create: `server/src/db.transaction.test.ts`

**Interfaces:**
- Consumes: `PGlite#transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>` from `@electric-sql/pglite` 0.5.8 (rolls back and rethrows the same error object on throw — verified).
- Produces: `Db.transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>`. Inside `fn`, only `tx.query` may be used (the outer `db.query` waits for the lock and would deadlock). `tx.transaction(fn)` joins the current transaction (no savepoints). `tx.close()` rejects.

- [ ] **Step 1: Check whether the duel plan already added the helper**

Run: `grep -n "transaction<T>" server/src/db.ts`
Expected: either no output (continue with Step 2 and Step 3) or a line inside `interface Db` (skip Step 3; still do Step 2, and in Step 2 only create the test file if `server/src/db.transaction.test.ts` does not exist; if it exists, append any of the four `it(...)` blocks below whose titles are missing into its `describe`).

- [ ] **Step 2: Write the failing test** — `server/src/db.transaction.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, openTestDb } from './db';

let db: Db;
const rows = async () => (await db.query<{ n: number }>('select n from tx_probe order by n')).map((r) => r.n);

beforeAll(async () => {
  db = await openTestDb();
  await db.query('create table tx_probe (n int not null)');
});
afterAll(() => db.close());

describe('Db.transaction', () => {
  it('commits every write and returns the callback value', async () => {
    const out = await db.transaction(async (tx) => {
      await tx.query('insert into tx_probe (n) values (1)');
      await tx.query('insert into tx_probe (n) values (2)');
      return 'done';
    });
    expect(out).toBe('done');
    expect(await rows()).toEqual([1, 2]);
  });

  it('a throw rolls back all writes and rethrows', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into tx_probe (n) values (3)');
        await tx.query('update tx_probe set n = n + 100');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await rows()).toEqual([1, 2]);
  });

  it('a failing statement rolls back earlier writes', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into tx_probe (n) values (4)');
        await tx.query('insert into tx_probe (n) values (null)');
      }),
    ).rejects.toThrow();
    expect(await rows()).toEqual([1, 2]);
  });

  it('keeps the thrown error identity so callers can map codes', async () => {
    class Custom extends Error {
      code = 'x';
    }
    const err = await db
      .transaction(async () => {
        throw new Custom('custom');
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Custom);
    expect((err as Custom).code).toBe('x');
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `pnpm --filter @dovey/server exec vitest run src/db.transaction.test.ts`
Expected: FAIL — TypeScript/vitest error `db.transaction is not a function`.

- [ ] **Step 4: Implement** — `server/src/db.ts`

Replace line 1:

```ts
import { PGlite, type Transaction } from '@electric-sql/pglite';
```

Replace the interface (lines 9-12):

```ts
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Run `fn` in one real transaction. PGlite has a single connection, so
   * `pg.transaction()` holds it for the whole callback; a BEGIN/COMMIT through
   * query() would let other rooms' statements run inside. Inside `fn` use only
   * `tx`; any throw rolls everything back and is rethrown unchanged.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

Add after the `migrate` function (after line 123):

```ts
/** A Db view of an open transaction; nested transaction() joins it. */
function txDb(tx: Transaction): Db {
  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await tx.query<T>(sql, params);
      return r.rows;
    },
    transaction: (fn) => fn(db),
    close: () => Promise.reject(new Error('cannot close the database inside a transaction')),
  };
  return db;
}

function dbOf(pg: PGlite): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pg.query<T>(sql, params);
      return r.rows;
    },
    transaction: (fn) => pg.transaction((tx) => fn(txDb(tx))),
    close: () => pg.close(),
  };
}
```

In `openDb`, replace the returned object literal (lines 134-140) with:

```ts
  return dbOf(pg);
```

In `openTestDb`, replace the returned object literal (lines 148-154) with:

```ts
  return dbOf(pg);
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @dovey/server exec vitest run src/db.transaction.test.ts src/repo.test.ts src/casino.test.ts`
Expected: `Test Files  3 passed (3)`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/db.transaction.test.ts
git commit -F - <<'MSG'
feat(trade): Db.transaction over PGlite pg.transaction

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

(If Step 1 found the helper already present, commit only the test file with summary `test(trade): cover Db.transaction rollback and error identity`.)

---

### Task 2: Shared trade types, constants and `parseOffer`

**Files:**
- Create: `shared/src/trade.ts`
- Create: `shared/src/trade.test.ts`
- Modify: `shared/src/index.ts` (append after line 29 `export * from './kitchenWorld';`, before `export * as kitchen`)

**Interfaces:**
- Consumes: `furnitureDef(id): FurnitureDef | undefined`, `isInstanceDef(d): boolean` from `shared/src/furniture.ts` (lines 425, 430).
- Produces (all exported from `@dovey/shared`):
  - constants `TRADE_SLOTS = 9`, `TRADE_QTY_MAX = 9999`, `TRADE_COINS_MAX = 1_000_000_000`, `TRADE_INVITE_TTL_MS = 20_000`, `TRADE_CONFIRM_DELAY_MS = 3000`, `TRADE_IDLE_MS = 300_000`, `TRADE_FLASH_MS = 2000`, `TRADE_MSG_RATE = { count: 10, windowMs: 1000 }`, `TRADE_INVITE_RATE = { count: 1, windowMs: 5000 }`, `TRADE_MIN_AGE_MS = 86_400_000`, `TRADE_MIN_PLAY_MINUTES = 30`, `TRADE_ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/`
  - `type TradeSlot = { def: string; qty: number } | { itemId: string }`
  - `interface Offer { slots: TradeSlot[]; coins: number }`
  - `interface ResolvedSlot { def: string; qty: number; itemId: string | null; name: string; serial: number | null }`
  - `interface ResolvedOffer { slots: ResolvedSlot[]; coins: number }`
  - `interface TradeStateMsg { partner: { id: string; handle: string }; you: ResolvedOffer; them: ResolvedOffer; acceptedYou: boolean; acceptedThem: boolean; confirmAt: number | null }`
  - `type TradeFailCode = 'bad_offer' | 'insufficient_coins' | 'insufficient_items' | 'not_owned' | 'trade_failed'`
  - `type TradeDoneCode = TradeFailCode | 'cancelled' | 'declined' | 'expired' | 'left' | 'idle' | 'reported' | 'trade_busy' | 'peer_gone'`
  - `interface TradeDoneMsg { ok: boolean; code?: TradeDoneCode }`
  - `type TradeLogSlot = { def: string; qty: number } | { itemId: string; def: string; serial: number | null }`
  - `interface TradeLogOffer { coins: number; slots: TradeLogSlot[] }`
  - `parseOffer(raw: unknown): Offer | null`

- [ ] **Step 1: Write the failing test** — `shared/src/trade.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { TRADE_SLOTS, parseOffer } from './trade';

describe('parseOffer', () => {
  it('accepts stacks, instances and coins', () => {
    expect(parseOffer({ slots: [{ def: 'chair', qty: 2 }, { itemId: 'abcDEF_12-x' }], coins: 300 })).toEqual({
      slots: [{ def: 'chair', qty: 2 }, { itemId: 'abcDEF_12-x' }],
      coins: 300,
    });
  });

  it('defaults missing coins to 0 and allows an empty offer', () => {
    expect(parseOffer({ slots: [] })).toEqual({ slots: [], coins: 0 });
  });

  it('caps the slot count at 9', () => {
    const ten = Array.from({ length: TRADE_SLOTS + 1 }, (_, i) => ({ itemId: `item${i}` }));
    expect(parseOffer({ slots: ten, coins: 0 })).toBeNull();
    expect(parseOffer({ slots: ten.slice(0, TRADE_SLOTS), coins: 0 })?.slots).toHaveLength(9);
  });

  it('rejects bad quantities', () => {
    for (const qty of [0, -1, 1.5, '2', 10_000, undefined]) expect(parseOffer({ slots: [{ def: 'chair', qty }] })).toBeNull();
  });

  it('rejects duplicate item ids and duplicate stack defs', () => {
    expect(parseOffer({ slots: [{ itemId: 'same1' }, { itemId: 'same1' }] })).toBeNull();
    expect(parseOffer({ slots: [{ def: 'chair', qty: 1 }, { def: 'chair', qty: 1 }] })).toBeNull();
  });

  it('rejects unknown defs, instance defs as stacks, and system furniture (empty itemId)', () => {
    expect(parseOffer({ slots: [{ def: 'nope', qty: 1 }] })).toBeNull();
    expect(parseOffer({ slots: [{ def: 'dicemaster', qty: 1 }] })).toBeNull();
    expect(parseOffer({ slots: [{ def: 'throne_gold', qty: 1 }] })).toBeNull();
    expect(parseOffer({ slots: [{ itemId: '' }] })).toBeNull();
    expect(parseOffer({ slots: [{ itemId: 'ok1', def: 'chair' }] })).toBeNull();
  });

  it('rejects bad coins and bad shapes', () => {
    for (const coins of [-1, 1.2, '5', 1_000_000_001]) expect(parseOffer({ slots: [], coins })).toBeNull();
    expect(parseOffer(null)).toBeNull();
    expect(parseOffer('x')).toBeNull();
    expect(parseOffer({ slots: 'nope' })).toBeNull();
    expect(parseOffer({ slots: [null] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm --filter @dovey/shared exec vitest run src/trade.test.ts`
Expected: FAIL — `Failed to resolve import "./trade"`.

- [ ] **Step 3: Implement** — `shared/src/trade.ts`

```ts
import { furnitureDef, isInstanceDef } from './furniture';

/**
 * Player-to-player trading (casino stage 2). Shapes and limits shared by the
 * server (authoritative) and the client (window + optimistic editing).
 */
export const TRADE_SLOTS = 9;
export const TRADE_QTY_MAX = 9999;
export const TRADE_COINS_MAX = 1_000_000_000;
export const TRADE_INVITE_TTL_MS = 20_000;
export const TRADE_CONFIRM_DELAY_MS = 3000;
export const TRADE_IDLE_MS = 300_000;
/** a slot that changed within this window flashes, so a last-second swap is visible */
export const TRADE_FLASH_MS = 2000;
export const TRADE_MSG_RATE = { count: 10, windowMs: 1000 };
export const TRADE_INVITE_RATE = { count: 1, windowMs: 5000 };
export const TRADE_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const TRADE_MIN_PLAY_MINUTES = 30;
/** instance ids are base64url; '' (system-room furniture) never matches */
export const TRADE_ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type TradeSlot = { def: string; qty: number } | { itemId: string };

export interface Offer {
  slots: TradeSlot[];
  coins: number;
}

export interface ResolvedSlot {
  def: string;
  qty: number;
  itemId: string | null;
  name: string;
  serial: number | null;
}

export interface ResolvedOffer {
  slots: ResolvedSlot[];
  coins: number;
}

export interface TradeStateMsg {
  partner: { id: string; handle: string };
  you: ResolvedOffer;
  them: ResolvedOffer;
  acceptedYou: boolean;
  acceptedThem: boolean;
  /** ms until Confirm unlocks (0 = unlocked); null until both accepted */
  confirmAt: number | null;
}

export type TradeFailCode = 'bad_offer' | 'insufficient_coins' | 'insufficient_items' | 'not_owned' | 'trade_failed';
export type TradeDoneCode = TradeFailCode | 'cancelled' | 'declined' | 'expired' | 'left' | 'idle' | 'reported' | 'trade_busy' | 'peer_gone';

export interface TradeDoneMsg {
  ok: boolean;
  code?: TradeDoneCode;
}

export type TradeLogSlot = { def: string; qty: number } | { itemId: string; def: string; serial: number | null };

export interface TradeLogOffer {
  coins: number;
  slots: TradeLogSlot[];
}

/** Shape check for a `t_offer` payload. Ownership is checked separately, on the server. */
export function parseOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== 'object') return null;
  const { slots, coins = 0 } = raw as { slots?: unknown; coins?: unknown };
  if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 0 || coins > TRADE_COINS_MAX) return null;
  if (!Array.isArray(slots) || slots.length > TRADE_SLOTS) return null;
  const out: TradeSlot[] = [];
  const ids = new Set<string>();
  const defs = new Set<string>();
  for (const s of slots) {
    if (!s || typeof s !== 'object') return null;
    const { itemId, def, qty } = s as Record<string, unknown>;
    if (itemId !== undefined) {
      if (typeof itemId !== 'string' || !TRADE_ITEM_ID.test(itemId) || ids.has(itemId)) return null;
      if (def !== undefined || qty !== undefined) return null;
      ids.add(itemId);
      out.push({ itemId });
      continue;
    }
    const d = typeof def === 'string' ? furnitureDef(def) : undefined;
    if (!d || isInstanceDef(d) || defs.has(d.id)) return null;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > TRADE_QTY_MAX) return null;
    defs.add(d.id);
    out.push({ def: d.id, qty });
  }
  return { slots: out, coins };
}
```

Modify `shared/src/index.ts` — insert after line 29 (`export * from './kitchenWorld';`):

```ts
export * from './trade';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dovey/shared exec vitest run src/trade.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  7 passed (7)`.
Run: `pnpm --filter @dovey/shared typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add shared/src/trade.ts shared/src/trade.test.ts shared/src/index.ts
git commit -F - <<'MSG'
feat(trade): shared trade types, limits and offer shape check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 3: Migrations — `trades` table, `play_minutes`, `trade_enabled`, standing

**Files:**
- Modify: `server/src/db.ts` (append to `SCHEMA` before the closing backtick at line 103; `COLUMNS` array lines 106-115)
- Modify: `server/src/repo.ts` (`RoomRow` lines 44-56; new methods in a `// ---- trading` section inserted after `pruneRolls` which ends at line 459)
- Create: `server/src/trade/tradeRepo.test.ts`

**Interfaces:**
- Produces:
  - table `trades (id serial pk, a_id text not null, b_id text not null, a_offer jsonb not null, b_offer jsonb not null, room_id text, at timestamptz not null default now())`, indexes `trades_a (a_id, at)`, `trades_b (b_id, at)`
  - `users.play_minutes int not null default 0`, `rooms.trade_enabled boolean not null default true`
  - `RoomRow.trade_enabled: boolean`
  - `Repo.tradeStanding(userId: string): Promise<{ createdAt: Date; playMinutes: number } | null>`
  - `Repo.addPlayMinute(userId: string): Promise<void>`

- [ ] **Step 1: Write the failing test** — `server/src/trade/tradeRepo.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from '../db';
import { Repo } from '../repo';

let db: Db;
let repo: Repo;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.ensureLtdStock();
});
afterAll(() => db.close());

describe('trade migrations', () => {
  it('creates the trades table with both indexes', async () => {
    const idx = await db.query<{ indexname: string }>("select indexname from pg_indexes where tablename = 'trades' order by indexname");
    expect(idx.map((r) => r.indexname)).toEqual(expect.arrayContaining(['trades_a', 'trades_b']));
  });

  it('play_minutes starts at 0 and ticks; standing reports account age', async () => {
    const u = await repo.createUser('standing' + 's'.repeat(24), DEFAULT_AVATAR);
    const s0 = await repo.tradeStanding(u.id);
    expect(s0?.playMinutes).toBe(0);
    expect(Date.now() - s0!.createdAt.getTime()).toBeLessThan(60_000);
    await repo.addPlayMinute(u.id);
    await repo.addPlayMinute(u.id);
    expect((await repo.tradeStanding(u.id))?.playMinutes).toBe(2);
    expect(await repo.tradeStanding('nobody')).toBeNull();
  });

  it('rooms default to trade_enabled = true', async () => {
    const u = await repo.createUser('roomflag' + 'r'.repeat(24), DEFAULT_AVATAR);
    const slug = (await repo.homeRoom(u.id))!;
    expect((await repo.room(slug))?.trade_enabled).toBe(true);
    await db.query('update rooms set trade_enabled = false where id = $1', [slug]);
    expect((await repo.room(slug))?.trade_enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/tradeRepo.test.ts`
Expected: FAIL — `repo.tradeStanding is not a function` and the index list lacks `trades_a`.

- [ ] **Step 3: Implement the schema** — `server/src/db.ts`

Append inside `SCHEMA`, right after line 102 (`create index if not exists rolls_room_at on rolls(room_id, at);`):

```sql
create table if not exists trades (
  id serial primary key,
  a_id text not null,
  b_id text not null,
  a_offer jsonb not null,
  b_offer jsonb not null,
  room_id text,
  at timestamptz not null default now()
);
create index if not exists trades_a on trades(a_id, at);
create index if not exists trades_b on trades(b_id, at);
```

Append two entries at the end of `COLUMNS` (after line 114, the `rooms.style` entry):

```ts
  { table: 'users', column: 'play_minutes', ddl: 'alter table users add column play_minutes int not null default 0' },
  { table: 'rooms', column: 'trade_enabled', ddl: 'alter table rooms add column trade_enabled boolean not null default true' },
```

- [ ] **Step 4: Implement the repo methods** — `server/src/repo.ts`

In `RoomRow` (lines 44-56) add after `is_public: boolean;`:

```ts
  /** owner may turn trading off; GameRoom caches it on create */
  trade_enabled: boolean;
```

Insert after `pruneRolls` (after line 459):

```ts
  // ---- trading

  /** Account age and play time, for the production trade gate. */
  async tradeStanding(userId: string): Promise<{ createdAt: Date; playMinutes: number } | null> {
    const r = await this.db.query<{ created_at: Date | string; play_minutes: number }>('select created_at, play_minutes from users where id = $1', [userId]);
    return r[0] ? { createdAt: new Date(r[0].created_at), playMinutes: r[0].play_minutes } : null;
  }

  /** Called once a minute per connected user by the coin trickle. */
  async addPlayMinute(userId: string) {
    await this.db.query('update users set play_minutes = play_minutes + 1 where id = $1', [userId]);
  }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/tradeRepo.test.ts src/repo.test.ts`
Expected: `Test Files  2 passed (2)`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/repo.ts server/src/trade/tradeRepo.test.ts
git commit -F - <<'MSG'
feat(trade): trades log table, play_minutes and trade_enabled columns

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 4: Trade ledger — `executeTrade` in one transaction, `tradesFor`

**Files:**
- Create: `server/src/trade/ledger.ts`
- Modify: `server/src/repo.ts` (imports lines 2-24; `// ---- trading` section from Task 3)
- Modify: `server/src/trade/tradeRepo.test.ts` (append a `describe('executeTrade', ...)` and `describe('tradesFor', ...)`)

**Interfaces:**
- Consumes: `Db.transaction` (Task 1), `parseOffer`, `Offer`, `TradeFailCode`, `TradeLogOffer` (Task 2), `trades` table (Task 3).
- Produces:
  - `class TradeAbort extends Error { readonly code: TradeFailCode }`
  - `moveCoins(tx: Db, from: string, to: string, amount: number): Promise<void>` — throws `TradeAbort('insufficient_coins')`
  - `moveStack(tx: Db, from: string, to: string, def: string, qty: number): Promise<void>` — throws `TradeAbort('insufficient_items')`
  - `transferInstance(tx: Db, itemId: string, from: string, to: string): Promise<{ def: string; serial: number | null }>` — throws `TradeAbort('not_owned')`
  - `Repo.executeTrade(a: string, b: string, offerA: Offer, offerB: Offer, roomId: string | null): Promise<{ ok: true; id: number } | { ok: false; code: TradeFailCode }>` (`offerA` is what `a` gives to `b`)
  - `interface TradeLogRow { id: number; a_id: string; a_handle: string; b_id: string; b_handle: string; a_offer: TradeLogOffer; b_offer: TradeLogOffer; room_id: string | null; at: Date | string }`
  - `Repo.tradesFor(userId: string, limit?: number): Promise<TradeLogRow[]>` — newest first, default 50

- [ ] **Step 1: Write the failing tests** — append to `server/src/trade/tradeRepo.test.ts`

Add `import type { Offer } from '@dovey/shared';` to the imports at the top, then append:

```ts
async function rich(tag: string, coins: number) {
  const u = await repo.createUser(tag.padEnd(32, 'x'), DEFAULT_AVATAR);
  await db.query('update users set coins = $2 where id = $1', [u.id, coins]);
  return u.id;
}

async function instance(owner: string, def: string) {
  const r = await repo.buyInstance(owner, def);
  if (!r.ok) throw new Error(`buy ${def} failed: ${r.reason}`);
  return r.item;
}

const snapshot = async (id: string) => {
  const inv = await repo.inventory(id);
  return { coins: inv.coins, items: inv.items, instances: inv.instances.map((i) => i.id).sort() };
};

describe('executeTrade', () => {
  it('moves coins, a stack, an LTD rare and a plain instance, keeping the serial, and logs it', async () => {
    const a = await rich('tradeHappyA', 200_000);
    const b = await rich('tradeHappyB', 1000);
    await repo.addItem(a, 'chair', 3);
    const throne = await instance(a, 'throne_gold');
    const dice = await instance(a, 'dicemaster');
    const coinsA = await repo.coins(a);
    const offerA: Offer = { slots: [{ def: 'chair', qty: 2 }, { itemId: throne.id }, { itemId: dice.id }], coins: 500 };
    const offerB: Offer = { slots: [], coins: 200 };

    const r = await repo.executeTrade(a, b, offerA, offerB, 'room1');
    expect(r.ok).toBe(true);

    const invA = await repo.inventory(a);
    const invB = await repo.inventory(b);
    expect(invA.coins).toBe(coinsA - 500 + 200);
    expect(invB.coins).toBe(1000 + 500 - 200);
    expect(invA.items.chair).toBe(1);
    expect(invB.items.chair).toBe(2);
    expect(invA.instances.map((i) => i.id)).not.toContain(throne.id);
    const moved = invB.instances.find((i) => i.id === throne.id);
    expect(moved).toMatchObject({ def: 'throne_gold', serial: throne.serial, placed: null });
    expect(throne.serial).toBeGreaterThan(0);
    expect(invB.instances.find((i) => i.id === dice.id)?.serial).toBeNull();

    const log = await repo.tradesFor(b);
    expect(log[0]).toMatchObject({ a_id: a, b_id: b, room_id: 'room1' });
    expect(log[0].a_offer).toEqual({
      coins: 500,
      slots: [
        { def: 'chair', qty: 2 },
        { itemId: throne.id, def: 'throne_gold', serial: throne.serial },
        { itemId: dice.id, def: 'dicemaster', serial: null },
      ],
    });
    expect(log[0].b_offer).toEqual({ coins: 200, slots: [] });
  });

  it('insufficient coins on the second side rolls back the first side', async () => {
    const a = await rich('tradeCoinsA', 5000);
    const b = await rich('tradeCoinsB', 50);
    await repo.addItem(a, 'chair', 1);
    const before = [await snapshot(a), await snapshot(b)];
    const r = await repo.executeTrade(a, b, { slots: [{ def: 'chair', qty: 1 }], coins: 1000 }, { slots: [], coins: 51 }, null);
    expect(r).toEqual({ ok: false, code: 'insufficient_coins' });
    expect([await snapshot(a), await snapshot(b)]).toEqual(before);
    expect(await repo.tradesFor(a)).toEqual([]);
  });

  it('a placed instance fails the trade and nothing moves', async () => {
    const a = await rich('tradePlacedA', 200_000);
    const b = await rich('tradePlacedB', 5000);
    const throne = await instance(a, 'throne_gold');
    expect(await repo.claimPlacement(throne.id, a, 'throne_gold', 'roomX')).not.toBeNull();
    const before = [await snapshot(a), await snapshot(b)];
    const r = await repo.executeTrade(a, b, { slots: [{ itemId: throne.id }], coins: 0 }, { slots: [], coins: 4000 }, null);
    expect(r).toEqual({ ok: false, code: 'not_owned' });
    expect([await snapshot(a), await snapshot(b)]).toEqual(before);
    expect((await repo.instances(a)).find((i) => i.id === throne.id)?.placed).toBe('roomX');
  });

  it('an instance owned by someone else fails with not_owned', async () => {
    const a = await rich('tradeStealA', 1000);
    const b = await rich('tradeStealB', 200_000);
    const theirs = await instance(b, 'throne_gold');
    expect(await repo.executeTrade(a, b, { slots: [{ itemId: theirs.id }], coins: 0 }, { slots: [], coins: 0 }, null)).toEqual({ ok: false, code: 'not_owned' });
    expect((await repo.instances(b)).map((i) => i.id)).toContain(theirs.id);
  });

  it('a stack shortfall rolls back coins already moved', async () => {
    const a = await rich('tradeStackA', 5000);
    const b = await rich('tradeStackB', 5000);
    await repo.addItem(b, 'lamp', 1);
    const before = [await snapshot(a), await snapshot(b)];
    const r = await repo.executeTrade(a, b, { slots: [], coins: 700 }, { slots: [{ def: 'lamp', qty: 2 }], coins: 0 }, null);
    expect(r).toEqual({ ok: false, code: 'insufficient_items' });
    expect([await snapshot(a), await snapshot(b)]).toEqual(before);
  });

  it('refuses a bad offer shape and a self trade without touching the database', async () => {
    const a = await rich('tradeShapeA', 5000);
    expect(await repo.executeTrade(a, a, { slots: [], coins: 1 }, { slots: [], coins: 0 }, null)).toEqual({ ok: false, code: 'bad_offer' });
    const b = await rich('tradeShapeB', 5000);
    expect(await repo.executeTrade(a, b, { slots: [{ def: 'dicemaster', qty: 1 }], coins: 0 }, { slots: [], coins: 0 }, null)).toEqual({ ok: false, code: 'bad_offer' });
  });
});

describe('tradesFor', () => {
  it('returns the newest 50 trades on either side with handles', async () => {
    const a = await rich('tradeLogA', 0);
    const b = await rich('tradeLogB', 0);
    await db.query(
      `insert into trades (a_id, b_id, a_offer, b_offer, room_id, at)
       select $1, $2, jsonb_build_object('coins', g, 'slots', '[]'::jsonb), '{"coins":0,"slots":[]}'::jsonb, 'r', now() - make_interval(secs => 100 - g)
       from generate_series(1, 55) g`,
      [a, b],
    );
    const rows = await repo.tradesFor(b);
    expect(rows).toHaveLength(50);
    expect(rows[0].a_offer.coins).toBe(55);
    expect(rows[49].a_offer.coins).toBe(6);
    const handleA = (await repo.userById(a))!.handle;
    expect(rows[0].a_handle).toBe(handleA);
    expect(await repo.tradesFor(a, 3)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/tradeRepo.test.ts`
Expected: FAIL — `repo.executeTrade is not a function`.

- [ ] **Step 3: Implement the ledger** — `server/src/trade/ledger.ts`

```ts
import type { TradeFailCode } from '@dovey/shared';
import type { Db } from '../db';

/**
 * Guarded writes for one side of a trade. Each must run on a transaction's
 * `tx`; a guard that matches zero rows throws TradeAbort, which rolls the whole
 * trade back.
 */
export class TradeAbort extends Error {
  constructor(readonly code: TradeFailCode) {
    super(code);
    this.name = 'TradeAbort';
  }
}

export async function moveCoins(tx: Db, from: string, to: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const r = await tx.query('update users set coins = coins - $2::int where id = $1 and coins >= $2::int returning coins', [from, amount]);
  if (!r.length) throw new TradeAbort('insufficient_coins');
  await tx.query('update users set coins = coins + $2::int where id = $1', [to, amount]);
}

export async function moveStack(tx: Db, from: string, to: string, def: string, qty: number): Promise<void> {
  const r = await tx.query('update inventory set qty = qty - $3::int where user_id = $1 and def = $2 and qty >= $3::int returning qty', [from, def, qty]);
  if (!r.length) throw new TradeAbort('insufficient_items');
  await tx.query(
    `insert into inventory (user_id, def, qty) values ($1, $2, $3)
     on conflict (user_id, def) do update set qty = inventory.qty + excluded.qty`,
    [to, def, qty],
  );
}

/** Zero rows = placed in a room, already traded away, or never owned. */
export async function transferInstance(tx: Db, itemId: string, from: string, to: string): Promise<{ def: string; serial: number | null }> {
  const r = await tx.query<{ def: string; serial: number | null }>(
    'update items set owner_id = $3 where id = $1 and owner_id = $2 and placed_room is null returning def, serial',
    [itemId, from, to],
  );
  if (!r.length) throw new TradeAbort('not_owned');
  return r[0];
}
```

- [ ] **Step 4: Implement `executeTrade` and `tradesFor`** — `server/src/repo.ts`

Add to the `@dovey/shared` import list (lines 2-23), after `isInstanceDef,`:

```ts
  parseOffer,
  type Offer,
  type TradeFailCode,
  type TradeLogOffer,
```

Add after line 24 (`import { Db } from './db';`):

```ts
import { TradeAbort, moveCoins, moveStack, transferInstance } from './trade/ledger';
```

Add after the `RoomSummary` interface (after line 80):

```ts
export interface TradeLogRow {
  id: number;
  a_id: string;
  a_handle: string;
  b_id: string;
  b_handle: string;
  a_offer: TradeLogOffer;
  b_offer: TradeLogOffer;
  room_id: string | null;
  at: Date | string;
}
```

Append to the `// ---- trading` section (after `addPlayMinute`):

```ts
  /**
   * Swap two offers atomically: coins, then stacks, then instances, then the log
   * row, all inside one transaction. Every write is guarded again here, so an
   * offer that went stale (item placed, coins spent) fails the whole trade.
   * `offerA` is what `a` gives to `b`.
   */
  async executeTrade(
    a: string,
    b: string,
    offerA: Offer,
    offerB: Offer,
    roomId: string | null,
  ): Promise<{ ok: true; id: number } | { ok: false; code: TradeFailCode }> {
    const pa = parseOffer(offerA);
    const pb = parseOffer(offerB);
    if (a === b || !pa || !pb) return { ok: false, code: 'bad_offer' };
    const sides = [
      { from: a, to: b, offer: pa, log: { coins: pa.coins, slots: [] } as TradeLogOffer },
      { from: b, to: a, offer: pb, log: { coins: pb.coins, slots: [] } as TradeLogOffer },
    ];
    try {
      const id = await this.db.transaction(async (tx) => {
        for (const s of sides) await moveCoins(tx, s.from, s.to, s.offer.coins);
        for (const s of sides)
          for (const slot of s.offer.slots) {
            if ('itemId' in slot) continue;
            await moveStack(tx, s.from, s.to, slot.def, slot.qty);
            s.log.slots.push({ def: slot.def, qty: slot.qty });
          }
        for (const s of sides)
          for (const slot of s.offer.slots) {
            if (!('itemId' in slot)) continue;
            const item = await transferInstance(tx, slot.itemId, s.from, s.to);
            s.log.slots.push({ itemId: slot.itemId, def: item.def, serial: item.serial });
          }
        const r = await tx.query<{ id: number }>('insert into trades (a_id, b_id, a_offer, b_offer, room_id) values ($1, $2, $3, $4, $5) returning id', [
          a,
          b,
          JSON.stringify(sides[0].log),
          JSON.stringify(sides[1].log),
          roomId,
        ]);
        return r[0].id;
      });
      return { ok: true, id };
    } catch (e) {
      if (e instanceof TradeAbort) return { ok: false, code: e.code };
      console.error('[trade] execute failed', e);
      return { ok: false, code: 'trade_failed' };
    }
  }

  /** A user's trades on either side, newest first (mod view). */
  async tradesFor(userId: string, limit = 50): Promise<TradeLogRow[]> {
    return this.db.query<TradeLogRow>(
      `select t.id, t.a_id, ua.handle as a_handle, t.b_id, ub.handle as b_handle, t.a_offer, t.b_offer, t.room_id, t.at
       from trades t
       join users ua on ua.id = t.a_id
       join users ub on ub.id = t.b_id
       where t.a_id = $1 or t.b_id = $1
       order by t.at desc, t.id desc
       limit $2`,
      [userId, limit],
    );
  }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/tradeRepo.test.ts`
Expected: `Tests  10 passed (10)`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/trade/ledger.ts server/src/repo.ts server/src/trade/tradeRepo.test.ts
git commit -F - <<'MSG'
feat(trade): atomic executeTrade with guarded transfers and trade log

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 5: Gates helper and offer ownership check

**Files:**
- Create: `server/src/trade/gates.ts`, `server/src/trade/gates.test.ts`
- Create: `server/src/trade/offers.ts`, `server/src/trade/offers.test.ts`

**Interfaces:**
- Consumes: `TRADE_MIN_AGE_MS`, `TRADE_MIN_PLAY_MINUTES`, `Offer`, `ResolvedOffer`, `furnitureDef` from `@dovey/shared`; `Inventory` from `server/src/repo.ts` (lines 66-70).
- Produces:
  - `tradeGatesOn(env?: Record<string, string | undefined>): boolean` — default `process.env`
  - `isTooNew(standing: { createdAt: Date; playMinutes: number }, now?: number): boolean` — default `Date.now()`
  - `type OfferCheck = { ok: true; resolved: ResolvedOffer } | { ok: false; code: 'insufficient_coins' | 'insufficient_items' | 'not_owned' }`
  - `checkOffer(inv: Inventory, offer: Offer): OfferCheck`

- [ ] **Step 1: Write the failing tests**

`server/src/trade/gates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isTooNew, tradeGatesOn } from './gates';

const DAY = 24 * 60 * 60 * 1000;

describe('trade gates', () => {
  it('are on only in production without TRADE_GATES=off', () => {
    expect(tradeGatesOn({ NODE_ENV: 'production' })).toBe(true);
    expect(tradeGatesOn({ NODE_ENV: 'production', TRADE_GATES: 'off' })).toBe(false);
    expect(tradeGatesOn({ NODE_ENV: 'development' })).toBe(false);
    expect(tradeGatesOn({ NODE_ENV: 'test' })).toBe(false);
    expect(tradeGatesOn({})).toBe(false);
  });

  it('too new under 24 h of age or under 30 play minutes', () => {
    const now = 10 * DAY;
    expect(isTooNew({ createdAt: new Date(now - DAY), playMinutes: 30 }, now)).toBe(false);
    expect(isTooNew({ createdAt: new Date(now - DAY + 1), playMinutes: 500 }, now)).toBe(true);
    expect(isTooNew({ createdAt: new Date(now - 5 * DAY), playMinutes: 29 }, now)).toBe(true);
  });
});
```

`server/src/trade/offers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Inventory } from '../repo';
import { checkOffer } from './offers';

const inv: Inventory = {
  coins: 1000,
  items: { chair: 3 },
  instances: [
    { id: 'throne1', def: 'throne_gold', serial: 7, placed: null },
    { id: 'dice1', def: 'dicemaster', serial: null, placed: null },
    { id: 'wheel1', def: 'wheel_fortune', serial: 2, placed: 'room1' },
  ],
};

describe('checkOffer', () => {
  it('resolves names and serials in slot order', () => {
    expect(checkOffer(inv, { slots: [{ itemId: 'throne1' }, { def: 'chair', qty: 3 }, { itemId: 'dice1' }], coins: 1000 })).toEqual({
      ok: true,
      resolved: {
        coins: 1000,
        slots: [
          { def: 'throne_gold', qty: 1, itemId: 'throne1', name: 'Golden Throne', serial: 7 },
          { def: 'chair', qty: 3, itemId: null, name: 'chair', serial: null },
          { def: 'dicemaster', qty: 1, itemId: 'dice1', name: 'Dicemaster', serial: null },
        ],
      },
    });
  });

  it('refuses more coins than the balance', () => {
    expect(checkOffer(inv, { slots: [], coins: 1001 })).toEqual({ ok: false, code: 'insufficient_coins' });
  });

  it('refuses more of a stack than held', () => {
    expect(checkOffer(inv, { slots: [{ def: 'chair', qty: 4 }], coins: 0 })).toEqual({ ok: false, code: 'insufficient_items' });
    expect(checkOffer(inv, { slots: [{ def: 'lamp', qty: 1 }], coins: 0 })).toEqual({ ok: false, code: 'insufficient_items' });
  });

  it('refuses placed or unknown instances', () => {
    expect(checkOffer(inv, { slots: [{ itemId: 'wheel1' }], coins: 0 })).toEqual({ ok: false, code: 'not_owned' });
    expect(checkOffer(inv, { slots: [{ itemId: 'someoneElse' }], coins: 0 })).toEqual({ ok: false, code: 'not_owned' });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/gates.test.ts src/trade/offers.test.ts`
Expected: FAIL — cannot resolve `./gates` and `./offers`.

- [ ] **Step 3: Implement** — `server/src/trade/gates.ts`

```ts
import { TRADE_MIN_AGE_MS, TRADE_MIN_PLAY_MINUTES } from '@dovey/shared';

/** Account-age and play-time gates guard production only; locally anyone can try trading at once. */
export function tradeGatesOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'production' && env.TRADE_GATES !== 'off';
}

export function isTooNew(standing: { createdAt: Date; playMinutes: number }, now = Date.now()): boolean {
  return now - standing.createdAt.getTime() < TRADE_MIN_AGE_MS || standing.playMinutes < TRADE_MIN_PLAY_MINUTES;
}
```

`server/src/trade/offers.ts`:

```ts
import { furnitureDef, type Offer, type ResolvedOffer, type ResolvedSlot } from '@dovey/shared';
import type { Inventory } from '../repo';

export type OfferCheck = { ok: true; resolved: ResolvedOffer } | { ok: false; code: 'insufficient_coins' | 'insufficient_items' | 'not_owned' };

/**
 * Does this player hold what they offer right now? Resolves display names and
 * serials for `t_state`. executeTrade re-checks everything inside the transaction.
 */
export function checkOffer(inv: Inventory, offer: Offer): OfferCheck {
  if (offer.coins > inv.coins) return { ok: false, code: 'insufficient_coins' };
  const slots: ResolvedSlot[] = [];
  for (const s of offer.slots) {
    if ('itemId' in s) {
      const it = inv.instances.find((i) => i.id === s.itemId);
      if (!it || it.placed) return { ok: false, code: 'not_owned' };
      slots.push({ def: it.def, qty: 1, itemId: it.id, name: furnitureDef(it.def)?.name ?? it.def, serial: it.serial });
    } else {
      if ((inv.items[s.def] ?? 0) < s.qty) return { ok: false, code: 'insufficient_items' };
      slots.push({ def: s.def, qty: s.qty, itemId: null, name: furnitureDef(s.def)?.name ?? s.def, serial: null });
    }
  }
  return { ok: true, resolved: { slots, coins: offer.coins } };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/gates.test.ts src/trade/offers.test.ts`
Expected: `Test Files  2 passed (2)`, `Tests  6 passed (6)`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/trade/gates.ts server/src/trade/gates.test.ts server/src/trade/offers.ts server/src/trade/offers.test.ts
git commit -F - <<'MSG'
feat(trade): production trade gates and offer ownership check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

Continue with Part 2: `docs/superpowers/plans/2026-09-14-trade-stage2-part2.md`.
