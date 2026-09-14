# Duel HD: staked rock-paper-scissors with an animated arena

Status: approved ("Approve"). User instruction: "make sure the duel is hd and high quality and very playable good graphics and animations".

## Scope

In scope:

1. A big animated reveal where the two characters fight.
2. A coin wager (stake) held in escrow by the server.
3. Polish, sound and a mobile layout.

Out of scope: best of 5, rematch, spectators.

Chosen look, approach "A": the arena is DOM + SVG + one Canvas2D particle layer inside the existing `VipModal`. It does **not** use pixi. A second pixi `Application` breaks shared textures (see `client/src/game/instance.ts`, one Game per page).

## Today (baseline)

- `server/src/duel.ts`: `DuelBook` is a pure state machine with an injected clock. `INVITE_TTL_MS` 30 s, `PICK_TTL_MS` 20 s, `WIN_AT` 2. `sweep()` forfeits slow pickers and ends a duel once `round > 6`. `DUEL_REWARD` is 25.
- `server/src/GameRoom.ts`: handlers `duel_invite`, `duel_accept`, `duel_decline`, `duel_pick`, `duel_end` (~lines 406-454). `sendRound` (~853) pays `DUEL_REWARD` to the winner. `botPick` (~1019). `onLeave` tells the peer `duel_end {reason:'left'}`. The 5 s sweep interval is at ~403.
- Client: the `DuelInfo` / `IDLE_DUEL` store (`client/src/store.ts`) and the `Game.ts` actions (~223-239) and `onDuel*` handlers (~370-384). Each reveal auto-advances after a fixed 1600 ms `setTimeout`. `DuelUI.tsx` draws emoji hands inside `VipModal` + `PlayersVs`.
- Audio: `client/src/audio.ts` synthesises every sound with WebAudio (`tone`, `noise`). There is no mute setting yet.

## 1. Flow and visuals

### 1.1 Challenge (stake picker)

- The "challenge to a duel" button in `ProfileSheet` opens a **stake picker** inside the same sheet. It has chips for **0 / 25 / 50 / 100 / 250 / 500** coins. Chips above your coin balance are disabled. Chip 0 reads "free".
- The line under the chips shows the pot ("pot 100 coins"), or for stake 0 "winner earns 25 coins". A **send challenge** button sends `duel_invite {to, stake}`.
- If the target is a local bot (roster `userId` starts with `bot:`), only 0 is enabled and a note says "locals duel for fun: no stakes".
- The **invitee popup** shows the stake prominently: a gold badge "stake 50 · pot 100", or "free duel · winner earns 25". If their balance is below the stake, **accept** is disabled and the popup says "not enough coins". They can still pass.

### 1.2 Arena layout

- Inside `VipModal`, widened for the duel (max 720 px on desktop) via a new optional `cardClassName` prop.
- Left side is **you**, right side is the **opponent**. Both avatars are drawn large and full body from the LPC sheets, reusing `AvatarPreview` (`focus="full"`). They use an integer scale, **3×** on desktop (192 px) and **2×** at ≤480 px (128 px), with `image-rendering: pixelated`. Left faces right (`dir=1`), right faces left (`dir=3`).
- The HUD row holds your two score pips, "ROUND n" with the pot ("POT 100" or "WINNER +25"), and the opponent's two pips.
- **Pick controls:** three big vector **SVG** hand buttons (rock, paper, scissors; no emoji) and a circular timer ring with the seconds left.
  - Round 1's ring lasts 20 s. Later rounds last 20 s − 1.8 s, because the server's pick clock restarts when the previous round resolves, and the reveal uses that time.
  - Keys 1/2/3 and R/P/S also pick.
- **After picking:** your hand button locks with a glow and the others dim. A "thinking…" dot bubble shows over the opponent until the round resolves.

### 1.3 Reveal timeline (≈1.8 s per round, binding)

