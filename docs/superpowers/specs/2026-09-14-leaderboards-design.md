# Leaderboards — Design

Status: approved ("Approve both", 2026-09-14). Binding for the implementation plan
`docs/superpowers/plans/2026-09-14-leaderboards.md`.

User's instruction: "Add video call with friends. also add leaderboards page to show who is richest in
game and in assets and online time." This spec covers the leaderboards half; friend calls are in
`2026-09-14-friend-calls-design.md`.

## Goal

A public `/leaderboards` page, in the Leypark pasar-malam night style, that ranks players on three
boards:

| Tab (label) | Board | Value |
| --- | --- | --- |
| **Paling Kaya** | `coins` | `users.coins` |
| **Harta** | `assets` | asset value in coins (definition below) |
| **Kaki Lepak** | `timeWeek` / `timeAll` | online minutes, sub-toggle **Minggu ini** (this week) / **Sepanjang masa** (all time) |

## Non-goals

- No history, charts, seasons or rewards for ranking.
- No per-room or friends-only boards (friends-only can come after d7's friends feature ships).
- No multi-process cache; like `registry` and `presence`, the cache is in-process.
- Coins are not part of asset value; asset value is not part of coins.

## Existing building blocks (verified)

| Need | Where |
| --- | --- |
| Coins | `users.coins int not null default 1500` (`COLUMNS` in `server/src/db.ts`) |
| Stackable furniture | `inventory(user_id, def, qty)` |
| Instance furniture (LTD + chance) | `items(id, def, owner_id, serial, placed_room)`; `serial` is non-null only for LTD |
| Prices | `FurnitureDef.price` (9th arg of `def(...)` in `shared/src/furniture.ts`; `0` = not sold), `FurnitureDef.ltd` cap |
| Coin trickle | `GameRoom.onCreate`, `this.clock.setInterval(..., 60_000)` crediting `COINS_PER_MINUTE` to each `this.clients` entry with `client.auth` |
| System user | `ensureSystemRooms()` inserts a `users` row with `handle = SYSTEM_HANDLE` (`'dovey'`, `shared/src/lobby.ts`) — must be excluded |
| Bots | `PERSONAS` in `server/src/bots.ts` have ids `bot:*` and live only in `state.players`; they are never `users` rows and never `this.clients`, so they cannot appear |
| Token-in-body POST | `tokenOf(req.body)` + `repo.userByToken` in `server/src/api.ts` |
| Avatar in payloads | serialized string (`serializeAvatar(normalizeAvatar(row.avatar))`), parsed client-side with `parseAvatar` |
| Head portrait | `AvatarPreview` with `focus="head"` (`client/src/ui/AvatarPreview.tsx`) |
| Routes | `client/src/router.ts` (`/`, `/play`, `/r/:slug`), split in `client/src/Root.tsx`; the server already serves the shell for any non-`/api/` path |
| Migrations | `COLUMNS` array, each entry applied only if `information_schema.columns` lacks it |

## Definitions

### Asset value

```
assets(user) = Σ inventory.qty × price(def)                       (qty > 0)
             + Σ items owned by user × price(def) × (serial is not null ? 3 : 1)
```

- Placed and unplaced instances both count (`placed_room` is ignored).
- LTD instances (`serial is not null`) count at **3×** price.
- Defs with `price = 0` count 0; defs unknown to the current catalog count 0.
- Prices come from the TypeScript catalog (`FURNITURE`), passed into SQL as a JSON object
  `{ [defId]: price }` for defs with `price > 0` (`jsonb_each_text`), so catalog price changes apply
  without a migration.

### Online time

- New columns (via `COLUMNS`):
  - `users.play_minutes int not null default 0` — DDL
    `alter table users add column play_minutes int not null default 0`. **Identical** to the entry
    in the trading stage 2 design (`feat/trade-duel`, `docs/superpowers/specs/2026-09-14-trade-stage2-design.md`).
    The `COLUMNS` check makes a second identical entry a no-op at runtime, but the entry must appear
    **only once in code**: whichever feature lands second reuses the existing entry.
  - `users.play_week int not null default 0`
  - `users.play_week_start date` (nullable)
- The "week" starts Monday 00:00 in Asia/Kuala_Lumpur (UTC+8, no DST). Computed in TypeScript
  (`klMonday(now)` → `'YYYY-MM-DD'`) and passed to SQL, so tests inject the date.
- Increment: in the existing 60 s trickle, every connected **human** user (a `client.auth` user;
  bots are never clients) gets `play_minutes + 1` and a weekly +1 with **lazy reset**: if
  `play_week_start` is null or before the current Monday, `play_week = 1` and
  `play_week_start = current Monday` (equivalent to "set to 0 and the Monday first, then +1").
- One minute per user per tick even with several sessions/rooms open: an in-process gate lets a
  user be counted at most once per 50 s across all rooms.
- If the trading feature already increments `play_minutes` in the trickle, that increment is
  replaced by the leaderboard one (never both).
- Reading `timeWeek`: `play_week` if `play_week_start >= current Monday`, else 0.

### Privacy

- `users.hide_rank boolean not null default false`.
- Hidden users are excluded from every board and from the rank counts of others.
- Toggle "Sembunyi dari leaderboard" lives on the leaderboards page itself, in the "Kedudukan kau"
  footer (the only self-settings surfaces, `Customizer.tsx` and the onboarding flow, belong to other
  sessions; `ProfileSheet` shows other people). It calls `PATCH /api/me {token, hideRank}`.
- Hiding/unhiding invalidates the board cache so the change shows immediately.

## API

### `GET /api/leaderboards`

```ts
type Row = { rank: number; handle: string; avatar: string; value: number };
type Boards = { generatedAt: string; coins: Row[]; assets: Row[]; timeWeek: Row[]; timeAll: Row[] };
```

- Top 50 per board, `value > 0` only, ordered `value desc, handle asc`; `rank` is SQL `rank()`
  (ties share a rank, next rank skips).
- Excludes `hide_rank` users and the `SYSTEM_HANDLE` user.
- Computed with SQL in `Repo.leaderboards(monday)`, cached in memory for **60 s** by a
  `LeaderboardCache` (injectable clock, concurrent callers share one in-flight load).
- `cache-control: public, max-age=30`.

### `POST /api/leaderboards/me {token}`

- Unknown/missing token → `401` (does not create a user).
- Hidden → `{ hidden: true }`.
- Otherwise `{ hidden: false, coins: Mine, assets: Mine, timeWeek: Mine, timeAll: Mine }` with
  `Mine = { rank: number | null; value: number }`; `rank = 1 + count(visible users with a strictly
  greater value)`, `null` when `value = 0`. Computed live (not cached), so it may differ from the
  cached top 50 by up to a minute.

### `PATCH /api/me` — new optional field

- `hideRank: boolean` → `Repo.setHideRank(userId, hide)`; response unchanged (`meJson`).

## Client

- `client/src/router.ts`: new `Route` variant `{ kind: 'leaderboards' }` for `/leaderboards` (and trailing slash).
- `client/src/Root.tsx`: lazy chunk for the page (no Pixi, no game store), like the landing split.
- `client/src/ui/Leaderboards.tsx` + `client/src/ui/leaderboards.css` (all styles here, none in `styles.css`).
- `client/src/leaderboards.ts`: types, fetchers, and pure formatters:
  - coins/assets: `formatCoins(12345) === '12,345'`
  - time: `formatPlayTime(750) === '12j 30m'`, `formatPlayTime(45) === '45m'`, `formatPlayTime(0) === '0m'`
- Page layout:
  - Header: Leypark brand link to `/`, "Main sekarang" button to `/play`.
  - Title "Ranking Leypark", subtitle "Siapa paling power malam ni?".
  - Tabs **Paling Kaya** / **Harta** / **Kaki Lepak**; under Kaki Lepak a segmented sub-toggle
    **Minggu ini** / **Sepanjang masa**.
  - Top 3 as stall cards (gold / silver / bronze): big head portrait, rank medal, handle, value.
  - Ranks 4–50 as a list: rank, head portrait (`AvatarPreview focus="head" animate={false}`), handle, value.
  - Empty board: "Belum ada orang lagi. Jadi yang pertama!".
  - Footer card when the viewer has a device token the server knows: "Kedudukan kau: #n" for the
    selected board ("Kedudukan kau: –" when rank is null); hidden players see "Kedudukan kau:
    Tersembunyi". The "Sembunyi dari leaderboard" toggle sits in this card.
  - "Dikemas kini HH:MM" from `generatedAt`.
- Visual style: pasar-malam night — deep plum/indigo ground, warm string-light glow, gold
  `#ffe08a → #f4b73c → #d98a1c` accents with plum `#4a1631` ink (from `client/public/leypark-mark.svg`
  on `feat/leypark`), Baloo 2 headings with a system-font fallback, Manglish copy. Single committed
  look (explicit colours, no theme switching). Works at 400 px (cards stack, list stays one column).

## Links

- Landing (`client/src/ui/Landing.tsx`, dovey or Leypark version): nav item **Ranking** → `/leaderboards`,
  added to the header nav (`.lp-nav__links`) and the footer nav.
- In game: 🏆 trophy button in `client/src/ui/RoomBar.tsx` `.roombar__nav` tray (after share, before
  the separator) → `/leaderboards`. New `trophy` icon in `client/src/ui/Icon.tsx` `PATHS`, added after
  `pencil` (not next to `home`).
- **Coordination with jomville-d7 (friends UI):** d7 claims the App.tsx `.tray` slot between the shop
  (`bag`) and build (`hammer`) buttons, the spot after `<VendingSheet />` for `<FriendInvitePopup />`,
  the sheet-chain slot after `profile ? <ProfileSheet />`, and the `friends` icon next to `home`. The
  leaderboards feature touches none of these (App.tsx is not modified at all).

## Error handling

- API failure on the page: "Alamak, tak dapat load ranking. Cuba lagi." with a retry button.
- `/api/leaderboards/me` 401 or network error: footer hidden.
- Toggle failure: revert the checkbox and show the error line.

## Testing

- Repo/SQL (`openTestDb`): asset value with inventory + instances, LTD at 3×, price-0 defs count 0,
  hidden users and the system user excluded, rank ties, `leaderboardRanks` incl. hidden and zero values,
  weekly reset at the Monday boundary with injected dates, `klMonday` at the KL midnight edge,
  once-per-50 s play-minute gate.
- API: `LeaderboardCache` TTL and in-flight sharing with an injected clock; HTTP test of the three routes
  on port 2596 (cache hit after hide toggle is invalidated).
- Client unit: `formatCoins`, `formatPlayTime`, router variant.
- Manual browser check: page at 1280 px and 400 px, tabs, sub-toggle, footer rank, hide toggle,
  landing Ranking link, in-game 🏆 button.

## Risks

- Asset SQL scans `inventory` and `items` fully; fine at current scale behind the 60 s cache. If it
  grows, materialize per-user asset value on write.
- `trade-stage2` and this feature both add `play_minutes`; resolved by the single-entry rule above.
