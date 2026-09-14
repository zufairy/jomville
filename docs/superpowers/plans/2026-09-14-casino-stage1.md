# Casino Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expensive rare/LTD casino furni with per-item serials, usable chance furni (Dicemaster 1-6, Holodice 1-100, Wheel of Fortune 1-8) rolled server-side, a roll log, and a Casino system room.

**Architecture:** Commons keep the `inventory(user_id, def, qty)` counter; any def with `ltd` or `interaction` is an *instance* item stored one row per item in a new `items` table with a serial. Placed furniture carries `itemId`/`serial`/`state` in the Colyseus `Furniture` schema and in the saved layout JSON. `furn_use` dispatches to a pure `shared/src/interactions.ts` registry; the server sets `state='-1'`, then after `rollMs` writes the random result, logs it to `rolls`, and speaks it as a chat bubble over the roller.

**Tech Stack:** pnpm workspace, TypeScript, Colyseus 0.16 + @colyseus/schema v3, PGlite (raw SQL), Express 5, React 18 + zustand, PixiJS v8, vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-casino-trade-design.md` (Stage 1 = Section 1 + Section 2). Stage 2 (trading) and Stage 3 (dragon) get their own plans.

## Global Constraints

- Node ≥ 22; run all commands from repo root `/Users/along/Documents/GitHub/jomville`.
- Tests: `pnpm --filter @dovey/shared test`, `pnpm --filter @dovey/server test`, `pnpm --filter @dovey/client test`; types: `pnpm typecheck`.
- Prices / stock (verbatim from spec): Dicemaster 8,000 unlimited; Holodice 15,000 unlimited; Wheel of Fortune 25,000 LTD 100; Dragon Egg 75,000 LTD 50; Golden Throne 50,000 LTD 100; casino décor 300-2,000 unlimited.
- Reach: dice6/dice100 = adjacent incl. diagonals (Chebyshev 1 from any footprint tile); wheel = Manhattan `distanceTo` ≤ 2.
- Roll timing: dice6 1500 ms, dice100 2000 ms, wheel 3000 ms. Rolling state string is `'-1'`; closed state `'0'`.
- RNG on server: `crypto.randomInt`. Never trust client values.
- `furn_use` rate limit for chance furni: 1 per 700 ms per player.
- Rolls older than 7 days pruned at boot and daily.
- Error codes go out as `sys {code}`; new code `sold_out`.
- Legal guardrail: coins/items never purchasable or cashable for real money while chance furni live; write this in `DEPLOY.md`.
- Report reason `scam` already exists in `shared/src/safety.ts` — no change needed.
- Commit message trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011MULCxwWMKg7eNuxHrNTL1
  ```

## File Map

| File | Change | Responsibility |
| --- | --- | --- |
| `shared/src/furniture.ts` | modify | new kinds, `casino` cat, `ltd`/`interaction` fields, casino defs, `Placement.state/itemId/serial`, `isInstanceDef` |
| `shared/src/interactions.ts` (+ test) | create | chance furni registry, `inReach`, `ROLLING`, `CLOSED` |
| `shared/src/casino.ts` (+ test) | create | `CASINO` room meta + `casinoLayout()` |
| `shared/src/systemRooms.ts`, `shared/src/index.ts` | modify | register Casino, exports |
| `server/src/db.ts` | modify | `items`, `ltd_stock`, `rolls` tables |
| `server/src/repo.ts` | modify | instance/LTD/roll methods; `inventory()` returns instances |
| `server/src/casino.test.ts` | create | repo instance/LTD/roll tests |
| `server/src/chance.ts` (+ test) | create | begin/finish/close roll state machine |
| `server/src/schema.ts` | modify | `Furniture.state/itemId/serial` |
| `server/src/GameRoom.ts` | modify | layout fields, instance place/remove, chance `furn_use`, `furn_close` |
| `server/src/api.ts`, `server/src/index.ts`, `DEPLOY.md` | modify | stock endpoint, instance buy, boot seeding + prune, guardrail |
| `client/src/game/casinoArt.ts` (+ test) | create | painters + `artStateKey` |
| `client/src/game/furnitureArt.ts`, `atlas.ts`, `furniture.ts` | modify | pass `state` through painting and atlas cache |
| `client/src/net.ts`, `client/src/game/Game.ts`, `client/src/App.tsx` | modify | sync fields, reach-aware use, close gesture, place instances |
| `client/src/api.ts`, `client/src/store.ts`, `client/src/ui/ShopSheet.tsx`, `client/src/ui/BuildBar.tsx` | modify | instances, LTD stock, place by itemId |
| `client/scripts/smoke-casino.mjs` | create | 2-client roll smoke |

---

### Task 1: Catalog fields, casino defs, interaction registry (shared)

**Files:**
- Modify: `shared/src/furniture.ts` (kinds union ends `| 'wall_den';` ~line 147; `FURNITURE_CATS` ~149; `FurnitureDef` ~154-165; `Opts` ~167-173; `def()` ~175-201; end of `FURNITURE` array; `Placement` ~396-404)
- Create: `shared/src/interactions.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/interactions.test.ts`

**Interfaces:**
- Produces:
  - `FurnitureDef.ltd?: number`, `FurnitureDef.interaction?: InteractionKind`
  - `Placement.state?: string`, `Placement.itemId?: string`, `Placement.serial?: number`
  - `isInstanceDef(d: FurnitureDef): boolean`
  - `type InteractionKind = 'dice6' | 'dice100' | 'wheel'`; `ROLLING = '-1'`; `CLOSED = '0'`
  - `INTERACTIONS: Record<InteractionKind, { reach: 'adjacent' | 'near'; rollMs: number; roll(rand: (n: number) => number): string }>`
  - `inReach(kind: InteractionKind, x: number, y: number, p: Placement): boolean`
  - Def ids: `dicemaster`, `holodice`, `wheel_fortune`, `dragon_egg`, `throne_gold`, `felt_table`, `chip_stack`, `casino_carpet`, `neon_casino`, `slot_prop`, `velvet_rope_gold`

- [ ] **Step 1: Write the failing test** — `shared/src/interactions.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { CLOSED, INTERACTIONS, ROLLING, inReach } from './interactions';
import { FURNITURE, Placement, furnitureDef, isInstanceDef } from './furniture';

const P = (def: string, x: number, y: number): Placement => ({ id: 'p1', def, x, y, rot: 0 });

describe('chance furni catalog', () => {
  it('prices and stock match the spec', () => {
    expect(furnitureDef('dicemaster')).toMatchObject({ price: 8000, interaction: 'dice6', cat: 'casino' });
    expect(furnitureDef('holodice')).toMatchObject({ price: 15000, interaction: 'dice100' });
    expect(furnitureDef('wheel_fortune')).toMatchObject({ price: 25000, interaction: 'wheel', ltd: 100 });
    expect(furnitureDef('dragon_egg')).toMatchObject({ price: 75000, ltd: 50 });
    expect(furnitureDef('throne_gold')).toMatchObject({ price: 50000, ltd: 100, sit: true });
    for (const id of ['felt_table', 'chip_stack', 'casino_carpet', 'neon_casino', 'slot_prop', 'velvet_rope_gold']) {
      const d = furnitureDef(id)!;
      expect(d, id).toBeDefined();
      expect(d.price).toBeGreaterThanOrEqual(300);
      expect(d.price).toBeLessThanOrEqual(2000);
    }
  });
  it('instance defs are exactly the ltd or interactive ones', () => {
    expect(isInstanceDef(furnitureDef('dicemaster')!)).toBe(true);
    expect(isInstanceDef(furnitureDef('dragon_egg')!)).toBe(true);
    expect(isInstanceDef(furnitureDef('chair')!)).toBe(false);
    expect(FURNITURE.filter(isInstanceDef).map((d) => d.id).sort()).toEqual(['dicemaster', 'dragon_egg', 'holodice', 'throne_gold', 'wheel_fortune']);
  });
});

describe('interactions', () => {
  it('roll results stay in range at both RNG extremes', () => {
    const lo = () => 0;
    const hi = (n: number) => n - 1;
    expect([INTERACTIONS.dice6.roll(lo), INTERACTIONS.dice6.roll(hi)]).toEqual(['1', '6']);
    expect([INTERACTIONS.dice100.roll(lo), INTERACTIONS.dice100.roll(hi)]).toEqual(['1', '100']);
    expect([INTERACTIONS.wheel.roll(lo), INTERACTIONS.wheel.roll(hi)]).toEqual(['1', '8']);
    expect(ROLLING).toBe('-1');
    expect(CLOSED).toBe('0');
  });
  it('timings match the spec', () => {
    expect(INTERACTIONS.dice6.rollMs).toBe(1500);
    expect(INTERACTIONS.dice100.rollMs).toBe(2000);
    expect(INTERACTIONS.wheel.rollMs).toBe(3000);
  });
  it('dice need an adjacent tile, diagonals count', () => {
    const die = P('dicemaster', 5, 5);
    expect(inReach('dice6', 4, 4, die)).toBe(true);
    expect(inReach('dice6', 6, 5, die)).toBe(true);
    expect(inReach('dice6', 7, 5, die)).toBe(false);
    expect(inReach('dice6', 5, 5, die)).toBe(false);
  });
  it('wheel reach measures from every footprint tile', () => {
    const wheel = P('wheel_fortune', 5, 5); // 2x1: (5,5) (6,5)
    expect(inReach('wheel', 8, 5, wheel)).toBe(true);
    expect(inReach('wheel', 9, 5, wheel)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared test -- interactions`
Expected: FAIL — `Cannot find module './interactions'`.

- [ ] **Step 3: Catalog changes in `shared/src/furniture.ts`**

Top of file, add: `import type { InteractionKind } from './interactions';`

Replace the final `| 'wall_den';` of `FurnitureKind` with:

```ts
  | 'wall_den'
  // casino
  | 'dicemaster'
  | 'holodice'
  | 'wheel_fortune'
  | 'dragon_egg'
  | 'throne'
  | 'felt_table'
  | 'chip_stack'
  | 'casino_carpet'
  | 'neon_casino'
  | 'slot_prop'
  | 'velvet_rope_gold';
```

```ts
export const FURNITURE_CATS = ['seating', 'tables', 'lights', 'fun', 'outdoor', 'decor', 'floor', 'casino'] as const;
```

`FurnitureDef`, after `rarity: Rarity;`:

```ts
  /** limited edition: only this many serials are ever sold */
  ltd?: number;
  /** chance furni behaviour on use (dice, wheel) */
  interaction?: InteractionKind;
```

`Opts`, add:

```ts
  ltd?: number;
  interaction?: InteractionKind;
```

`def()` return object, after `rarity: o.rarity ?? 'common',`:

```ts
  ...(o.ltd ? { ltd: o.ltd } : {}),
  ...(o.interaction ? { interaction: o.interaction } : {}),
```

End of `FURNITURE` array, before `];`:

```ts
  // ---- casino (spec 2026-09-14): expensive rares, chance furni tracked per item
  def('dicemaster', 'Dicemaster', 'dicemaster', 'casino', 1, 1, 26, [1, 0], 8000, { use: true, anim: 8, rarity: 'epic', interaction: 'dice6' }),
  def('holodice', 'Holodice', 'holodice', 'casino', 1, 1, 34, [9, 13], 15000, { use: true, anim: 8, rarity: 'epic', interaction: 'dice100' }),
  def('wheel_fortune', 'Wheel of Fortune', 'wheel_fortune', 'casino', 2, 1, 96, [5, 24], 25000, { use: true, anim: 12, rarity: 'epic', interaction: 'wheel', ltd: 100 }),
  def('dragon_egg', 'Dragon Egg', 'dragon_egg', 'casino', 1, 1, 30, [14, 24], 75000, { anim: 8, rarity: 'epic', ltd: 50 }),
  def('throne_gold', 'Golden Throne', 'throne', 'casino', 1, 1, 58, [24, 5], 50000, { sit: true, anim: 8, rarity: 'epic', ltd: 100 }),
  def('felt_table', 'casino felt table', 'felt_table', 'casino', 2, 1, 20, [15, 19], 900),
  def('chip_stack', 'chip stack', 'chip_stack', 'casino', 1, 1, 18, [5, 24], 300),
  def('casino_carpet', 'casino carpet', 'casino_carpet', 'casino', 1, 1, 0, [5, 24], 300, { walkable: true }),
  def('neon_casino', 'CASINO neon', 'neon_casino', 'casino', 3, 1, 96, [5, 24], 2000, { walkable: true, anim: 8, rarity: 'rare' }),
  def('slot_prop', 'slot machine prop', 'slot_prop', 'casino', 1, 1, 64, [5, 24], 1500, { use: true, anim: 8, rarity: 'rare' }),
  def('velvet_rope_gold', 'gold velvet rope', 'velvet_rope_gold', 'casino', 1, 1, 34, [24, 5], 400),
```

`Placement`, after `on?: boolean;`:

```ts
  /** chance furni face: '0' closed, '-1' rolling, else the result */
  state?: string;
  /** instance item row id (undefined for counted commons and system décor) */
  itemId?: string;
  /** LTD serial shown as #n */
  serial?: number;
```

After `export function furnitureDef`, add:

```ts
/** Items tracked one row per item (serials, per-item state) rather than as an inventory count. */
export function isInstanceDef(d: FurnitureDef): boolean {
  return !!d.ltd || !!d.interaction;
}
```

- [ ] **Step 4: Create `shared/src/interactions.ts`**

```ts
import { Placement, distanceTo, tilesOf } from './furniture';

export type InteractionKind = 'dice6' | 'dice100' | 'wheel';

/** furniture state while the server is rolling */
export const ROLLING = '-1';
/** blank face: fresh, closed or picked up */
export const CLOSED = '0';

export interface Interaction {
  /** adjacent = touching a footprint tile incl. diagonals; near = within 2 tiles (Manhattan) */
  reach: 'adjacent' | 'near';
  rollMs: number;
  /** rand(n) returns an integer in [0, n) */
  roll(rand: (n: number) => number): string;
}

export const INTERACTIONS: Record<InteractionKind, Interaction> = {
  dice6: { reach: 'adjacent', rollMs: 1500, roll: (rand) => String(rand(6) + 1) },
  dice100: { reach: 'adjacent', rollMs: 2000, roll: (rand) => String(rand(100) + 1) },
  wheel: { reach: 'near', rollMs: 3000, roll: (rand) => String(rand(8) + 1) },
};

export function inReach(kind: InteractionKind, x: number, y: number, p: Placement): boolean {
  if (INTERACTIONS[kind].reach === 'near') return distanceTo(x, y, p) <= 2;
  const tiles = tilesOf(p) ?? [];
  if (tiles.some(([tx, ty]) => tx === x && ty === y)) return false;
  return tiles.some(([tx, ty]) => Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1);
}
```

`shared/src/index.ts`, after `export * from './furniture';`: `export * from './interactions';`

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dovey/shared test`
Expected: PASS (all files).

- [ ] **Step 6: Commit**

```bash
git add shared/src/furniture.ts shared/src/interactions.ts shared/src/interactions.test.ts shared/src/index.ts
git commit -m "feat(shared): casino catalog, instance defs and chance furni registry"
```

---

### Task 2: Instance items, LTD stock and roll log (server repo)

**Files:**
- Modify: `server/src/db.ts` (append to `SCHEMA` after `inventory` table)
- Modify: `server/src/repo.ts` (`Inventory` interface ~57; economy section ~273-340)
- Test: `server/src/casino.test.ts`

**Interfaces:**
- Consumes: `FURNITURE`, `furnitureDef`, `isInstanceDef` (Task 1).
- Produces (on `Repo`):
  - `InstanceItem = { id: string; def: string; serial: number | null; placed: string | null }`; `Inventory.instances: InstanceItem[]`
  - `ensureLtdStock(): Promise<void>`
  - `ltdStock(): Promise<Record<string, { sold: number; cap: number }>>`
  - `buyInstance(userId, def): Promise<{ ok: true; coins: number; item: InstanceItem } | { ok: false; reason: 'not_for_sale' | 'not_enough_coins' | 'sold_out' }>`
  - `instances(userId): Promise<InstanceItem[]>`
  - `claimPlacement(itemId, userId, def, roomId): Promise<{ serial: number | null } | null>`
  - `releasePlacement(itemId): Promise<string | null>` (owner id)
  - `recordRoll(roomId, furniId, userId, kind, result: number): Promise<void>`
  - `pruneRolls(days = 7): Promise<void>`
  - `buy()` refuses instance defs with `'not_for_sale'`

- [ ] **Step 1: Write the failing test** — `server/src/casino.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';

let db: Db;
let repo: Repo;
let rich: string;
let poor: string;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.ensureLtdStock();
  rich = (await repo.createUser('casinoRich' + 'r'.repeat(24), DEFAULT_AVATAR)).id;
  poor = (await repo.createUser('casinoPoor' + 'p'.repeat(24), DEFAULT_AVATAR)).id;
  await repo.creditCoins(rich, 1_000_000);
});
afterAll(() => db.close());