| t (ms) | Phase | What happens |
| --- | --- | --- |
| 0–600 | `count` | Word beats "ROCK" (0), "PAPER" (200), "SCISSORS" (400). Both fists pump/shake at their sides; a tick sound plays on each beat. |
| 600–850 | `shoot` | "SHOOT!". Both hands swap to the real picks and slam to the centre (whoosh). |
| 850–1050 | `clash` | White clash flash, impact sparks (particles), small screen shake. |
| 1050–1650 | `resolve` | The winner's hand pushes through and the loser's hand cracks and flies away. The winning avatar lunges; the losing avatar flashes red with knockback and a "-1" pop. A caption says who took the round. **Draw:** hands bump back and a grey "DRAW" stamp lands. |
| 1650–1800 | `settle` | Hold. |
| 1800 | `done` | The client advances: next pick, or the result screen. |

- The client must not start the next pick until the reveal finishes. The fixed 1600 ms auto-advance is replaced by the timeline's completion callback (`duelRevealDone`). The total stays ≤ ~2 s so the 20 s server pick timer is not eaten.
- The timeline is a pure function of elapsed time (`revealFrame`, `cuesBetween`) driven by `requestAnimationFrame` through a `RevealRunner`. A hidden tab that resumes late fires every missed cue in order and completes immediately.
- The final round's reveal plays in full before the result screen.

### 1.4 Result

- **Winner:** "VICTORY", avatar victory bounce, confetti, and a coin shower. A coin counter counts up the payout over 1.2 s with coin ticks, then the victory fanfare.
- **Loser:** "DEFEAT", avatar slumps.
- **Draw at the cap:** "DRAW", with "stakes returned" for a staked duel.
- A net line shows the change: win "+stake net", loss "−stake", or the free "+25".
- A **back to room** button closes the arena.
- If a staked opponent forfeits or leaves mid-duel, you go straight to the result screen as the winner ("they walked out: the pot is yours").
- World emotes stay as they are: after each round the local player's emote pops (win 0, lose 2, draw 3), and `duel_accept` broadcasts emote 0.

### 1.5 Sound

New WebAudio synth sfx in `client/src/audio.ts`:

- `duelTick(i)` for the countdown ticks
- `whoosh`, `clash`
- `roundWin`, `roundLose`, `roundDraw`
- `fanfare` (victory), `defeat`
- `coinCount`

There is no existing mute setting. A module-level flag `sfxMuted()` / `setSfxMuted(v)` is persisted in `localStorage['dovey.sfxMuted']` with try/catch. `tone` and `noise` return early while muted, so the flag silences every UI sfx. A small speaker toggle (inline SVG) sits in the arena header through `VipModal` `headerExtra`.

### 1.6 Mobile and accessibility

- At ≤480 px, `VipModal` already goes full screen; the header and footer use safe-area padding. Hand buttons are **≥96 px**. The avatar stage stacks above the hand row, and the stage padding respects `env(safe-area-inset-*)`.
- `prefers-reduced-motion: reduce` disables screen shake and particles (`FxLayer` no-ops) and all CSS keyframe motion. The timeline, the word changes and the result still show.
- Hand buttons have `aria-label`/`aria-pressed`, the timer has `role="timer"`, and the stake chips are a labelled group.

### 1.7 Code layout

| File | Role |
| --- | --- |
| `client/src/ui/duel/DuelArena.tsx` | every non-idle phase: invite panels, arena, reveal, result |
| `client/src/ui/duel/HandIcon.tsx` | SVG rock/paper/scissors hands, optional crack overlay |
| `client/src/ui/duel/StakePicker.tsx` | stake chips + send |
| `client/src/ui/duel/useDuelTimeline.ts` | pure reveal timeline + `RevealRunner`, `countUp`, `pickRingMs`, React hooks |
| `client/src/ui/duel/stakes.ts` | pure `stakeChoices`, `canCover`, `resultCoins`, `isBotUser` |
| `client/src/ui/duel/duelFlow.ts` | pure store transitions `applyRound`, `afterReveal`, `applyEnd` |
| `client/src/game/duelFx.ts` | Canvas2D particles: pure `stepFx` + `FxLayer` DOM driver |
| `client/src/ui/duel/duel.css` | all arena styles, imported by the components |
| `client/src/ui/DuelUI.tsx` | thin wrapper: `phase === 'idle' ? null : <DuelArena/>` |
| `shared/src/duel.ts` | `DUEL_STAKES`, `isDuelStake`, `DUEL_REWARD`, `DUEL_MAX_ROUNDS`, `DUEL_PICK_MS`, `duelPrize` |

