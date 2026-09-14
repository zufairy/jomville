# Friend Calls — Design

Status: approved ("Approve both", 2026-09-14). Binding. The implementation plan is written later,
once its dependency (below) is on `main`. TURN provider: decided later.

User's instruction: "Add video call with friends. also add leaderboards page to show who is richest in
game and in assets and online time." This spec covers the friend-calls half.

## Goal

Call any **online friend** by voice or video from the friends list, wherever they are — the same room
or another room — in a floating video window that stays open while walking around and survives
changing rooms.

## Dependency

Build only after jomville-d7's friends feature is on `main`:

- Task 3 of `docs/superpowers/plans/2026-09-14-friends.md` (presence wired into `GameRoom.onJoin`/
  `onLeave`, REST `/api/friends*` routes) — already committed as `5745a3d`.
- Tasks 4–5 (client friends store `client/src/friends.ts`, `FriendsSheet`, `FriendInvitePopup`, HUD
  button) — **not on `main` yet**. The call buttons live in `FriendsSheet`.

## Non-goals

- Group calls; screen sharing; recording; call history.
- Multi-process signaling (like `presence`, the call book is in-process).
- Choosing or paying for a TURN provider (env-configured, decided later).

## Existing building blocks (verified)

| Need | Where |
| --- | --- |
| Same-room 1-to-1 calls | `server/src/calls.ts` `CallBook` keyed by **sessionId**, `INVITE_TTL_MS = 30_000`, `canRelay`; `GameRoom` `call_invite` / `call_accept` / `call_decline` / `call_end` / `rtc` handlers |
| Cross-room delivery | `server/src/social.ts` singleton `presence`: `join`, `leave`, `isOnline(userId)`, `where(userId) → {slug,name} \| null`, `notify(userId, type, payload)` to **all** sessions of that user |
| Friendship | `repo.areFriends(x, y)`, `repo.friendIdsOf`, `repo.friendsOf` |
| Blocks | `repo.blockPairs(userId)` (both directions); in-room `this.blocks.isHidden(a, b)` |
| Reports | `repo.report(reporterId, targetId, roomId, reason, context)`, `REPORT_REASONS` / `isReportReason` in `shared/src/safety.ts` |
| Rate limits | `RateLimiter` from `@dovey/shared` |
| Client WebRTC | `client/src/call.ts` `CallManager`, `ICE` constant (STUN-only), SAFETY TODO age gate above `CallManager`; `client/src/voice.ts` reuses `ICE`; `client/src/ui/CallUI.tsx`; call buttons in `client/src/ui/ProfileSheet.tsx` |

## Server

### State — `server/src/social-calls.ts`

Pure `FriendCallBook`, keyed by **userId** (sessions change when a user changes rooms), clock injected:

```ts
export type FriendCallState =
  | { kind: 'idle' }
  | { kind: 'ringing'; peer: string; video: boolean; since: number; initiator: boolean }
  | { kind: 'active'; peer: string; video: boolean; since: number }
  | { kind: 'rejoining'; peer: string; video: boolean; since: number; lostAt: number };

export const FRIEND_RING_TTL_MS = 30_000;
export const FRIEND_REJOIN_GRACE_MS = 10_000;

export class FriendCallBook {
  constructor(now?: () => number);
  get(userId: string): FriendCallState;
  isBusy(userId: string): boolean;                  // anything but idle
  invite(from: string, to: string, video: boolean): null | 'self' | 'busy_self' | 'busy_peer' | 'rate_limited';
  accept(callee: string): { caller: string; video: boolean } | null;
  end(userId: string): string | null;               // decline / cancel / hang up → peer to notify
  canRelay(from: string, to: string): boolean;      // active (or rejoining) pair only
  sessionLost(userId: string): void;                // last session left: active → rejoining
  sessionBack(userId: string): string | null;       // rejoined within grace → active, returns peer
  sweep(): Array<{ a: string; b: string; reason: 'timeout' | 'lost' }>;
}
```

