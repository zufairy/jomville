# Casino, Chance Furni, Trading & Dragon Pet — Design

Date: 2026-09-14
Status: approved design (sections 1-3 approved in chat; section 4 pending review)

## Goal

Habbo-style casino culture inside dovey: very expensive rare furni, usable chance
furni (Dicemaster, Holodice, Wheel of Fortune) with server-side randomness, and a
safe player-to-player trade window (items + coins) so players can bet and settle
in casinos. Plus report-from-trade, trade logs for mods, and a Dragon Egg that
hatches into a follower dragon pet.

Delivered in stages, each shippable:

- **Stage 1** — rare item instances + LTD stock, casino catalog, chance furni
  (dice6, dice100, wheel), roll log, Casino system room.
- **Stage 2** — trade window (invite, offer, accept, countdown, confirm), atomic
  trade execution, trade log, trade gating, report inside trade, mod view of trades.
- **Stage 3** — Dragon Egg hatch timer + dragon pet follower.

## Research basis (Habbo)

- Dicemaster: roll only from a tile adjacent to the die (diagonals count), no room
  rights needed; state `-1` while rolling (~1500 ms), clicks ignored while rolling;
  server picks 1-6; picked-up die resets to `0` (closed). Source: Arcturus emulator
  `InteractionDice`, Habbox Wiki.
- Casino games (13, 21, poker, high/low) were community-run; dealer rolls last;
  bets settled by trade. Classic scam: dealer loses and leaves.
- Trade window: 9 slots each side; any offer change resets both accepts;
  Accept → ~3 s → Confirm; Trade/Report on avatar menu.
- Dragon Egg: Super Rare, 1×1, no interaction in Habbo. We extend it with hatching.
- Habbo banned betting on chance furni in 2014 after regulator action (Denmark 2012).

## Decisions

| Topic | Decision |
| --- | --- |
| Rooms | New "Casino" system room AND casino furni buyable for user rooms |
| Rarity | High coin price + limited serial stock (LTD) for top rares |
| Item storage | Hybrid: keep `inventory(user_id, def, qty)` for commons; new `items` table for instances |
| Chance furni v1 | Dicemaster (1-6), Holodice (1-100), Wheel of Fortune (8 segments) |
| Tradeables | Items (stacks + instances) + coins |
| Dragon Egg | Hatches into follower cosmetic dragon pet after 72 h placed |
| Trade safety | Account age gate, owner can disable trade, trade log + mod view, report inside trade window |
| Bet escrow | None in v1 (pure Habbo); reports + logs handle scammers |

## Legal guardrail

Coins and items must never be purchasable or cashable for real money while chance
furni and trading are live. Real-money payments later require disabling chance
furni in trade-enabled rooms (Habbo precedent). Record this in `DEPLOY.md`.

## Section 1 — Items, economy, Casino room

### Catalog (`shared/src/furniture.ts`)

New optional def fields: `ltd?: number` (serial cap),
`interaction?: 'dice6' | 'dice100' | 'wheel' | 'egg' | 'pet'`,
`instance?: boolean` (true when `ltd` or `interaction` set — tracked per item).

| Item (def) | Price | Stock | Use |
| --- | --- | --- | --- |
| Dicemaster (`dicemaster`) | 8,000 | unlimited | dice6 |
| Holodice (`holodice`) | 15,000 | unlimited | dice100 |
| Wheel of Fortune (`wheel_fortune`) | 25,000 | LTD 100 | wheel |
| Dragon Egg (`dragon_egg`) | 75,000 | LTD 50 | egg |
| Dragon (`dragon_pet`) | 0 (not sold) | from eggs only | pet |
| Golden Throne (`throne_gold`) | 50,000 | LTD 100 | sit |
| Casino décor: felt table, chip stack, velvet rope, neon "CASINO", slot-look prop | 300-2,000 | unlimited | décor |

Economy context: start 1,500 coins, +5/min (~300/h). Dicemaster ≈ 27 h play; Dragon Egg ≈ 250 h.

### Tables (`server/src/db.ts`)

```sql
create table if not exists items (
  id text primary key,               -- nanoid
  def text not null,
  owner_id text not null references users(id),
  serial int,                        -- null when def has no ltd
  state jsonb not null default '{}', -- egg: {placedAt, accumMs}
  placed_room text,                  -- non-null while standing in a room
  created_at timestamptz not null default now()
);
create index if not exists items_owner on items(owner_id);
create unique index if not exists items_def_serial on items(def, serial) where serial is not null;
create table if not exists ltd_stock (def text primary key, sold int not null default 0, cap int not null);
create table if not exists rolls (
  id serial primary key, room_id text not null, furni_id text not null,
  user_id text not null, kind text not null, result int not null,
  at timestamptz not null default now()
);
create index if not exists rolls_room_at on rolls(room_id, at);
```

