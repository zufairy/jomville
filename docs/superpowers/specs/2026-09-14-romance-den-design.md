# Romance Den + VIP Game Popup — Design

Date: 2026-09-14
Status: approved in chat (approach A), pending spec review

## Goal

1. Redesign game popups (Game Den, Duel, new Romance) as a premium "Neon arcade VIP" modal with a clear ✕ close, an Exit Game button, and avatar portraits of every player in the match.
2. Add voice-required romantic 2-player games, boy+girl pairing only: **Voice Truth or Dare**, **Draw & Guess**, **20 Questions Blind Date**.
3. A mutual "Match" at game end unlocks persistent private chat (DM) and an optional persisted couple status.

## Non-goals

- No video requirement (voice only; existing call video toggle still usable).
- No saved drawings, no anniversaries, no couple rooms/furni.
- No change to Love Meter.

## Existing building blocks

| Need | Existing code |
|---|---|
| Voice | `client/src/call.ts` CallManager (WebRTC P2P, `toggleMic`, `startVad`), `server/src/calls.ts` CallBook, `GameRoom.ts:309-352` |
| Gender | `AvatarConfig.body` (`'male' \| 'female'`, `shared/src/avatar.ts:19`) |
| Persistence | PGlite/Postgres, `server/src/db.ts`, `server/src/repo.ts` (coins) |
| Remote avatars | `Player.avatar` in room state, `client/src/net.ts:177` |
| Portrait render | `client/src/ui/AvatarPreview.tsx` |
| Match pattern | `shared/src/tableGames.ts`, `TableGameUI.tsx`, `tg_*` messages |
| Chat safety | `shared/src/chat.ts` sanitize + rate limit |
| Blocks | block list used by calls |

## Staging

1. **Stage 1 — VIP modal:** `VipModal`, `PlayerVsCard`; migrate `TableGameUI` and `DuelUI`.
2. **Stage 2 — Romance core:** queue, mic gate, match lifecycle, Voice Truth or Dare.
3. **Stage 3 — More games:** Draw & Guess (stroke relay), 20 Questions Blind Date.
4. **Stage 4 — Match & couples:** mutual match, DM unlock, couple status, DM panel, profile badge.

Each stage ships independently and is playable.

## Components

### Shared — `shared/src/romance.ts`

- `RomanceKind = 'tod' | 'draw' | 'blind'`.
- Content lists (PG-13): truth prompts, dares, draw words (rose, date, kiss, picnic, …), dream-date cards (≥ 12).
- `laneFor(avatar): 0 | 1 | null` — male → 0, female → 1, otherwise null. `canQueue(avatar)` = `laneFor(avatar) !== null`.
- Pure reducers `(state, action, rng, now) => state | error`:
  - **tod**: 6 turns alternating. `spin` → server picks truth|dare + prompt; active player answers aloud; partner sends `rate{hearts:1..3}`; `skip` allowed (0 hearts, max 2 skips per player).
  - **draw**: 6 rounds, roles swap. Drawer gets a word; 60 s round timer; drawer confirms `got_it` when partner guesses aloud (points scaled by remaining time); `pass` ends round with 0.
  - **blind**: 2 rounds, roles swap. Holder gets secret card from 6 visible options; asker asks yes/no aloud; holder taps `yes|no` (max 20 questions); asker `guess{cardId}` — correct = points scaled by questions left; wrong or 20 used = 0.
- `chemistry(state): 0..100` from total points vs max.
- `redact(state, viewerSeat)` hides secret word/card from non-owner.

### Server

- `server/src/romance.ts` — `RomanceBook` (plain class, injected clock/rng for tests):
  - Lanes per kind: `Map<kind, [string[], string[]]>`.
  - Match phases: `mic → playing → matchPrompt → done`.
  - Timers: mic grace 20 s; mute pause 15 s then end; per-game turn timers.
  - Never pairs blocked users; one queue/match per user.
- `server/src/couples.ts` + `db.ts` migrations:
  - `couples(id serial pk, user_a text, user_b text, since timestamptz)` plus `couple_members(user_id text pk, couple_id int)` to enforce one couple per user.
  - `dm_unlocks(user_a text, user_b text, created_at timestamptz)`, pk `(user_a, user_b)` with `user_a < user_b`.
  - `dm_messages(id serial pk, from_id text, to_id text, body text, at timestamptz)`, index on ordered pair + `at`.
- `GameRoom.ts` handlers: `rm_queue`, `rm_cancel`, `rm_mic`, `rm_action`, `rm_stroke`, `rm_match`, `rm_leave`, `couple_accept`, `couple_break`, `dm_send`, `dm_history`.
- Outgoing: `rm_status`, `rm_state`, `rm_stroke`, `rm_end`, `rm_match_result`, `rm_error`, `couple_offer`, `couple_state`, `dm`, `dm_history`.

### Client