- A user is busy in any non-idle state; `invite` to/from a busy user fails.
- Rings expire after 30 s (`sweep` → `timeout`, both notified `fcall_end {reason:'timeout'}`).
- When a user's **last** presence session leaves during an active call, the call enters `rejoining`;
  if any session of that user rejoins within 10 s, `sessionBack` restores `active` and both sides
  renegotiate; otherwise `sweep` ends it with `lost`.
- A friend call and a same-room `CallBook` call are mutually exclusive: `call_invite` rejects with
  `busy_self`/`busy_peer` when either user is busy in `FriendCallBook`, and `fcall_invite` rejects when
  either session is non-idle in its room's `CallBook`.
- Singleton `friendCalls` exported next to the class, swept by a 1 s `setInterval(...).unref()` set up
  once in the module (or `index.ts`).

### Messages (room messages, routed across rooms)

| Client → server | Checks | Server → client (via `presence.notify`) |
| --- | --- | --- |
| `fcall_invite {toUserId, video}` | auth user; `repo.areFriends`; no block either direction (`repo.blockPairs`); `presence.isOnline(to)`; rate limit (3 per 30 s per caller, and 1 per (caller, callee) per 10 s); book `invite` | callee: `fcall_incoming {from:{id,handle,avatar}, video}`; caller: `fcall_ringing {to}` |
| `fcall_accept` | book `accept` | both: `fcall_start {peer:userId, video, initiator}` (caller `initiator: true`) |
| `fcall_decline` | book `end` | caller: `fcall_end {reason:'declined'}` |
| `fcall_end` | book `end` | peer: `fcall_end {reason:'ended'}` |
| `fsig {toUserId, data}` | book `canRelay(me, to)`; `VOICE_RTC_RATE`-style limiter; payload size cap (64 KB transport already) | peer: `fsig {from:userId, data}` |
| `fcall_report {reason, note?}` | `isReportReason`; `REPORT_RATE` limiter; must be in / just ended a call with that peer | reporter: `sys {code:'reported'}`; call ended for both (`reason:'ended'`) |

- `presence.notify` delivers to every session of the user, so a user with two tabs rings in both; the
  first `fcall_accept` wins and the other tabs receive `fcall_start` for another session — the client
  ignores `fcall_start` unless it is the tab that accepted (client-side `acceptedHere` flag); the
  caller side has only the tab that invited.
- Blocking during a call (`block` handler) ends the friend call for both.
- Removing the friend ends the call (`/api/friends/remove` calls `friendCalls.end`).

### GameRoom wiring

- Thin handlers only, in a **new clearly commented block** `// ---- friend calls (cross-room)`, placed
  **after the existing `rtc` handler**, separate from d7's friends block (`friend_invite`) and from
  presence lines in `onJoin`/`onLeave`.
- `onJoin`: after d7's `presence.join(...)` line (do not edit it), call
  `friendCalls.sessionBack(user.id)`; if it returns a peer, notify both `fcall_rejoin {peer}` so the
  clients renegotiate.
- `onLeave`: after d7's `presence.leave(...)` line, if `!presence.isOnline(leaver.id)` call
  `friendCalls.sessionLost(leaver.id)` and notify the peer `fcall_hold {peer}`.

## Client

- `client/src/friendCall.ts`: `FriendCallManager` built on the same `RTCPeerConnection` flow as
  `CallManager`, addressing peers by **userId**, signaling through `fcall_*` / `fsig`.
  - Room changes are full page navigations today (`goToRoom` → `location.assign` in
    `client/src/router.ts`). While a call is active the client keeps
    `{peerUserId, handle, avatar, video, initiator}` in `sessionStorage` (key `leypark.fcall`). After
    the new page joins its room, the server's `sessionBack` sends `fcall_rejoin` to both users; the
    reloaded page restores the window in a "Menyambung semula…" state.
  - On `fcall_rejoin`: a side whose page reloaded builds a new `RTCPeerConnection`; a side whose page
    survived discards its old connection too (its remote peer is gone) and builds a new one. The
    original initiator sends a fresh offer; when only the websocket blipped and both connection
    objects survive, it sends an offer with `iceRestart: true` instead. The call must reach
    `connected` within the 10 s grace, otherwise the server ends it (`lost`) and `sessionStorage`
    is cleared. Camera/mic permission is normally remembered by the browser across the reload; if a
    prompt blocks, the grace simply expires.
