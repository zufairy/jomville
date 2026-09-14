# Trading (Casino Stage 2) — Design Addendum

Date: 2026-09-14
Status: approved in chat
Base spec: `docs/superpowers/specs/2026-09-14-casino-trade-design.md` — Section 3 (Trading) and the
"Report inside trade" + "Mod view" parts of Section 4. Everything there applies unless changed below.
Stage 1 of that spec (item instances, LTD stock, chance furni, Casino room) is already on main.

## Why

Players can buy rares and LTD items but have no way to trade them. Stage 2 adds a safe
player-to-player trade window for items (stacks and instances, including LTD serials) and coins.

## Changes and clarifications vs the base spec

### 1. Trade gates (production only)

- Refuse with `sys {code:'too_new'}` when either player's account is younger than 24 h
  (`users.created_at`) or has fewer than 30 play minutes (`users.play_minutes`).
- `users.play_minutes` is a new `COLUMNS` migration (`int not null default 0`), incremented by 1
  for every connected user in the existing once-a-minute coin trickle in `GameRoom`.
- Gates apply only when `NODE_ENV === 'production'` and `TRADE_GATES !== 'off'`. Locally and in
  tests they are off so trading can be tried immediately.

### 2. Real database transaction

- The `Db` interface gains `transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>`, implemented
  with PGlite's `pg.transaction()` (which holds the single connection for the whole callback).
  A plain `BEGIN`/`COMMIT` through `query()` is not safe: PGlite has one connection, so other
  rooms' statements could run inside the trade transaction.
- `repo.executeTrade(a, b, offerA, offerB, roomId)` runs entirely inside `db.transaction`:
  1. Coins: guarded debit per side (`coins >= amount`), credit to the other side.
  2. Stacks: guarded `inventory` decrement per `{def, qty}` (fails if not enough), upsert credit to
     the other side.
  3. Instances: guarded transfer
     `update items set owner_id = $to where id = $id and owner_id = $from and placed_room is null`
     — zero rows fails the trade (item placed, already traded, or not owned).
  4. Insert the `trades` log row.
  Any failure throws; the transaction rolls back and the result is `{ok:false, code}`.
- `trades` table as in the base spec (`id, a_id, b_id, a_offer jsonb, b_offer jsonb, room_id, at`)
  with indexes on `(a_id, at)` and `(b_id, at)`.

### 3. Inventory refresh

There is no server-push inventory channel today. After `t_done {ok:true}` the server also sends each
side `coins {coins, earned:0}`; the client re-fetches inventory over HTTP (`fetchInventory`) and
updates `inventory`, `instances` and `coins` in the store. On `t_done {ok:false}` both sides also
re-fetch, so stale offers never linger.

### 4. Safety extras (included)

- Trade log (`trades` table, above).
- 🚩 Report inside the trade window: `t_report {note?}` files a report with reason `scam`
  (already a valid reason) and `context` = JSON snapshot of both current offers; the trade is
  cancelled and both sides get `t_done {ok:false, code:'reported'}`.
- Mod API: `GET /api/mod/trades?user=<userId>` (same `x-mod-token` guard as `/api/mod/reports`)
  returns that user's last 50 trades.
- Per-room toggle: `rooms.trade_enabled boolean not null default true` (new `COLUMNS` migration);
  `GameRoom` caches it in `onCreate`; `t_invite` in a room with it off → `sys {code:'trade_off'}`.
  The owner-facing settings UI toggle is out of scope for this stage (column + enforcement only).

### 5. Session rules (from the base spec, restated for the plan)

- `TradeBook` (pure, injectable clock) per room. Invite TTL 20 s. Each side ≤ 9 slots
  (`{def, qty}` stack or `{itemId}` instance) + `coins >= 0`.
- Any offer change → both `accepted = false`, confirm countdown cleared.
- Both accepted → `confirmAt = now + 3000`; `t_confirm` before that is rejected.
- Both confirmed → server executes via `repo.executeTrade`.
- Cancel / leave / 5 min idle → close; both get `t_done {ok:false, code}`.
- Offer validation on `t_offer`: slots ≤ 9, `qty` positive integers, no duplicate itemIds, stack
  qty ≤ what the player holds, instances owned and not placed, coins ≤ balance. Validation is
  repeated inside the transaction at execution time.
- Refused invites (`sys`): `no_such_player`, `trade_busy`, `blocked_pair`, `too_new`, `trade_off`,
  `rate_limited`. Rate limits: trade messages 10/s per client, `t_invite` 1 per 5 s.
- System-room furniture (`itemId === ''`) and placed instances are never offerable.

### 6. Messages

Client → server: `t_invite {id}`, `t_respond {ok}`, `t_offer {slots, coins}`, `t_accept`,
`t_confirm`, `t_cancel`, `t_report {note?}`.
Server → client: `t_incoming {from, handle}`, `t_waiting {to}`, `t_state {partner: {id, handle},
you: Offer, them: Offer, acceptedYou, acceptedThem, confirmAt}` where each offer slot is resolved
with `name` and `serial`, and `t_done {ok, code?}`.

### 7. UI

- **Trade** button in `client/src/ui/ProfileSheet.tsx` next to the duel button.
- `client/src/ui/TradeWindow.tsx` inside the existing `VipModal` shell; its own
  `client/src/ui/trade.css` (not `styles.css`, to avoid merge conflicts with other sessions).
- Two columns "You" / partner, 9 slots each; an inventory picker listing stackable items with
  quantity steppers and unplaced instances with `#serial` badges (reusing the BuildBar `Thumb`
  preview pattern); coin input; Accept → Confirm with a 3 s countdown ring; warning
  "Check items carefully — trades are final"; 🚩 Report in the header. Slots that changed in the
  last 2 s flash so a last-second swap is visible.
- Incoming invite popup: "{handle} wants to trade" with Accept / Decline.

## Testing

- `server` vitest (TradeBook, fake clock): invite TTL, accept reset on offer change, confirm
  countdown, idle timeout, leave.
- `server` vitest (PGlite `openTestDb`): `executeTrade` happy path (coins + stack + LTD instance
  with serial preserved), insufficient coins rollback, placed-instance rollback, stack shortfall
  rollback, trade log row written, `db.transaction` rollback leaves no partial writes.
- Gate helper unit test (prod on / dev off / TRADE_GATES=off).
- `client/scripts/smoke-trade.mjs`: two users in one room, A gives coins + a stack + an instance,
  B gives coins; both confirm; balances, inventories and instance ownership match afterwards; a
  second trade where A's instance gets placed mid-trade fails cleanly.

## Out of scope

Owner settings UI for `trade_enabled`, bet escrow, cross-room or offline trades, dragon pet
(Stage 3).