- `ui/VipModal.tsx` — shared shell: dark glass panel, gold trim, neon pink accent, header (title, Report/Block slot, ✕), body, footer (Exit Game). Esc and ✕ close; Exit shows in-modal confirm when a match is live (no `window.confirm`). Focus trap, `aria-modal`.
- `ui/PlayerVsCard.tsx` — `AvatarPreview` portrait from remote avatar JSON, name, couple badge, mic icon, speaking glow (VAD level). Two cards with a heart/VS divider.
- `TableGameUI.tsx`, `DuelUI.tsx` — wrapped in `VipModal` + `PlayerVsCard`; rules unchanged.
- `client/src/romance.ts` — Zustand store fed by `net.ts` handlers.
- `ui/RomanceUI.tsx` — menu (3 game tiles, gender/mic requirement notice), queue, mic check, game, match prompt, results with confetti.
- `ui/romance/TruthOrDare.tsx`, `DrawGuess.tsx` (+ `DrawCanvas.tsx`, 50 ms stroke batches, normalized 0..1 coords), `BlindDate.tsx`.
- `ui/DmPanel.tsx` — unlocked partner list, thread, input.
- `ProfileSheet.tsx` — couple badge, "Message" button when DM unlocked.

## Data flow

1. **Queue:** `rm_queue{kind}` → server validates avatar body, not blocked/busy → lane. Pair lane heads → `rm_status{phase:'mic', partner:{userId,name,avatar}}` to both; server starts voice call via CallBook (`call_start`).
2. **Mic gate:** clients send `rm_mic{on}` when local audio track is live/enabled and on each change. Both on → `playing`. Not within 20 s → `rm_end{reason:'no_mic'}`. Mute mid-game → paused; 15 s → `rm_end{reason:'muted'}`.
3. **Play:** `rm_action` → reducer → `rm_state` (redacted per seat). `rm_stroke{pts,color,w}` accepted only from current drawer, ≤ 20 msg/s, ≤ 64 points, coords clamped, relayed to partner only.
4. **End:** final state carries chemistry %. Each sends `rm_match{yes}` privately. Both yes → insert `dm_unlocks`; `rm_match_result{matched:true}`; if neither in a couple, `couple_offer`. Otherwise `rm_match_result{matched:false}` (never reveals who passed). 50 coins each, once per pair per UTC day.
5. **Leave:** `rm_leave`, modal close, or disconnect → `rm_end{reason:'left'}` to both; call hung up.
6. **Couple:** `couple_accept` valid only against a server-held offer from a mutual match (expires 10 min); both must accept; transaction inserts couple only if neither has one. `couple_break` from either side. Couple state sent on join and broadcast on change.
7. **DM:** `dm_send{to,body}` requires unlock or couple, and no block either way; sanitized + rate limited via `shared/src/chat.ts`; persisted; delivered live if recipient online. `dm_history{with}` returns last 50.

## Error handling

- All `rm_*` input validated server-side; invalid → ignored + `rm_error{code}` (`need_gender`, `busy`, `not_your_turn`, `bad_action`), shown as toast.
- Disconnect during `mic`/`playing` ends match; no coins.
- Couple/DM DB writes in transactions; failure → `couple_error` / `dm_error`, no partial state.
- Block during match ends it and deletes the pair's `dm_unlocks` row.
- Mic permission denied → mic-check screen shows reason + retry; Exit always available.

## Visual spec (Neon arcade VIP)

- Tokens in `styles.css`: `--vip-bg: rgba(18,10,28,.86)`, `--vip-gold: #e8c26a`, `--vip-pink: #ff4fa3`, `--vip-violet: #8b5cf6`, backdrop blur 14px.
- Border: 1px gold + inner glow; neon title with subtle pulse (disabled under `prefers-reduced-motion`).
- ✕ button 40×40 top-right, always visible; Exit Game full-width ghost button in footer.
- VS cards: 96px portrait on glowing ring; speaking glow = pink ring scaled by VAD level.
- Match reveal: portraits slide together, heart burst, chemistry % count-up.
- ≤ 480px: modal full-screen, cards compact side by side.

## Testing

- **Shared (Vitest):** each reducer — turn order, timers via injected clock, skip limits, scoring, chemistry bounds, redaction never leaks secrets; `laneFor`.
- **Server:** `RomanceBook` — pairing by body, never same-gender, blocked never paired, mic grace timeout, mute pause/end, leave ends both, stroke rate/size/drawer-only, unlock only on mutual match, offer expiry, one couple per user, DM gate + block, daily coin cap.
- **Client:** store handling of `rm_*` messages; `VipModal` ✕/Exit/Esc behaviour.
- **Manual:** two browsers, male + female avatars, each game end-to-end with voice.

## Open risks

- WebRTC P2P with STUN only may fail on strict NATs (existing limitation of current calls).
- `rm_mic` is client-reported; cannot prove speech. Acceptable; VAD glow gives social signal.