- `client/src/ui/FriendCallWindow.tsx` + `client/src/ui/friend-call.css`: floating draggable window
  (pointer events, clamped to viewport, position remembered in `localStorage`), collapsible to a round
  bubble showing the friend's head portrait; controls: mute mic, camera on/off, hang up, 🚩 report
  (reason picker from `REPORT_REASONS`, sending ends the call). Persists while walking (not a sheet;
  does not take the one-sheet slot).
- `client/src/ui/FriendCallPopup.tsx`: ringing popup "{handle} panggil kau" with Accept / Decline,
  30 s countdown.
- FriendsSheet (d7): 🎙 / 📹 buttons on each online friend row, disabled when either side is busy.

## Age gate for non-friend calls

- Existing same-room `call_*` calls (sessionIds) keep working, but calling **a non-friend** requires a
  one-time confirmation "Saya 18 tahun ke atas" stored in `users.adult_confirmed_at timestamptz`
  (`COLUMNS` entry `alter table users add column adult_confirmed_at timestamptz`).
- Server: `call_invite` rejects with `adult_required` when the caller is not a friend of the target and
  has `adult_confirmed_at is null`. `POST /api/me/adult {token}` sets it to `now()` (idempotent).
- Client: ProfileSheet call buttons open the confirmation first when needed; on confirm, call the route
  then retry the invite.
- Friend calls (both `fcall_*` and same-room calls between friends) do not require it.
- Resolves the SAFETY TODO comment above `CallManager` in `client/src/call.ts` (replace it with a
  comment describing the gate).

## TURN / ICE servers

- `POST /api/ice {token}` (known user only, else 401) →
  `{ iceServers: RTCIceServer[] }` = STUN defaults
  (`stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`) plus, only when **all three** env
  vars are set, `{ urls: TURN_URLS.split(',').map(trim), username: TURN_USERNAME, credential: TURN_CREDENTIAL }`.
- `cache-control: no-store`. Credentials never appear in the repo; `server/.env` is gitignored.
- Client: `call.ts` exports `getIce(): Promise<RTCConfiguration>` fetching once (memoized promise) and
  falling back to the current STUN-only `ICE` on any error; `CallManager`, `voice.ts` and
  `FriendCallManager` use it.
- Provider examples (decide later): Cloudflare Calls TURN (short-lived credentials via API),
  Metered.ca TURN, Twilio Network Traversal Service. Short-lived credentials would later replace the
  static env credential with a per-request fetch in the same route.

## Error codes (sys / reject)

`not_friends`, `blocked_pair`, `friend_offline`, `busy_self`, `busy_peer`, `rate_limited`, `no_invite`,
`adult_required`; client shows Manglish toasts ("Kawan kau tengah sibuk", "Dia offline", ...).

## Testing

- `FriendCallBook` unit tests with an injected clock: busy both sides, invite TTL expiry at 30 s,
  accept after TTL fails, end notifies peer, `canRelay` only for the pair, rejoin within 10 s restores
  active, rejoin after 10 s ends with `lost`, mutual exclusion helper.
- Gating tests (repo + handler logic extracted into a pure `checkFriendCall(...)`): non-friends
  rejected, block either direction rejected, offline rejected, rate limits.
- `/api/ice`: no env → STUN only; partial env → STUN only; full env → STUN + TURN; 401 without a known token.
- `adult_confirmed_at`: migration applied, route idempotent, non-friend `call_invite` gated.
- Two-client smoke across two rooms (two Colyseus clients on port 2597): invite, accept, relay `fsig`,
  one client switches room, `fcall_rejoin`, end.
- Manual browser check with two browser profiles in different rooms: ring, accept, video both ways,
  collapse to bubble, walk, change room, hang up, report.

## Risks

- NAT traversal without TURN fails for some mobile networks until a provider is chosen.
- Full-page room navigation would drop calls; the plan must use in-app room switching for callers.
- Multi-process scaling needs a shared presence + call book (same limitation as friends).