Via `COLUMNS`: `rooms.trade_enabled boolean not null default true`,
`users.play_minutes int not null default 0`, `users.pet_item text`.

### Shop purchase of instance items

`repo.buyInstance(userId, def)` in one transaction: `spendCoins` guard; if `ltd`,
`update ltd_stock set sold = sold + 1 where def = $1 and sold < cap returning sold`
(no row = `sold_out`, rollback); insert `items` row with `serial = sold`.
`GET /api/shop` returns `{sold, cap}` for LTD defs; UI shows "#sold/cap" and SOLD OUT.
`/api/inventory` returns stacks plus `instances: [{id, def, serial, placed}]`.

### Placement of instance items

`furn_place` accepts `itemId`. For instance defs: require `items.owner_id = user`
and `placed_room is null`, then set `placed_room`; `Furniture.itemId`/`serial` set.
`furn_remove` clears `placed_room` and returns the instance to the **item owner**
(not the room editor). Layout JSON stores `itemId`. Common items unchanged.

### Casino system room (`shared/src/casinoLayout.ts`, `systemRooms.ts`)

Dark red/gold style. 5 dealer booths (chair + 3 Dicemasters in reach), Wheel stage,
Holodice high/low table, Throne on a glass plinth (décor copy, not usable), entrance
sign "Trades are final. Report scammers." System-room furni use `itemId = ''`
(system-owned, never tradeable). Trading always enabled.

## Section 2 — Usable chance furni

### Schema (`server/src/schema.ts`)

`Furniture` adds `@type('string') state = ''`, `@type('string') itemId = ''`,
`@type('uint16') serial = 0`.

### Interaction registry (`shared/src/interactions/`)

One pure module per kind, exported via `INTERACTIONS[kind]`:

```ts
interface Interaction {
  reach: 'adjacent' | { radius: number } | 'owner';
  rollMs: number;                               // 0 = instant
  closedState: string;                          // e.g. '0'
  result(rand: (n: number) => number): string;  // injected RNG for tests
}
```

| Kind | Reach | rollMs | Result |
| --- | --- | --- | --- |
| dice6 | adjacent (8-neighbour of footprint) | 1500 | 1-6 |
| dice100 | adjacent | 2000 | 1-100 |
| wheel | radius 2 | 3000 | segment 1-8 |
| egg | owner | 0 | no RNG; replies hatch progress |

### Server flow (`furn_use` at `GameRoom.ts:132`, logic in `server/src/interactions.ts`)

1. Resolve def; no `interaction` → existing `on` toggle.
2. Rate limit 1 per 700 ms per player; reach check else `too_far`.
3. If `state === '-1'` ignore. Else set `state = '-1'`; after `rollMs` (room clock)
   set `state = result(crypto.randomInt)`; insert `rolls`; broadcast system chat
   `🎲 {handle} rolled {n} on {name}{ #serial}`.
4. `furn_close {id}` (same reach) sets `closedState` if not rolling.
5. Room dispose/restore: rolling dice restore as `closedState`.
6. Rolls older than 7 days pruned on server boot and daily.

### Client

Dice: closed / rolling (spin anim + rattle sfx) / face 1-6 (dice100 shows number
plate). Wheel: rotates, eases to result segment. Double-click = use; long-press /
right-click menu has "Close". Hover label shows `#serial/cap` for LTD.

## Section 3 — Trading

### Initiation

**Trade** button in `client/src/ui/ProfileSheet.tsx`. Flow mirrors duel invites
(`GameRoom.ts:347`). Refused with `sys {code}` when:

- not same room, or either side already in a trade (`trade_busy`)
- block in either direction (`blocked`)
- account < 24 h old or < 30 min total playtime (`too_new`) — `users.play_minutes`
  incremented by the existing coin trickle
- room `trade_enabled = false` (`trade_off`); Casino always enabled
- invite pending > 20 s expires

### Session (`server/src/trade/TradeBook.ts`, injectable clock)

In-memory per room. Each side: ≤ 9 slots (`{def, qty}` stack or `{itemId}`) + `coins ≥ 0`.