Do **not** add rules to `client/src/styles.css`, which another session edits. The old `.duel__*` / `.hand` rules there stay, unused. New classes use the `dhd` prefix, which has no collisions.

## 2. Server: wager and escrow

### 2.1 Protocol

| Message | Direction | Payload |
| --- | --- | --- |
| `duel_invite` | c→s | `{to, stake}`. `stake` missing = 0. Must be an integer in {0,25,50,100,250,500}, else `sys bad_request`. |
| `duel_incoming` | s→invitee | `{from, handle, stake}` |
| `duel_ringing` | s→inviter | `{to, stake}` |
| `duel_start` | s→both | `{peer, handle, you, stake}` |
| `duel_round` | s→both | `{winner, picks, score, done, stake, pot}` (`pot` = 2×stake) |
| `duel_end` | s→peer/both | `{reason, pot}`. `reason` ∈ `declined` \| `insufficient` \| `failed` \| `forfeit` \| `left`. `pot` = coins credited to the recipient because of this end (0 when none). |
| `duel_over` | s→room | unchanged `{a, b, winner}` |
| `sys` | s→c | new codes `bot_no_stake` ("locals only duel for fun, no stakes") and `not_enough_coins` ("not enough coins") |

### 2.2 Rules

- **Invite:** the stake is validated with `isDuelStake`.
  - A staked invite to a bot is refused with `sys bot_no_stake`. Bots accept only stake 0 and keep today's auto-accept.
  - An inviter whose balance is below the stake is refused with `sys not_enough_coins`. Invites are keyed by invitee as today, and the stake rides on the invite. Re-inviting the same person replaces the stake.
- **Accept (stake > 0):** the room debits **both stakes in ONE database transaction** (`repo.escrowDuel`), all-or-nothing.
  - If either side can't pay, nobody is charged, the duel is removed, and both get `duel_end {reason:'insufficient', pot:0}`. The client toast says "duel cancelled: not enough coins".
  - On success `Duel.paid = true`. Both get a `coins` message with the new balance (`earned: 0`, so no "+" toast), then `duel_start`.
  - If a DB error throws, the duel is removed and both get `duel_end {reason:'failed'}`.
  - If either person left while the escrow was in flight (the duel is no longer in the book), the stakes that were taken go straight back to both (no log row).
- **Win** (`done` by score): the winner is credited the pot (2×stake). **Stake 0 keeps today's fixed `DUEL_REWARD` 25.**
- **Round cap:** a duel still undecided when `round > DUEL_MAX_ROUNDS` (6) ends. This applies to both `pick()` and `sweep()`; today only `sweep` caps, which lets endless draws lock a stake forever.
  - At the cap, **tied score = draw → both stakes refunded** (free duel: nothing).
  - An untied score at the cap is a normal win.
- **Forfeit** (`duel_end` from a player) or **leave/disconnect** (`onLeave`) mid-duel with stake > 0 and paid: the opponent is credited the pot and gets `duel_end {reason:'forfeit'|'left', pot}`. Free duels credit nothing on a walkout, as today.
- **Log:** every escrowed staked duel that settles writes one `duels` row: `a_id, b_id, stake, winner_id` (nullable), `outcome` (`win|draw|forfeit|left`), `room_id`, `at`. Free duels are not logged.

### 2.3 Where the logic lives

- `server/src/duel.ts` stays pure.
  - `Duel` gains `stake`, `paid`, `users: [string, string]` (account ids filled in by GameRoom at accept).
  - `DuelBook.invite(from, to, stake = 0)`, `pending(to)`, `sideOf(id)`.
  - `duelSettlement(d, end): Settlement` maps `{kind:'done', score}` or `{kind:'forfeit'|'left', quitter}` to `{outcome, winner, credits:[{side, amount}], log}`.
  - Everything is unit-tested with a fake clock.