describe('casino items', () => {
  it('seeds ltd stock from the catalog', async () => {
    const s = await repo.ltdStock();
    expect(s.dragon_egg).toEqual({ sold: 0, cap: 50 });
    expect(s.wheel_fortune).toEqual({ sold: 0, cap: 100 });
    expect(s.dicemaster).toBeUndefined();
  });

  it('buys an unlimited instance without a serial', async () => {
    const r = await repo.buyInstance(rich, 'dicemaster');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.serial).toBeNull();
    expect(r.coins).toBe(1_000_000 + 1500 - 8000);
    const inv = await repo.inventory(rich);
    expect(inv.instances.map((i) => i.def)).toContain('dicemaster');
    expect(inv.items.dicemaster).toBeUndefined();
  });

  it('assigns increasing serials and refunds when sold out', async () => {
    await db.query("update ltd_stock set cap = 2 where def = 'dragon_egg'");
    const a = await repo.buyInstance(rich, 'dragon_egg');
    const b = await repo.buyInstance(rich, 'dragon_egg');
    const before = await repo.coins(rich);
    const c = await repo.buyInstance(rich, 'dragon_egg');
    expect(a.ok && a.item.serial).toBe(1);
    expect(b.ok && b.item.serial).toBe(2);
    expect(c).toEqual({ ok: false, reason: 'sold_out' });
    expect(await repo.coins(rich)).toBe(before);
  });

  it('concurrent buys never exceed the cap', async () => {
    await db.query("update ltd_stock set cap = 3, sold = 0 where def = 'throne_gold'");
    const results = await Promise.all(Array.from({ length: 6 }, () => repo.buyInstance(rich, 'throne_gold')));
    const serials = results.flatMap((r) => (r.ok ? [r.item.serial] : []));
    expect(serials.sort()).toEqual([1, 2, 3]);
  });

  it('refuses when broke and refuses instance defs through buy()', async () => {
    expect(await repo.buyInstance(poor, 'holodice')).toEqual({ ok: false, reason: 'not_enough_coins' });
    expect(await repo.buy(rich, 'holodice', 1)).toEqual({ ok: false, reason: 'not_for_sale' });
    expect(await repo.buyInstance(rich, 'chair')).toEqual({ ok: false, reason: 'not_for_sale' });
  });

  it('claims and releases placement once', async () => {
    const r = await repo.buyInstance(rich, 'holodice');
    if (!r.ok) throw new Error('buy failed');
    expect(await repo.claimPlacement(r.item.id, poor, 'holodice', 'room1')).toBeNull();
    expect(await repo.claimPlacement(r.item.id, rich, 'dicemaster', 'room1')).toBeNull();
    expect(await repo.claimPlacement(r.item.id, rich, 'holodice', 'room1')).toEqual({ serial: null });
    expect(await repo.claimPlacement(r.item.id, rich, 'holodice', 'room2')).toBeNull();
    expect(await repo.releasePlacement(r.item.id)).toBe(rich);
    expect((await repo.instances(rich)).find((i) => i.id === r.item.id)?.placed).toBeNull();
  });

  it('records and prunes rolls', async () => {
    await repo.recordRoll('room1', 'furni1', rich, 'dice6', 4);
    await db.query("insert into rolls (room_id, furni_id, user_id, kind, result, at) values ('room1', 'f', $1, 'dice6', 2, now() - interval '8 days')", [rich]);
    await repo.pruneRolls();
    const rows = await db.query<{ result: number }>('select result from rolls order by id');
    expect(rows.map((r) => r.result)).toEqual([4]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/server test -- casino`
Expected: FAIL — `repo.ensureLtdStock is not a function`.

- [ ] **Step 3: Tables** — append inside `SCHEMA` in `server/src/db.ts`, after the `inventory` table:

```sql
create table if not exists items (
  id text primary key,
  def text not null,
  owner_id text not null references users(id),
  serial int,
  state jsonb not null default '{}',
  placed_room text,
  created_at timestamptz not null default now()
);
create index if not exists items_owner on items(owner_id);
create unique index if not exists items_def_serial on items(def, serial) where serial is not null;
create table if not exists ltd_stock (
  def text primary key,
  sold int not null default 0,
  cap int not null
);
create table if not exists rolls (
  id serial primary key,
  room_id text not null,
  furni_id text not null,
  user_id text not null,
  kind text not null,
  result int not null,
  at timestamptz not null default now()
);
create index if not exists rolls_room_at on rolls(room_id, at);
```

- [ ] **Step 4: Repo methods** — `server/src/repo.ts`

Add `FURNITURE` and `isInstanceDef` to the `@dovey/shared` import (`randomBytes` is already imported from `node:crypto`).

Replace `Inventory`:

```ts
export interface InstanceItem {
  id: string;
  def: string;
  serial: number | null;
  /** room slug while standing in a room, else null */
  placed: string | null;
}

export interface Inventory {
  coins: number;
  items: Record<string, number>;
  instances: InstanceItem[];
}
```

`inventory()` return becomes:

```ts
    return { coins: coins[0]?.coins ?? 0, items, instances: await this.instances(userId) };
```

`buy()` first guard becomes:

```ts
    if (!d || d.price <= 0 || isInstanceDef(d)) return { ok: false, reason: 'not_for_sale' };
```

After `addItem`, add:

```ts
  // ---- instance items (LTD + chance furni)

  /** Keep ltd_stock caps in step with the catalog; sold counts are never reset. */
  async ensureLtdStock() {
    for (const d of FURNITURE) {
      if (!d.ltd) continue;
      await this.db.query('insert into ltd_stock (def, cap) values ($1, $2) on conflict (def) do update set cap = excluded.cap', [d.id, d.ltd]);
    }
  }

  async ltdStock(): Promise<Record<string, { sold: number; cap: number }>> {
    const rows = await this.db.query<{ def: string; sold: number; cap: number }>('select def, sold, cap from ltd_stock');
    const out: Record<string, { sold: number; cap: number }> = {};
    for (const r of rows) out[r.def] = { sold: r.sold, cap: r.cap };
    return out;
  }

  /**
   * Buy one instance item. Coins are debited first (atomic guard), then an LTD
   * serial is taken with a single guarded UPDATE; a sold-out LTD refunds the coins.
   */
  async buyInstance(
    userId: string,
    def: string,
  ): Promise<{ ok: true; coins: number; item: InstanceItem } | { ok: false; reason: 'not_for_sale' | 'not_enough_coins' | 'sold_out' }> {
    const d = furnitureDef(def);
    if (!d || d.price <= 0 || !isInstanceDef(d)) return { ok: false, reason: 'not_for_sale' };
    let coins = await this.spendCoins(userId, d.price);
    if (coins === null) return { ok: false, reason: 'not_enough_coins' };
    let serial: number | null = null;
    if (d.ltd) {
      const r = await this.db.query<{ sold: number }>('update ltd_stock set sold = sold + 1 where def = $1 and sold < cap returning sold', [def]);
      if (!r.length) {
        await this.creditCoins(userId, d.price);
        return { ok: false, reason: 'sold_out' };
      }
      serial = r[0].sold;
    }
    const id = randomBytes(9).toString('base64url');
    await this.db.query('insert into items (id, def, owner_id, serial) values ($1, $2, $3, $4)', [id, def, userId, serial]);
    return { ok: true, coins, item: { id, def, serial, placed: null } };
  }

  async instances(userId: string): Promise<InstanceItem[]> {
    const rows = await this.db.query<{ id: string; def: string; serial: number | null; placed_room: string | null }>(
      'select id, def, serial, placed_room from items where owner_id = $1 order by def, serial nulls last, created_at',
      [userId],
    );
    return rows.map((r) => ({ id: r.id, def: r.def, serial: r.serial, placed: r.placed_room }));
  }

  /** Mark an owned, unplaced instance as standing in a room. Null when not allowed. */
  async claimPlacement(itemId: string, userId: string, def: string, roomId: string): Promise<{ serial: number | null } | null> {
    const r = await this.db.query<{ serial: number | null }>(
      'update items set placed_room = $4 where id = $1 and owner_id = $2 and def = $3 and placed_room is null returning serial',
      [itemId, userId, def, roomId],
    );
    return r.length ? { serial: r[0].serial } : null;
  }

  /** Back to the owner's inventory. Returns the owner id, or null for an unknown item. */
  async releasePlacement(itemId: string): Promise<string | null> {
    const r = await this.db.query<{ owner_id: string }>('update items set placed_room = null where id = $1 returning owner_id', [itemId]);
    return r[0]?.owner_id ?? null;
  }

  async recordRoll(roomId: string, furniId: string, userId: string, kind: string, result: number) {
    await this.db.query('insert into rolls (room_id, furni_id, user_id, kind, result) values ($1, $2, $3, $4, $5)', [roomId, furniId, userId, kind, result]);
  }

  async pruneRolls(days = 7) {
    await this.db.query('delete from rolls where at < now() - make_interval(days => $1::int)', [days]);
  }
```

(`let coins` can be `const coins` if the linter complains.)

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @dovey/server test`
Expected: PASS. If `repo.test.ts` asserts the exact `inventory()` object, add `instances: []` to that expectation.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/repo.ts server/src/casino.test.ts server/src/repo.test.ts
git commit -m "feat(server): instance items with LTD serials and roll log"
```

---

### Task 3: Roll state machine (server, pure)

**Files:**
- Create: `server/src/chance.ts`
- Test: `server/src/chance.test.ts`

**Interfaces:**
- Consumes: `INTERACTIONS`, `InteractionKind`, `ROLLING`, `CLOSED` (Task 1).
- Produces:
  - `beginRoll(f: { state: string }): boolean`
  - `finishRoll(f: { state: string }, kind: InteractionKind, rand: (n: number) => number): number | null`
  - `closeChance(f: { state: string }): boolean`
  - `restoredState(state: string | undefined): string`

- [ ] **Step 1: Write the failing test** — `server/src/chance.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { beginRoll, closeChance, finishRoll, restoredState } from './chance';

describe('chance furni state', () => {
  it('rolls once, ignores clicks while rolling, then shows the result', () => {
    const f = { state: '0' };
    expect(beginRoll(f)).toBe(true);
    expect(f.state).toBe('-1');
    expect(beginRoll(f)).toBe(false);
    expect(closeChance(f)).toBe(false);
    expect(finishRoll(f, 'dice6', () => 3)).toBe(4);
    expect(f.state).toBe('4');
  });
  it('re-rolls from a shown face and closes to blank', () => {
    const f = { state: '6' };
    expect(beginRoll(f)).toBe(true);
    expect(finishRoll(f, 'wheel', () => 7)).toBe(8);
    expect(closeChance(f)).toBe(true);
    expect(f.state).toBe('0');
  });
  it('finish without begin does nothing', () => {
    const f = { state: '2' };
    expect(finishRoll(f, 'dice100', () => 99)).toBeNull();
    expect(f.state).toBe('2');
  });
  it('a room restored mid-roll comes back closed', () => {
    expect(restoredState('-1')).toBe('0');
    expect(restoredState(undefined)).toBe('0');
    expect(restoredState('5')).toBe('5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/server test -- chance`
Expected: FAIL — `Cannot find module './chance'`.

- [ ] **Step 3: Implement `server/src/chance.ts`**

```ts
import { CLOSED, INTERACTIONS, InteractionKind, ROLLING } from '@dovey/shared';

/** Chance furni (dice, wheel) state transitions. The room owns timers and RNG. */
export function beginRoll(f: { state: string }): boolean {
  if (f.state === ROLLING) return false;
  f.state = ROLLING;
  return true;
}

export function finishRoll(f: { state: string }, kind: InteractionKind, rand: (n: number) => number): number | null {
  if (f.state !== ROLLING) return null;
  f.state = INTERACTIONS[kind].roll(rand);
  return Number(f.state);
}

export function closeChance(f: { state: string }): boolean {
  if (f.state === ROLLING) return false;
  f.state = CLOSED;
  return true;
}

export function restoredState(state: string | undefined): string {
  return !state || state === ROLLING ? CLOSED : state;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dovey/server test -- chance`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/chance.ts server/src/chance.test.ts
git commit -m "feat(server): chance furni roll state machine"
```

---

### Task 4: Room wiring — schema, layout fields, instance place/remove, rolling

**Files:**
- Modify: `server/src/schema.ts:14-20`
- Modify: `server/src/GameRoom.ts` — imports (1-50); fields (~65-80); layout load (118-126); `furn_use` (132-144); `furn_place` (458-481); `furn_remove` (498-510); `placements()` (~601-605)

**Interfaces:**
- Consumes: Task 3 functions; Task 2 `claimPlacement/releasePlacement/recordRoll`; Task 1 `inReach`, `isInstanceDef`, `INTERACTIONS`, `CLOSED`.
- Produces (network contract):
  - `Furniture` schema: `state: string`, `itemId: string`, `serial: uint16` (0 = none)
  - `furn_place { id, def, x, y, rot, itemId? }` — `itemId` required for instance defs, else `sys not_owned`
  - `furn_close { id }`
  - server → client `inventory_refresh {}`
  - roll bubble: `chat { id: rollerSessionId, text }` with `🎲 rolled 4`, `🎲 rolled 57 on the holodice`, `🎡 spun 3`; suffix ` · #12` when serial > 0

- [ ] **Step 1: Schema** — `server/src/schema.ts` `Furniture`, after `on`:

```ts
  @type('string') state = ''; // chance furni face: '0' closed, '-1' rolling, else result
  @type('string') itemId = ''; // instance item row; '' for commons and system décor
  @type('uint16') serial = 0; // LTD serial, 0 = none
```

- [ ] **Step 2: Imports, fields, load/save** — `server/src/GameRoom.ts`

Add `CLOSED, INTERACTIONS, inReach, isInstanceDef` to the main `@dovey/shared` import, and:

```ts
import { randomInt } from 'node:crypto';
import { beginRoll, closeChance, finishRoll, restoredState } from './chance';
```

Next to `private useLimit = ...`:

```ts
  private chanceLimit = new RateLimiter(1, 700);
```

Layout load loop (118-126):

```ts
    for (const p of row.layout) {
      const f = new Furniture();
      f.def = p.def;
      f.x = p.x;
      f.y = p.y;
      f.rot = p.rot;
      f.on = p.on ?? true;
      if (furnitureDef(p.def)?.interaction) f.state = restoredState(p.state);
      f.itemId = p.itemId ?? '';
      f.serial = p.serial ?? 0;
      this.state.furniture.set(p.id, f);
    }
```

`placements()`:

```ts
  private placements(): Placement[] {
    const out: Placement[] = [];
    this.state.furniture.forEach((f, id) => {
      const p: Placement = { id, def: f.def, x: f.x, y: f.y, rot: f.rot as 0 | 1 | 2 | 3, on: f.on };
      if (f.state) p.state = f.state;
      if (f.itemId) p.itemId = f.itemId;
      if (f.serial) p.serial = f.serial;
      out.push(p);
    });
    return out;
  }
```

- [ ] **Step 3: `furn_use` and `furn_close`** — replace the `furn_use` handler (132-144):

```ts
    // ---- usable items: lamps toggle; chance furni (dice, wheel) roll server-side
    this.onMessage('furn_use', (client, msg: { id?: unknown }) => {
      const me = this.state.players.get(client.sessionId);
      if (!me) return;
      const id = typeof msg?.id === 'string' ? msg.id : '';
      const f = this.state.furniture.get(id);
      const d = f && furnitureDef(f.def);
      if (!f || !d || !d.use) return;
      const p: Placement = { id, def: f.def, x: f.x, y: f.y, rot: f.rot as 0 | 1 | 2 | 3 };
      const tx = Math.round(me.x);
      const ty = Math.round(me.y);
      const kind = d.interaction;
      if (!kind) {
        if (!this.useLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
        if (distanceTo(tx, ty, p) > 2) return this.reject(client, 'too_far');
        f.on = !f.on;
        this.markDirty();
        return;
      }
      if (!this.chanceLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      if (!inReach(kind, tx, ty, p)) return this.reject(client, 'too_far');
      if (!beginRoll(f)) return; // already rolling: ignore, like Habbo
      const roller = client.sessionId;
      const userId = (client.auth as User).id;
      this.clock.setTimeout(() => {
        if (this.state.furniture.get(id) !== f) return; // picked up mid-roll
        const n = finishRoll(f, kind, (max) => randomInt(max));
        if (n === null) return;
        this.markDirty();
        void GameRoom.repo.recordRoll(this.state.slug, id, userId, kind, n);
        const tag = f.serial ? ` · #${f.serial}` : '';
        const text = kind === 'wheel' ? `🎡 spun ${n}${tag}` : kind === 'dice100' ? `🎲 rolled ${n} on the holodice${tag}` : `🎲 rolled ${n}${tag}`;
        if (this.state.players.has(roller)) this.sayTo(roller, text);
      }, INTERACTIONS[kind].rollMs);
    });

    this.onMessage('furn_close', (client, msg: { id?: unknown }) => {
      const me = this.state.players.get(client.sessionId);
      const id = typeof msg?.id === 'string' ? msg.id : '';
      const f = this.state.furniture.get(id);
      const kind = f && furnitureDef(f.def)?.interaction;
      if (!me || !f || !kind) return;
      if (!this.chanceLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const p: Placement = { id, def: f.def, x: f.x, y: f.y, rot: f.rot as 0 | 1 | 2 | 3 };
      if (!inReach(kind, Math.round(me.x), Math.round(me.y), p)) return this.reject(client, 'too_far');
      if (closeChance(f)) this.markDirty();
    });
```

- [ ] **Step 4: Instance place/remove** — replace `furn_place` (458-481):

```ts
    this.onMessage('furn_place', async (client, msg: Partial<Placement>) => {
      if (!this.canEdit(client)) return;
      if (this.state.furniture.size >= this.furnitureCap) return this.reject(client, 'room_full');
      const p = this.asPlacement(msg);
      if (!p || this.state.furniture.has(p.id)) return this.reject(client, 'bad_request');
      const err = validatePlacement(p, this.size, this.placements(), this.mask);
      if (err) return this.reject(client, err);
      const u = client.auth as User;
      const d = furnitureDef(p.def)!;
      const f = new Furniture();
      if (isInstanceDef(d)) {
        const itemId = typeof msg.itemId === 'string' ? msg.itemId : '';
        const claim = itemId ? await GameRoom.repo.claimPlacement(itemId, u.id, p.def, this.state.slug) : null;
        if (!claim) return this.reject(client, 'not_owned');
        if (this.state.furniture.has(p.id)) {
          await GameRoom.repo.releasePlacement(itemId);
          return this.reject(client, 'bad_request');
        }
        f.itemId = itemId;
        f.serial = claim.serial ?? 0;
        if (d.interaction) f.state = CLOSED;
        client.send('inventory_refresh', {});
      } else {
        // the item leaves the owner's inventory while it stands in the room
        if (!(await GameRoom.repo.addItem(u.id, p.def, -1))) return this.reject(client, 'not_owned');
        if (this.state.furniture.has(p.id)) {
          await GameRoom.repo.addItem(u.id, p.def, 1);
          return this.reject(client, 'bad_request');
        }
        client.send('inventory_delta', { def: p.def, delta: -1 });
      }
      f.def = p.def;
      f.x = p.x;
      f.y = p.y;
      f.rot = p.rot;
      this.state.furniture.set(p.id, f);
      this.rebuildGrid();
      this.markDirty();
    });
```

Replace `furn_remove` (498-510):

```ts
    this.onMessage('furn_remove', (client, msg: { id?: unknown }) => {
      if (!this.canEdit(client)) return;
      const id = typeof msg?.id === 'string' ? msg.id : '';
      const f = this.state.furniture.get(id);
      if (!f) return;
      this.state.furniture.delete(id);
      this.rebuildGrid();
      this.markDirty();
      if (f.itemId) {
        // instances go back to whoever owns the item, not whoever edits the room
        void GameRoom.repo.releasePlacement(f.itemId).then((ownerId) => {
          for (const c of this.clients) if ((c.auth as User | undefined)?.id === ownerId) c.send('inventory_refresh', {});
        });
        return;
      }
      const u = client.auth as User;
      void GameRoom.repo.addItem(u.id, f.def, 1);
      client.send('inventory_delta', { def: f.def, delta: 1 });
    });
```

- [ ] **Step 5: Typecheck and test**

Run: `pnpm --filter @dovey/server typecheck && pnpm --filter @dovey/server test`
Expected: no type errors; all PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/schema.ts server/src/GameRoom.ts
git commit -m "feat(server): place instance furni and roll chance furni in rooms"
```

---

### Task 5: Shop API, boot seeding, guardrail doc

**Files:**
- Modify: `server/src/api.ts` (`/api/shop/buy` ~88-97)
- Modify: `server/src/index.ts` (`main()` after `await repo.ensureSystemRooms();`)
- Modify: `DEPLOY.md`

**Interfaces:**
- Consumes: Task 2 repo methods.
- Produces:
  - `GET /api/shop/stock` → `{ [def]: { sold: number; cap: number } }`
  - `POST /api/shop/buy { token, def, qty }` → `Inventory` (with `instances`) or `400 { error: 'not_for_sale' | 'not_enough_coins' | 'sold_out' | 'bad_qty' }`; instance defs ignore `qty`.

- [ ] **Step 1: Routes** — add `furnitureDef, isInstanceDef` to the `@dovey/shared` import in `server/src/api.ts`, replace `/api/shop/buy`:

```ts
  app.post('/api/shop/buy', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    const def = typeof req.body?.def === 'string' ? req.body.def : '';
    const d = furnitureDef(def);
    if (d && isInstanceDef(d)) {
      const r = await repo.buyInstance(user.id, def);
      if (!r.ok) return res.status(400).json({ error: r.reason });
      return res.json(await repo.inventory(user.id));
    }
    const qty = Number(req.body?.qty ?? 1);
    const r = await repo.buy(user.id, def, qty);
    if (!r.ok) return res.status(400).json({ error: r.reason });
    res.json(await repo.inventory(user.id));
  });

  /** LTD stock for the shop: { def: { sold, cap } } */
  app.get('/api/shop/stock', async (_req, res) => {
    res.set('cache-control', 'no-cache');
    res.json(await repo.ltdStock());
  });
```

- [ ] **Step 2: Boot** — `server/src/index.ts`, after `await repo.ensureSystemRooms();`:

```ts
  await repo.ensureLtdStock();
  await repo.pruneRolls();
  setInterval(() => void repo.pruneRolls(), 24 * 60 * 60 * 1000).unref();
```

- [ ] **Step 3: Guardrail** — append to `DEPLOY.md`:

```markdown
## Casino guardrail

Dicemasters, Holodice and the Wheel of Fortune let players bet coins and items
with each other. Coins and items must never be purchasable with, or cashable
for, real money while chance furni and trading are live (Habbo removed betting
in 2014 after regulator action). If real-money purchases are ever added,
disable chance furni in trade-enabled rooms first.
```

- [ ] **Step 4: Manual check**

Run: `pnpm --filter @dovey/server dev` (background; wait for `listening`), then `curl -s localhost:2567/api/shop/stock`
Expected: JSON with `"dragon_egg":{"sold":0,"cap":50}`, `"wheel_fortune":{"sold":0,"cap":100}`, `"throne_gold":{"sold":0,"cap":100}`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add server/src/api.ts server/src/index.ts DEPLOY.md
git commit -m "feat(server): shop stock endpoint, instance purchases, casino guardrail doc"
```

---

### Task 6: Casino system room layout

**Files:**
- Create: `shared/src/casino.ts`
- Modify: `shared/src/systemRooms.ts`, `shared/src/index.ts`
- Test: `shared/src/casino.test.ts` (existing `systemRooms.test.ts` also covers the new room: no overlaps, unknown defs, cap, min 80 items for size 20, reachability)

**Interfaces:**
- Consumes: `validatePlacement`, `buildGrid`, `inReach`.
- Produces: `CASINO = { slug: 'casino', name: 'Casino', category: 'hangout', theme: 'gameroom', size: 20, featured: true }`; `casinoLayout(): Placement[]`. Booth 1 dice at (4,4), (3,5), (5,5); chair (4,5).

- [ ] **Step 1: Write the failing test** — `shared/src/casino.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { CASINO, casinoLayout } from './casino';
import { buildGrid } from './furniture';
import { InteractionKind, inReach } from './interactions';
import { SYSTEM_ROOMS } from './systemRooms';

const KIND: Record<string, InteractionKind> = { dicemaster: 'dice6', holodice: 'dice100', wheel_fortune: 'wheel' };

describe('casino room', () => {
  const layout = casinoLayout();
  const grid = buildGrid(CASINO.size, layout, null);

  it('is registered as a system room', () => {
    expect(SYSTEM_ROOMS.some((r) => r.slug === 'casino')).toBe(true);
  });

  it('has 15 dicemasters, 2 holodice, 1 wheel, each usable from a walkable tile', () => {
    const count = (def: string) => layout.filter((p) => p.def === def).length;
    expect(count('dicemaster')).toBe(15);
    expect(count('holodice')).toBe(2);
    expect(count('wheel_fortune')).toBe(1);
    for (const p of layout) {
      const kind = KIND[p.def];
      if (!kind) continue;
      let ok = false;
      for (let y = 0; y < CASINO.size && !ok; y++)
        for (let x = 0; x < CASINO.size && !ok; x++) ok = !!grid.walkable[y][x] && inReach(kind, x, y, p);
      expect(ok, `${p.def}@${p.x},${p.y}`).toBe(true);
      expect(p.state).toBe('0');
    }
  });

  it('each dealer chair reaches exactly its three dice', () => {
    const chairs = layout.filter((p) => p.def === 'game_chair');
    expect(chairs).toHaveLength(5);
    for (const c of chairs) {
      const reach = layout.filter((p) => p.def === 'dicemaster' && inReach('dice6', c.x, c.y, p));
      expect(reach.length, `chair@${c.x},${c.y}`).toBe(3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/shared test -- casino`
Expected: FAIL — `Cannot find module './casino'`.

- [ ] **Step 3: Implement `shared/src/casino.ts`**

```ts
import { Placement, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * Casino: Habbo-style dice hall. Five dealer booths (a chair with three
 * Dicemasters in reach), a Wheel of Fortune stage, two Holodice high/low
 * tables, a Golden Throne on show, red-and-gold carpet everywhere.
 * System furni has no itemId: it belongs to the room and is never tradeable.
 */
export const CASINO = {
  slug: 'casino',
  name: 'Casino',
  category: 'hangout',
  theme: 'gameroom' as RoomTheme,
  size: 20,
  featured: true,
} as const;

const S = CASINO.size;
const CHANCE = new Set(['dicemaster', 'holodice', 'wheel_fortune']);

export function casinoLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const next = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement => {
    const p: Placement = { id: `cs${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot };
    if (CHANCE.has(def)) p.state = '0';
    return p;
  };
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`casino layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };
  const tryPut = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    if (!validatePlacement(p, S, out, null)) out.push(p);
  };

  // ---- back wall neon (row 0, x 0-4 stays clear for the door, as in Game Den)
  put('neon_casino', 6, 0);
  put('neon_casino', 12, 0);

  // ---- throne on show in the far corner, gold ropes either side
  put('throne_gold', 18, 1);
  put('velvet_rope_gold', 17, 1);
  put('velvet_rope_gold', 18, 2);

  // ---- five dealer booths: chair in the middle, dice left, right and behind
  const booths: Array<[number, number]> = [
    [3, 4],
    [8, 4],
    [13, 4],
    [3, 10],
    [13, 10],
  ];
  for (const [bx, by] of booths) {
    put('dicemaster', bx + 1, by);
    put('dicemaster', bx, by + 1);
    put('game_chair', bx + 1, by + 1, 2);
    put('dicemaster', bx + 2, by + 1);
  }

  // ---- wheel stage in the middle
  put('wheel_fortune', 9, 10);

  // ---- holodice high/low tables at the front
  put('felt_table', 4, 15);
  put('holodice', 6, 15);
  put('felt_table', 12, 15);
  put('holodice', 14, 15);

  // ---- props along the side walls
  for (const y of [3, 7, 13]) put('slot_prop', 0, y);
  for (const y of [5, 9, 13]) put('chip_stack', 19, y);

  // ---- carpet under everything walkable
  for (let y = 1; y < S; y++) for (let x = 0; x < S; x++) tryPut('casino_carpet', x, y);

  return out;
}
```

- [ ] **Step 4: Register**

`shared/src/systemRooms.ts`: `import { CASINO, casinoLayout } from './casino';` and append to `SYSTEM_ROOMS`:

```ts
  { ...CASINO, mask: () => null, layout: casinoLayout },
```

`shared/src/index.ts`: `export * from './casino';`

- [ ] **Step 5: Run shared tests**

Run: `pnpm --filter @dovey/shared test`
Expected: PASS (`casino.test.ts` and the Casino block of `systemRooms.test.ts`). If reachability fails, the message names a tile; move only the nearest `slot_prop`/`chip_stack`/`velvet_rope_gold` one tile and re-run. Do not move booth, wheel or table coordinates (the smoke script in Task 9 depends on booth 1).

- [ ] **Step 6: Commit**

```bash
git add shared/src/casino.ts shared/src/casino.test.ts shared/src/systemRooms.ts shared/src/index.ts
git commit -m "feat(shared): Casino system room with dealer booths, wheel and holodice"
```

---

### Task 7: Client art for casino furni (state-aware atlas)

**Files:**
- Create: `client/src/game/casinoArt.ts`
- Modify: `client/src/game/furnitureArt.ts` (imports top; `ArtCtx` ~189-204; `paintFurniture` ~1514-1531)
- Modify: `client/src/game/atlas.ts` (`frames`, `preview`)
- Modify: `client/src/game/furniture.ts` (`setPlacement`, `redraw`)
- Test: `client/src/game/casinoArt.test.ts`

**Interfaces:**
- Consumes: `FurnitureDef.interaction`, `Placement.state`, `ROLLING` (Task 1). Helpers from `./parkArt`: `shadow(g, x, y, rx, ry, a?)`, `glow(g, x, y, r, col, a)`, `cylinder(g, x, y, rx, ry, h, top, side, outline?)`; from `./furnitureArt`: `box(g, tx, ty, w, h, z, tall, top, side, outline?)`, `shade(colour, k)`.
- Produces:
  - `ArtCtx.state: string`
  - `paintFurniture(g, def, rot, frame, on, state = '')`
  - `atlas.frames(def, rot, on, state = '')`
  - `artStateKey(def, state): string` — dice6/wheel: state as-is (`'0'` default); dice100: `'-1'`, `'0'`, else `'lo'|'mid'|'hi'`; non-interactive: `''`
  - `CASINO_PAINTERS: Record<string, Painter>`

- [ ] **Step 1: Write the failing test** — `client/src/game/casinoArt.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { furnitureDef } from '@dovey/shared';
import { CASINO_PAINTERS, artStateKey } from './casinoArt';

describe('casino art', () => {
  it('buckets holodice faces so the atlas stays small', () => {
    const h = furnitureDef('holodice')!;
    expect(artStateKey(h, '12')).toBe('lo');
    expect(artStateKey(h, '50')).toBe('mid');
    expect(artStateKey(h, '100')).toBe('hi');
    expect(artStateKey(h, '-1')).toBe('-1');
    expect(artStateKey(h, undefined)).toBe('0');
  });
  it('dice and wheel keep their exact face; décor has no state', () => {
    expect(artStateKey(furnitureDef('dicemaster')!, '5')).toBe('5');
    expect(artStateKey(furnitureDef('wheel_fortune')!, '8')).toBe('8');
    expect(artStateKey(furnitureDef('chip_stack')!, '3')).toBe('');
  });
  it('has a painter for every casino kind', () => {
    for (const k of ['dicemaster', 'holodice', 'wheel_fortune', 'dragon_egg', 'throne', 'felt_table', 'chip_stack', 'casino_carpet', 'neon_casino', 'slot_prop', 'velvet_rope_gold']) {
      expect(typeof CASINO_PAINTERS[k], k).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/client test -- casinoArt`
Expected: FAIL — `Cannot find module './casinoArt'`.

- [ ] **Step 3: Painters** — create `client/src/game/casinoArt.ts`

```ts
import { Graphics } from 'pixi.js';
import { FurnitureDef, ROLLING, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { box, shade } from './furnitureArt';
import { cylinder, glow, shadow } from './parkArt';

/**
 * Casino furniture: red felt, gold trim, glowing dice. Chance furni read
 * `c.state` (see artStateKey): '0' closed, '-1' rolling (animated), else a face.
 */

type Painter = (g: Graphics, c: ArtCtx) => void;
type Pt = { x: number; y: number };

const TAU = Math.PI * 2;
const RED = 0xc8102e;
const DARK_RED = 0x6e0a1e;
const GOLD = 0xf2b632;
const GOLD_DARK = 0xa8741a;
const IVORY = 0xfffdf6;
const INK = 0x1b1838;
const FELT = 0x1f7a4d;
const WOOD = 0x5b3a1e;
const WHEEL = [0xc8102e, 0x1b1838, 0xf2b632, 0x1f7a4d, 0xc8102e, 0x1b1838, 0x5ef2ff, 0xc49bff];

const lift = (tx: number, ty: number, z: number): Pt => {
  const p = tileToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
};

export function artStateKey(def: FurnitureDef, state: string | undefined): string {
  if (!def.interaction) return '';
  const s = state || '0';
  if (def.interaction !== 'dice100' || s === ROLLING || s === '0') return s;
  const n = Number(s);
  return n <= 33 ? 'lo' : n <= 66 ? 'mid' : 'hi';
}

/** pip positions on a unit face, centre (0,0), span -1..1 */
const PIPS: Record<string, Array<[number, number]>> = {
  '1': [[0, 0]],
  '2': [[-0.5, -0.5], [0.5, 0.5]],
  '3': [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
  '4': [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  '5': [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]],
  '6': [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0], [0.5, 0], [-0.5, 0.6], [0.5, 0.6]],
};

/** draws the cube; returns the hop height so faces can be drawn on top */
function dieCube(g: Graphics, c: ArtCtx, body: number, sideCol: number): number {
  const rolling = c.state === ROLLING;
  const hop = rolling ? Math.abs(Math.sin(c.t * TAU * 2)) * 8 : 0;
  shadow(g, c.cx, c.cy + 2, 14 - hop / 2, 6, 0.25);
  box(g, 0.2, 0.2, 0.6, 0.6, 2 + hop, 22, body, sideCol);
  if (rolling) {
    const top = lift(0.5, 0.5, 26 + hop);
    for (let i = 0; i < 3; i++) {
      const a = c.t * TAU + (i * TAU) / 3;
      g.moveTo(top.x + Math.cos(a) * 6, top.y + Math.sin(a) * 3).lineTo(top.x + Math.cos(a) * 14, top.y + Math.sin(a) * 7);
    }
    g.stroke({ width: 1.5, color: GOLD, alpha: 0.8 });
  }
  return hop;
}

export const CASINO_PAINTERS: Record<string, Painter> = {
  dicemaster(g, c) {
    const hop = dieCube(g, c, IVORY, 0xe6e0f2);
    const top = lift(0.5, 0.5, 26 + hop);
    if (c.state === '0') {
      g.ellipse(top.x, top.y, 11, 5.5).fill(GOLD).stroke({ width: 1, color: GOLD_DARK });
      return;
    }
    const pips = PIPS[c.state];
    if (!pips) return;
    for (const [u, v] of pips) g.ellipse(top.x + (u - v) * 7, top.y + (u + v) * 3.5, 2.2, 1.2).fill(c.state === '1' ? RED : INK);
  },

  holodice(g, c) {
    const colour = c.state === 'lo' ? 0x5ef2ff : c.state === 'mid' ? 0xc49bff : c.state === 'hi' ? GOLD : 0x7d7a91;
    const hop = dieCube(g, c, shade(colour, 0.9), shade(colour, 0.6));
    const top = lift(0.5, 0.5, 26 + hop);
    glow(g, top.x, top.y - 4, 16, colour, c.state === '0' ? 0.15 : 0.45);
    g.ellipse(top.x, top.y, 7, 3.5).fill({ color: IVORY, alpha: 0.9 });
  },

  wheel_fortune(g, c) {
    const base = lift(c.w / 2, c.h / 2, 0);
    shadow(g, base.x, base.y + 2, 26, 10, 0.25);
    box(g, 0.1, 0.25, c.w - 0.2, 0.5, 0, 14, DARK_RED, shade(DARK_RED, 0.7));
    const hub = { x: base.x, y: base.y - 56 };
    const R = 34;
    const result = Number(c.state);
    // rolling spins with the frame; a result parks that segment under the top pointer
    const rot = c.state === ROLLING ? -c.t * TAU : result >= 1 ? -((result - 1) / 8) * TAU - TAU / 16 : 0;
    for (let i = 0; i < 8; i++) {
      const a0 = rot + (i / 8) * TAU - Math.PI / 2;
      g.moveTo(hub.x, hub.y).arc(hub.x, hub.y, R, a0, a0 + TAU / 8).lineTo(hub.x, hub.y).fill(WHEEL[i]);
    }
    g.circle(hub.x, hub.y, R).stroke({ width: 3, color: GOLD });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      g.circle(hub.x + Math.cos(a) * (R + 3), hub.y + Math.sin(a) * (R + 3), 1.6).fill(c.frame % 2 === i % 2 ? IVORY : GOLD);
    }
    g.circle(hub.x, hub.y, 5).fill(GOLD);
    g.poly([hub.x - 5, hub.y - R - 8, hub.x + 5, hub.y - R - 8, hub.x, hub.y - R + 4]).fill(IVORY).stroke({ width: 1, color: INK });
  },

  dragon_egg(g, c) {
    const pulse = 0.35 + Math.sin(c.t * TAU) * 0.15;
    shadow(g, c.cx, c.cy + 2, 12, 5, 0.25);
    cylinder(g, c.cx, c.cy, 12, 5, 4, GOLD, GOLD_DARK);
    glow(g, c.cx, c.cy - 20, 20, 0x7cf29a, pulse);
    g.ellipse(c.cx, c.cy - 20, 10, 15).fill(0x2f8f5b).stroke({ width: 1.5, color: INK });
    for (const [dx, dy] of [[-4, -26], [3, -18], [-2, -11], [5, -28]] as const) g.ellipse(c.cx + dx, c.cy + dy, 2.4, 1.6).fill(0x7cf29a);
  },

  throne(g, c) {
    const shine = 0.3 + Math.sin(c.t * TAU) * 0.2;
    shadow(g, c.cx, c.cy + 2, 16, 7, 0.28);
    box(g, 0.15, 0.15, 0.7, 0.7, 0, 16, GOLD, GOLD_DARK);
    box(g, 0.12, 0.08, 0.76, 0.14, 16, c.def.tall - 16, GOLD, GOLD_DARK);
    box(g, 0.25, 0.25, 0.5, 0.5, 16, 3, RED, DARK_RED, false);
    const crest = lift(0.5, 0.15, c.def.tall + 4);
    g.circle(crest.x, crest.y, 5).fill(RED).stroke({ width: 1.5, color: GOLD_DARK });
    glow(g, crest.x, crest.y, 12, GOLD, shine);
  },

  felt_table(g, c) {
    shadow(g, c.cx, c.cy + 2, 26, 10, 0.22);
    box(g, 0.08, 0.1, c.w - 0.16, c.h - 0.2, 0, c.def.tall, FELT, WOOD);
    const T = c.def.tall;
    g.poly([lift(0.08, 0.1, T), lift(c.w - 0.08, 0.1, T), lift(c.w - 0.08, c.h - 0.1, T), lift(0.08, c.h - 0.1, T)]).stroke({ width: 2, color: GOLD });
  },

  chip_stack(g, c) {
    shadow(g, c.cx, c.cy + 2, 12, 5, 0.22);
    const cols = [RED, INK, GOLD, IVORY, RED, INK];
    cols.forEach((col, i) => cylinder(g, c.cx - 4, c.cy - i * 3, 6, 3, 3, col, shade(col, 0.7)));
    cols.slice(0, 4).forEach((col, i) => cylinder(g, c.cx + 5, c.cy + 2 - i * 3, 6, 3, 3, col, shade(col, 0.7)));
  },

  casino_carpet(g) {
    g.poly([lift(0, 0, 0), lift(1, 0, 0), lift(1, 1, 0), lift(0, 1, 0)]).fill(DARK_RED);
    g.poly([lift(0.5, 0.15, 0), lift(0.85, 0.5, 0), lift(0.5, 0.85, 0), lift(0.15, 0.5, 0)]).stroke({ width: 1, color: GOLD, alpha: 0.6 });
  },

  neon_casino(g, c) {
    // wall sign: dark panel, red neon frame, bulbs chasing along it
    const onX = c.rot % 2 === 0;
    const a = lift(0, 0, 70);
    const b = onX ? lift(c.w, 0, 70) : lift(0, c.h, 70);
    g.poly([a, b, { x: b.x, y: b.y - 24 }, { x: a.x, y: a.y - 24 }]).fill(INK).stroke({ width: 3, color: RED });
    glow(g, (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, 40, RED, 0.35);
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8;
      g.circle(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - 12, 3).fill(i % 4 === c.frame % 4 ? IVORY : GOLD);
    }
  },

  slot_prop(g, c) {
    shadow(g, c.cx, c.cy + 2, 14, 6, 0.25);
    box(g, 0.15, 0.2, 0.7, 0.6, 0, c.def.tall, RED, DARK_RED);
    const win = lift(0.5, 0.8, 38);
    g.rect(win.x - 10, win.y - 6, 20, 10).fill(IVORY).stroke({ width: 1, color: GOLD_DARK });
    for (let i = 0; i < 3; i++) g.circle(win.x - 6 + i * 6, win.y - 1, 2).fill(WHEEL[(i + c.frame) % WHEEL.length]);
    glow(g, win.x, win.y - 20, 14, GOLD, c.on ? 0.4 : 0.1);
  },

  velvet_rope_gold(g, c) {
    shadow(g, c.cx, c.cy + 2, 8, 4, 0.2);
    cylinder(g, c.cx, c.cy, 6, 3, 3, GOLD, GOLD_DARK);
    box(g, 0.45, 0.45, 0.1, 0.1, 3, 28, GOLD, GOLD_DARK, false);
    const top = lift(0.5, 0.5, 32);
    g.circle(top.x, top.y, 3).fill(GOLD);
    g.moveTo(top.x, top.y + 2).quadraticCurveTo(top.x + 14, top.y + 14, top.x + 30, top.y + 6).stroke({ width: 3, color: RED });
  },
};
```

- [ ] **Step 4: Thread `state` through painting** — `client/src/game/furnitureArt.ts`

Imports: `import { CASINO_PAINTERS } from './casinoArt';`

`ArtCtx`, after `on: boolean;`:

```ts
  /** chance furni face key from artStateKey ('' for everything else) */
  state: string;
```

`paintFurniture`:

```ts
export function paintFurniture(g: Graphics, def: FurnitureDef, rot: number, frame: number, on: boolean, state = '') {
  const { w, h } = footprint(def, rot);
  const centre = tileToScreen(w / 2, h / 2);
  const ctx: ArtCtx = {
    def,
    rot,
    frame,
    t: def.anim > 1 ? frame / def.anim : 0,
    on,
    state,
    w,
    h,
    top: PALETTE[def.colours[0]],
    side: PALETTE[def.colours[1]],
    cx: centre.x,
    cy: centre.y,
  };
  (PAINTERS[def.kind] ?? LAB_PAINTERS[def.kind] ?? BEACH_PAINTERS[def.kind] ?? DREAM_PAINTERS[def.kind] ?? PARK_PAINTERS[def.kind] ?? DEN_PAINTERS[def.kind] ?? CASINO_PAINTERS[def.kind] ?? PAINTERS.block)(g, ctx);
}
```

(`casinoArt.ts` imports `box`/`shade` from `furnitureArt.ts` and vice versa — same circular pattern `denArt.ts` already uses; functions are only called at paint time, so it is safe.)

- [ ] **Step 5: State-aware atlas** — `client/src/game/atlas.ts`

Imports: `import { FurnitureDef, ROLLING, furnitureDef } from '@dovey/shared';` and `import { artStateKey } from './casinoArt';`

```ts
  frames(def: FurnitureDef, rot: number, on: boolean, state = ''): FrameSet {
    const sk = artStateKey(def, state);
    const key = `${def.id}:${rot}:${on ? 1 : 0}:${sk}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.renderer) throw new Error('atlas not bound');
    const b = artBounds(def, rot);
    const frame = new Rectangle(b.x, b.y, b.w, b.h);
    const textures: Texture[] = [];
    // a shown face is a still; only rolling animates
    const count = def.interaction && sk !== ROLLING ? 1 : def.anim;
    for (let f = 0; f < count; f++) {
      const g = new Graphics();
      paintFurniture(g, def, rot, f, on, sk);
      const tex = this.renderer.generateTexture({ target: g, frame, resolution: ATLAS_RES });
      textures.push(tex);
      g.destroy();
    }
    const set = { textures, offsetX: b.x, offsetY: b.y };
    this.cache.set(key, set);
    return set;
  }
```

In `preview`, compute `const face = def.interaction === 'wheel' ? '1' : def.interaction ? '5' : '';` then use `this.frames(def, 0, true, face)` and `paintFurniture(g, def, 0, 0, true, artStateKey(def, face));`.

- [ ] **Step 6: Sprite redraw** — `client/src/game/furniture.ts`

`setPlacement` `changed` line:

```ts
    const changed =
      p.def !== this.placement.def || p.rot !== this.placement.rot || (p.on ?? true) !== this.lit || (p.state ?? '') !== (this.placement.state ?? '');
```

`redraw`: `const set = atlas.frames(d, this.placement.rot, this.lit, this.placement.state ?? '');`

- [ ] **Step 7: Test + typecheck**

Run: `pnpm --filter @dovey/client test && pnpm --filter @dovey/client typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/game/casinoArt.ts client/src/game/casinoArt.test.ts client/src/game/furnitureArt.ts client/src/game/atlas.ts client/src/game/furniture.ts
git commit -m "feat(client): casino furniture art with state-aware dice and wheel"
```

---

### Task 8: Client wiring — sync, reach-aware use, close gesture, instances in shop and build tray

**Files:**
- Modify: `client/src/net.ts` (`FurnitureState` ~53-59; `toPlacement` ~61; handlers ~216-245; `sendUse` ~281)
- Modify: `client/src/api.ts` (`Inventory` ~79-82)
- Modify: `client/src/store.ts` (line 89 `EditMode`; state/actions ~107-180)
- Modify: `client/src/App.tsx:103`
- Modify: `client/src/game/Game.ts` (fields ~99; stage listener ~232; `onTap` end ~800; `useItem` ~811-826; `nearestWalkableAround` 851-860; `onEditTap` 915-933; arrival 1088-1092)
- Modify: `client/src/ui/BuildBar.tsx`, `client/src/ui/ShopSheet.tsx`

**Interfaces:**
- Consumes: Task 4/5 contract; `inReach`, `isInstanceDef` (Task 1).
- Produces: `store.instances: InstanceItem[]`, `store.setInstances`, `EditMode.placingItem`, `Net.sendClose(id)`, `fetchShopStock()`.

- [ ] **Step 1: API + store types**

`client/src/api.ts` — replace `Inventory` and add stock fetch:

```ts
export interface InstanceItem {
  id: string;
  def: string;
  serial: number | null;
  placed: string | null;
}

export interface Inventory {
  coins: number;
  items: Record<string, number>;
  instances: InstanceItem[];
}

export async function fetchShopStock(): Promise<Record<string, { sold: number; cap: number }>> {
  const r = await fetch(`${base}/api/shop/stock`);
  if (!r.ok) return {};
  return r.json();
}
```

`client/src/store.ts` line 89:

```ts
export type EditMode = { on: false } | { on: true; placing: string | null; placingItem: string | null; selected: string | null; moving: boolean };
```

Add to the store's state type next to `inventory: Record<string, number>;`:

```ts
  instances: import('./api').InstanceItem[];
  setInstances: (instances: import('./api').InstanceItem[]) => void;
```

Initial state next to `inventory: {},`: `instances: [],`; action next to `setInventory`: `setInstances: (instances) => set({ instances }),`.

`client/src/App.tsx:103` literal becomes `{ on: true, placing: null, placingItem: null, selected: null, moving: false }`.

Run `grep -rn "setInventory(" client/src` and, at every call site that has an `Inventory` object `inv`/`r` from `fetchInventory()` or `buyItem()`, add the matching `setInstances(x.instances)` call.

- [ ] **Step 2: Net sync** — `client/src/net.ts`

Add `import { fetchInventory } from './api';`.

```ts
interface FurnitureState {
  def: string;
  x: number;
  y: number;
  rot: number;
  on: boolean;
  state: string;
  itemId: string;
  serial: number;
}

const toPlacement = (id: string, f: FurnitureState): Placement => ({
  id,
  def: f.def,
  x: f.x,
  y: f.y,
  rot: f.rot as 0 | 1 | 2 | 3,
  on: f.on,
  ...(f.state ? { state: f.state } : {}),
  ...(f.itemId ? { itemId: f.itemId } : {}),
  ...(f.serial ? { serial: f.serial } : {}),
});
```

After the `inventory_delta` handler:

```ts
    room.onMessage('inventory_refresh', () => {
      void fetchInventory().then((inv) => {
        if (!inv) return;
        store.setCoins(inv.coins);
        store.setInventory(inv.items);
        store.setInstances(inv.instances);
      });
    });
```

In the `sys` map: `sold_out: 'sold out. only trades now',`

After `sendUse`:

```ts
  sendClose(id: string) {
    this.room?.send('furn_close', { id });
  }
```

- [ ] **Step 3: Reach-aware use and close gesture** — `client/src/game/Game.ts`

Add `inReach` to the `@dovey/shared` import. Fields next to `private pendingUse`:

```ts
  private pendingClose = false;
  private downAt = 0;
```

Next to `this.app.stage.on('pointertap', (e) => this.onTap(e));`:

```ts
    this.app.stage.on('pointerdown', () => (this.downAt = performance.now()));
```

End of `onTap`:

```ts
    if (action.kind === 'walk') this.walkTo(action.x, action.y);
    else if (action.kind === 'use') this.useItem(action.item, e.button === 2 || performance.now() - this.downAt > 500);
    else if (action.kind === 'seat') this.walkOntoSeat(action.item);
```

Replace `useItem`:

```ts
  /** Use an item if in reach, else walk next to it and use it on arrival. Long-press / right-click closes dice. */
  private useItem(item: Placement, close = false) {
    if (!this.mover) return;
    const here = { x: Math.round(this.mover.x), y: Math.round(this.mover.y) };
    const kind = furnitureDef(item.def)?.interaction;
    const reachable = kind ? inReach(kind, here.x, here.y, item) : distanceTo(here.x, here.y, item) <= 2;
    if (reachable) {
      if (close && kind) this.net.sendClose(item.id);
      else this.net.sendUse(item.id);
      return;
    }
    const near = this.nearestWalkableAround(item, here);
    if (near && this.mover.setTarget(near)) {
      this.pendingUse = item.id;
      this.pendingClose = close && !!kind;
      this.net.sendMove(near.x, near.y);
      this.showMarker(near.x, near.y);
    }
  }
```

Replace `nearestWalkableAround`:

```ts
  private nearestWalkableAround(item: Placement, from: { x: number; y: number }) {
    const kind = furnitureDef(item.def)?.interaction;
    const ok = (x: number, y: number) => (kind ? inReach(kind, x, y, item) : distanceTo(x, y, item) <= 1);
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = item.y - 2; y <= item.y + 3; y++)
      for (let x = item.x - 2; x <= item.x + 3; x++) {
        if (!isWalkable(this.grid, x, y) || !ok(x, y)) continue;
        const d = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (!best || d < best.d) best = { x, y, d };
      }
    return best;
  }
```

Arrival block (~1088):

```ts
      if (this.pendingUse && !this.mover.moving) {
        const id = this.pendingUse;
        this.pendingUse = null;
        if (this.pendingClose) this.net.sendClose(id);
        else this.net.sendUse(id);
        this.pendingClose = false;
      }
```

- [ ] **Step 4: Place instances** — `onEditTap` placing branch (915-933). Replace the first line with:

```ts
      const p: Placement = { id: newPlacementId(), def: edit.placing, x, y, rot: 0, ...(edit.placingItem ? { itemId: edit.placingItem } : {}) };
```

Replace the tail after validation (from `this.net.sendPlace(p);` to the branch's `return;`) with:

```ts
      this.net.sendPlace(p);
      this.undo.push({ kind: 'remove', id: p.id });
      store.setUndoCount(this.undo.size);
      if (edit.placingItem) {
        // one serial, one placement: hide it from the tray until the server refresh lands
        const itemId = edit.placingItem;
        store.setInstances(store.instances.map((i) => (i.id === itemId ? { ...i, placed: 'here' } : i)));
        store.setEdit({ ...edit, placing: null, placingItem: null, selected: p.id });
        return;
      }
      store.setEdit({ ...edit, selected: p.id });
      return;
```

(Undo of a remove re-sends the stored placement, which now carries `itemId`, so instances undo correctly.)

- [ ] **Step 5: Build tray** — `client/src/ui/BuildBar.tsx`

Import: `import { FURNITURE, furnitureDef, isInstanceDef } from '@dovey/shared';`. In the component add `const instances = useAppStore((s) => s.instances);`. Replace `owned`:

```ts
  const owned = FURNITURE.filter((f) => !isInstanceDef(f) && (inventory[f.id] ?? 0) > 0);
  const unplaced = instances.filter((i) => !i.placed);
```

Empty check: `{owned.length === 0 && unplaced.length === 0 && (...)}`. Before `{owned.map(...)}`:

```tsx
        {unplaced.map((i) => {
          const on = edit.placingItem === i.id;
          return (
            <button
              key={i.id}
              className={`furn ${on ? 'furn--on' : ''}`}
              onClick={() => setEdit({ ...edit, placing: on ? null : i.def, placingItem: on ? null : i.id, selected: null, moving: false })}
            >
              <Thumb def={i.def} />
              <span className="furn__name">{furnitureDef(i.def)?.name}</span>
              <span className="furn__qty">{i.serial !== null ? `#${i.serial}` : '★'}</span>
            </button>
          );
        })}
```

Commons button `onClick` object: add `placingItem: null`. The move button (`setEdit({ ...edit, moving: !edit.moving, placing: null })`) also gets `placingItem: null`.

- [ ] **Step 6: Shop** — `client/src/ui/ShopSheet.tsx`

Import `fetchShopStock` from `../api`. `ItemCard` gains prop `stock?: { sold: number; cap: number }` and:

```tsx
  const soldOut = !!stock && stock.sold >= stock.cap;
  const can = !soldOut && coins !== null && coins >= def.price;
```

Inside `shopcard__tags` add:

```tsx
          {def.interaction && <span className="shopcard__tag shopcard__tag--use">chance</span>}
          {def.ltd && <span className="shopcard__tag">LTD {stock ? `${stock.cap - stock.sold}/${stock.cap} left` : `of ${def.ltd}`}</span>}
```

Buy button label: `{soldOut ? 'SOLD OUT' : `🪙 ${def.price.toLocaleString()}`}`.

In `ShopSheet`:

```tsx
  const instances = useAppStore((s) => s.instances);
  const setInstances = useAppStore((s) => s.setInstances);
  const [stock, setStock] = useState<Record<string, { sold: number; cap: number }>>({});
  useEffect(() => {
    void fetchShopStock().then(setStock);
  }, []);
```

`buy` error/success block:

```tsx
    if ('error' in r) {
      flash(r.error === 'not_enough_coins' ? 'not enough coins' : r.error === 'sold_out' ? 'sold out. only trades now' : 'could not buy');
      if (r.error === 'sold_out') void fetchShopStock().then(setStock);
      return;
    }
    setCoins(r.coins);
    setInventory(r.items);
    setInstances(r.instances);
    if (def.ltd) void fetchShopStock().then(setStock);
    flash(`bought ${def.name}`);
```

Card render:

```tsx
          <ItemCard
            key={def.id}
            def={def}
            owned={(inventory[def.id] ?? 0) + instances.filter((i) => i.def === def.id).length}
            stock={stock[def.id]}
            coins={coins}
            busy={busy === def.id}
            onBuy={() => buy(def)}
          />
```

Hint text: `you earn 5 coins a minute while you hang out. casino rares are limited: once sold out, trading is the only way.`

- [ ] **Step 7: Typecheck and all tests**

Run: `pnpm typecheck && pnpm test`
Expected: all packages type-check; all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/net.ts client/src/api.ts client/src/store.ts client/src/App.tsx client/src/game/Game.ts client/src/ui/BuildBar.tsx client/src/ui/ShopSheet.tsx
git commit -m "feat(client): roll and close chance furni, buy and place LTD casino items"
```

---

### Task 9: End-to-end smoke and live check

**Files:**
- Create: `client/scripts/smoke-casino.mjs`

**Interfaces:**
- Consumes: running server at `DOVEY_API` (default `http://localhost:2567`); `move {x, y}` message (`GameRoom.ts:170`); booth 1 dice at (3,5), stand tile (4,6) (Task 6).

- [ ] **Step 1: Write the smoke script** — `client/scripts/smoke-casino.mjs`

```js
/**
 * Casino smoke against a running server: A walks to booth 1 and rolls a
 * Dicemaster; B sees rolling -> the same face and the roll bubble; a far player
 * cannot roll; the dealer closes the die; LTD stock endpoint answers.
 *
 *   node client/scripts/smoke-casino.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2567';
const WS = API.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function me(token) {
  const r = await fetch(`${API}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  return r.json();
}

const checks = [];
const check = (label, ok) => {
  checks.push(!!ok);
  console.log(ok ? '  ok  ' : '  FAIL', label);
};

const tokenA = 'casinoSmokeA' + '0'.repeat(24);
const tokenB = 'casinoSmokeB' + '1'.repeat(24);
await me(tokenA);
await me(tokenB);

const stock = await (await fetch(`${API}/api/shop/stock`)).json();
check('ltd stock lists dragon_egg cap 50', stock.dragon_egg?.cap === 50);

const client = new Client(WS);
const A = await client.joinOrCreate('room', { slug: 'casino', token: tokenA });
const B = await client.joinOrCreate('room', { slug: 'casino', token: tokenB });
const chats = [];
for (const room of [A, B]) for (const t of ['emote', 'coins', 'sys', 'love', 'call_state', 'inventory_refresh', 'inventory_delta']) room.onMessage(t, () => {});
A.onMessage('chat', () => {});
B.onMessage('chat', (m) => chats.push(m));
await wait(800);

let dieId = null;
A.state.furniture.forEach((f, id) => {
  if (f.def === 'dicemaster' && f.x === 3 && f.y === 5) dieId = id;
});
check('casino has booth dicemaster at 3,5', !!dieId);

A.send('move', { x: 4, y: 6 });
B.send('move', { x: 10, y: 18 });
await wait(4000);

A.send('furn_use', { id: dieId });
await wait(300);
check('B sees rolling state', B.state.furniture.get(dieId)?.state === '-1');
await wait(1600);
const face = B.state.furniture.get(dieId)?.state;
check(`B sees a face 1-6 (got ${face})`, /^[1-6]$/.test(face ?? ''));
check('A and B agree', A.state.furniture.get(dieId)?.state === face);
check('B got the roll bubble', chats.some((c) => c.id === A.sessionId && c.text === `🎲 rolled ${face}`));

B.send('furn_use', { id: dieId });
await wait(400);
check('far player cannot roll', B.state.furniture.get(dieId)?.state === face);

A.send('furn_close', { id: dieId });
await wait(900);
check('dealer closes the die', B.state.furniture.get(dieId)?.state === '0');

await A.leave();
await B.leave();
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} check(s) failed` : 'all casino checks passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run against a local server**

Run: `pnpm --filter @dovey/server dev` (background; wait for `listening`), then `node client/scripts/smoke-casino.mjs`
Expected: every line `ok`, final `all casino checks passed`, exit code 0.

- [ ] **Step 3: Live visual check**

Run `pnpm dev`, open the Casino from the room browser, walk to a booth, tap a Dicemaster: it tumbles ~1.5 s, shows pips, bubble `🎲 rolled n` appears; long-press shows the gold lid. Shop `casino` tab: Wheel/Throne/Dragon Egg show `LTD n/cap left`. For a buy test, credit a dev account (e.g. a one-off `node -e` using `Repo.creditCoins`, or `update users set coins = 100000 where handle = '<you>'` against the dev PGlite), buy a Dicemaster, place it at home from the build tray (`★`), pick it up, confirm it returns to the tray.

- [ ] **Step 4: Commit**

```bash
git add client/scripts/smoke-casino.mjs
git commit -m "test: casino dice smoke script"
```

---

## Follow-up plans

- Stage 2 trading plan: trade window, `TradeBook`, `executeTrade`, `trades` table, age gate (`users.play_minutes`), room `trade_enabled`, report inside trade, mod view (`recentTrades`, `recentRolls`).
- Stage 3 dragon plan: egg hatch timer (`items.state.placedAt/accumMs`), `dragon_pet` def, `users.pet_item`, `Player.pet`, follower rendering.