- Any offer change → both `accepted = false`, countdown cleared.
- Both accepted → `confirmAt = now + 3000`; confirm before that rejected.
- Both confirmed → execute.
- Cancel / leave / disconnect / 5 min idle → close, notify both.

Messages (client → server): `t_invite {id}`, `t_respond {ok}`, `t_offer {slots, coins}`,
`t_accept`, `t_confirm`, `t_cancel`, `t_report {reason, note}`.
Server → both: `t_state {you, them, acceptedYou, acceptedThem, confirmAt}` with
resolved names + serials; `t_done {ok, code?}`.

### Execution (`repo.executeTrade`)

One transaction: lock both user rows (`for update`); verify stack qty, instances
owned with `placed_room is null`, coins sufficient; move stacks, `update items set
owner_id`, move coins; unequip traded pet; insert `trades` row:

```sql
create table if not exists trades (
  id serial primary key, a_id text not null, b_id text not null,
  a_offer jsonb not null, b_offer jsonb not null, room_id text,
  at timestamptz not null default now()
);
create index if not exists trades_a on trades(a_id, at);
create index if not exists trades_b on trades(b_id, at);
```

Any failure → rollback, `t_done {ok:false, code:'trade_failed'}`, both refetch
inventory. `inventory_delta` + coin updates sent on success.

### UI (`client/src/ui/TradeWindow.tsx`)

Two columns ("You" / partner), 9 slots each, inventory picker, coin input,
Accept → Confirm with countdown ring, warning "Check items carefully — trades are
final", 🚩 Report in header. Changed slots flash so a last-second swap is visible.

### Room setting

Room owner toggle "Allow trading" in room settings → `rooms.trade_enabled`.

## Section 4 — Report, mod view, dragon pet

### Report inside trade

`t_report` reuses `repo.report` with new reason `scam`; `context` = JSON snapshot of
current offers. Trade is cancelled on report. ProfileSheet report also gains `scam`.

### Mod view

`GET /api/mod/reports` (existing, `x-mod-token`) adds per report: `recentTrades`
(target's last 20 trades) and `recentRolls` (rolls in that room ±30 min of report).
New `GET /api/mod/trades?user=` lists a user's trades. Mods judge "dealer lied about
roll" from the roll log.

### Dragon Egg hatch

- Placing an egg sets `state.placedAt = now`; removing adds elapsed to `state.accumMs`.
- Room clock checks placed eggs every 60 s and on room load. When
  `accumMs + (now - placedAt) ≥ 72 h`: one transaction sets `def = 'dragon_pet'`,
  keeps serial, `placed_room = null`; furni removed from room; broadcast
  `🐉 {owner}'s Dragon Egg #n hatched!`.
- Egg use (`owner` reach) replies `egg_progress {pct}` shown as a bubble.

### Dragon pet follower

- "Equip" from inventory → `users.pet_item` (must own a `dragon_pet`).
- `Player` schema adds `@type('string') pet = ''` (e.g. `dragon_pet#7`).
- Client-only follow: dragon trails owner ~1 tile with lerp; idle bob + fly
  animations; name tag "Dragon #7". No server pathing, no collision.
- `dragon_pet` cannot be placed as furni.

## Networking

Short-prefixed messages (`t_*`, `furn_close`, `egg_progress`); all mutations
server-authoritative; rate limits: `furn_use` 700 ms, trade messages 10/s,
`t_invite` 1 per 5 s.

## Error handling

`sys {code}` codes: `too_far`, `rate_limited`, `sold_out`, `not_owned`,
`insufficient`, `trade_busy`, `too_new`, `trade_off`, `blocked`, `trade_failed`.
DB failures in trade/buy roll back fully; client refetches inventory on any `t_done`.

## Testing

- `shared` vitest: interaction reach (adjacent incl. diagonals, multi-tile footprint),
  result ranges with seeded RNG, TradeBook accept-reset + countdown + timeouts.
- `server` vitest (PGlite): `buyInstance` LTD cap under concurrent buys,
  `executeTrade` happy path, stale offer (item placed mid-trade) rollback,
  insufficient coins, pet unequip, egg hatch at 72 h with paused time.
- `client/scripts/smoke-casino.mjs`: two clients join Casino, roll a Dicemaster and
  see same result; trade coins, both balances update.

## Out of scope

Bet escrow tables and automated game rules (13/21/poker); pet care stats; credit
furni (gold bars); real-money purchases; cross-room trades; offline trades; wired
randomizers.