- `server/src/repo.ts`: `escrowDuel(aId, bId, stake)` and `settleDuel(input)`. Both run inside `db.transaction`, and all queries inside go through the `tx` handle (`new Repo(tx)`).
- `server/src/GameRoom.ts` wires messages → book → settlement → repo, via a new `payDuel(d, s)` and `quitDuel(id, kind)`.

### 2.4 Shared prerequisite: `Db.transaction`

`Db` gains `transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>`, implemented with PGlite `pg.transaction()` for both `openDb` and `openTestDb`. PGlite has a single connection, so a hand-rolled `BEGIN/COMMIT` through `query()` would interleave with other rooms' statements. Inside `fn` only `tx` may be used; an outer `db.query` would wait on PGlite's mutex until the transaction ends, which deadlocks. A nested `tx.transaction(fn)` joins the open transaction.

The trading build (`docs/superpowers/specs/2026-09-14-trade-stage2-design.md`) needs the same helper. The duel plan's first task is idempotent: it checks for `transaction` on `Db` and only adds what is missing. Its tests live in `server/src/db.transaction.test.ts`.

### 2.5 Schema

```sql
create table if not exists duels (
  id serial primary key,
  a_id text not null references users(id),
  b_id text not null references users(id),
  stake int not null,
  winner_id text references users(id),
  outcome text not null,
  room_id text,
  at timestamptz not null default now()
);
create index if not exists duels_at on duels(at);
```

## 3. Testing

- **Unit tests for `duel.ts`** (`server/src/duel.test.ts`):
  - the stake rides from invite to duel
  - the pick-path and sweep-path round cap ends a tied duel
  - settlement for: staked win (pot), free win (25), draw-at-cap refund, free draw, forfeit, leave, and a staked-but-unpaid walkout (nothing)
- **Shared** (`shared/src/duel.test.ts`): `isDuelStake`, `duelPrize`.
- **`Db.transaction`** (`server/src/db.transaction.test.ts`): commit returns the value, throw rolls back, a failing statement rolls back.
- **Repo** (`server/src/repo.duel.test.ts`, `openTestDb`):
  - staked escrow success
  - insufficient funds on either side → no partial debit (rollback)
  - pot payout, draw refund
  - `duels` log row; free duels are not logged
  - a failed log insert rolls the payout back
- **Client unit tests:**
  - `useDuelTimeline.test.ts`: phase timings, cues, runner with an injected clock including a late resume, `countUp`, `pickRingMs`
  - `duelFx.test.ts`: particle step, ttl, dt clamp, cap, shake decay
  - `stakes.test.ts`: StakePicker disabling logic, cover check, result coins
  - `duelFlow.test.ts`: round → reveal → pick/over, forfeit win, toasts
- **`client/scripts/smoke-duel.mjs`** against a server on **port 2597**:
  - Two users with fixed-per-run tokens via `POST /api/me` join `gameden`. A invites B for 50, B accepts, both pick (A rock, B scissors) until done.
  - Assert A +50 net and B −50 net from `/api/inventory`, minus trickle `coins` messages.
  - A staked forfeit pays the stayer.
  - B is drained below 500 via `/api/shop/buy`. A 500 invite that B accepts is cancelled `insufficient` and nobody is charged.
  - A broke inviter gets `not_enough_coins`; a bad stake gets `bad_request`; a lobby bot refuses a stake with `bot_no_stake`.
  - Never use 5173/2567. Worktree paths containing `/.claude/` make express `sendFile` 404, so a browser run points `CLIENT_DIST` at a symlink outside the dot path.
- **Manual desktop browser check:** arena, reveal choreography, result, sfx + mute toggle, reduced motion, and a 400 px width.

## 4. Risks and decisions

- The pick-path round cap is new behaviour (§2.2), added so a stake can never be locked by endless draws.
- `won: null` now means draw (previously a draw showed as a loss).
- The mute toggle silences all synth UI sfx, not only duel sounds. It is a single global flag.
- A leave during an in-flight escrow refunds without a log row.
- A same-account duel from two tabs is not blocked. It is pre-existing and nets zero on stakes.
