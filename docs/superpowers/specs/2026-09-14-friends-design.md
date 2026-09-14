# Friends — Design

Date: 2026-09-14
Status: approved in chat (approach A)

## Goal

1. Add friend: tap a player → send request → they accept or decline.
2. Friend list button in the HUD opens a friends sheet: friends with online status and current room, pending requests.
3. Invite a friend to your room: popup on their side (Join / Later); Join moves them into your room. Also "Join" a friend's room from the list.

## Non-goals

- Friend search by handle UI, friend codes, private messages, offline invite inbox.
- Multi-process presence (Colyseus presence/Redis). Single server process today.

## Existing building blocks

| Need | Existing code |
|---|---|
| Identity | `users` table, guest device token (`client/src/identity.ts`), `client.auth` = `User` in `GameRoom.onAuth` |
| REST pattern | `server/src/api.ts` (token in JSON body), `client/src/api.ts` `json({ token: deviceToken(), ... })` |
| Blocks | `blocks` table + `repo.block/unblock/blockPairs` |
| Room navigation | `goToRoom(slug)` in `client/src/router.ts` (`/r/<slug>`) |
| In-memory cross-room state | `server/src/registry.ts` (single process) |
| Sheets / HUD | `client/src/App.tsx` right HUD buttons, one-sheet-at-a-time pattern |
| Portraits | `client/src/ui/AvatarPreview.tsx` (`focus="head"`) |

## Components

### DB — `server/src/db.ts` (new migration)

- `friend_requests (from_id text, to_id text, created_at timestamptz default now(), primary key (from_id, to_id))`
- `friendships (user_a text, user_b text, since timestamptz default now(), primary key (user_a, user_b), check (user_a < user_b))`
- Limits (shared constants `FRIEND_LIMIT = 200`, `FRIEND_PENDING_LIMIT = 50`).

### Repo — `server/src/repo.ts`

- `requestFriend(from, to): 'sent' | 'accepted' | 'already' | 'pending' | 'blocked' | 'self' | 'limit' | 'no_user'`
  - reverse request exists → create friendship, delete both requests → `accepted`.
  - either side blocked → `blocked`.
- `respondFriend(me, from, accept: boolean): 'accepted' | 'declined' | 'no_request' | 'limit'`
- `cancelFriendRequest(me, to)`, `removeFriend(me, other)`
- `friendsOf(userId): Array<{ id, handle, avatar, since }>`
- `pendingOf(userId): { incoming: Array<{ id, handle, avatar, at }>, outgoing: Array<{ id, handle, avatar, at }> }`
- `areFriends(a, b): boolean`
- `block()` also deletes friendship and requests between the pair.

### Presence — `server/src/social.ts` (new)

- `class Presence` (exported singleton `presence`):
  - `join(userId, sessionId, room: { slug, name }, send: (type, payload) => void)`
  - `leave(userId, sessionId)`
  - `where(userId): { slug, name } | null` (most recent session)
  - `isOnline(userId): boolean`
  - `notify(userId, type, payload)` → all sessions of that user
- Pure and unit-tested with fake `send`.

### Server entry points

REST (`server/src/api.ts`), all POST with `{ token }`:
- `/api/friends` → `{ friends: [{ id, handle, avatar, online, room: { slug, name } | null }], incoming, outgoing }`
- `/api/friends/request` `{ toUserId }` → `{ result }`; on `sent` notify target `friend_request`; on `accepted` notify both `friend_update`.
- `/api/friends/respond` `{ fromUserId, accept }` → `{ result }`; on accept notify requester `friend_update`.
- `/api/friends/cancel` `{ toUserId }`, `/api/friends/remove` `{ userId }` → notify other side `friend_update`.

Room (`server/src/GameRoom.ts`, own block, not near trade/duel code):
- `onJoin`: `presence.join(...)`; notify online friends `friend_presence { id, online: true, room }`.
- `onLeave`: `presence.leave(...)`; if user now offline notify friends `friend_presence { id, online: false }`, else presence room update.
- `friend_invite { toUserId }`: must be friends (`repo.areFriends`), target online, not blocked; rate limit 1 per target per 30 s → `presence.notify(to, 'friend_invite', { from: { id, handle, avatar }, room: { slug, name } })`; reply `friend_invite_sent` or `rejected { reason }`.
- ProfileSheet needs userId of a player: `Player.userId` already in room state.

### Client

- `client/src/api.ts`: `fetchFriends`, `requestFriend`, `respondFriend`, `cancelFriend`, `removeFriend`.
- `client/src/friends.ts` Zustand store: `friends`, `incoming`, `outgoing`, `invites` (queue), `open` (sheet), `load()`, `applyPresence()`, `pushInvite()`, `dismissInvite()`.
- `client/src/net.ts`: handlers for `friend_request`, `friend_update` (→ `load()`), `friend_presence` (→ `applyPresence`), `friend_invite` (→ `pushInvite`), `friend_invite_sent`; `sendFriendInvite(toUserId)`.
- `client/src/ui/FriendsSheet.tsx`: tabs Friends / Requests (badge). Friend row: head portrait, handle, online dot, room name; buttons Invite (disabled offline or when in same room), Join (disabled offline / same room), Remove (confirm inline). Requests: Accept / Decline; outgoing Cancel.
- `client/src/ui/FriendInvitePopup.tsx`: top-center card, avatar head + "<handle> invites you to <room>", Join (→ `goToRoom(slug)`) / Later; auto-dismiss 20 s; one at a time.
- `client/src/App.tsx`: 👥 HUD button with incoming-count badge; sheet in the one-sheet pattern.
- `client/src/ui/ProfileSheet.tsx`: "Add friend" / "Requested…" / "Friends ✓" (Accept if they asked you). Not shown for bots (`userId` starts with `bot:`) or self.

## Flows

1. **Add:** ProfileSheet → `/api/friends/request` → target gets `friend_request` toast + badge; sheet Requests tab shows it.
2. **Accept:** `/api/friends/respond accept` → both lists reload via `friend_update`.
3. **Invite:** FriendsSheet Invite → `friend_invite` room message → server checks → target popup → Join → `goToRoom(slug)`.
4. **Join friend:** FriendsSheet Join → `goToRoom(friend.room.slug)`.
5. **Presence:** friend joins/leaves/changes room → `friend_presence` updates dot + room live.

## Error handling

- REST returns `{ result }` codes; client toasts: `blocked` "can't add this player", `limit` "friend list full", `already` "already friends", `pending` "request already sent".
- Invite rejections: `not_friends`, `offline`, `rate_limited`, `blocked` → toast.
- Room full on Join → existing room join error path.
- All server inputs validated (ids are strings, exist, not self).

## Testing

- `server/src/repo.test.ts`: request/accept/decline/cancel/remove, reverse request auto-accept, blocked, self, limits, block removes friendship.
- `server/src/social.test.ts`: presence join/leave multi-session, where/isOnline, notify fan-out.
- `client/src/friends.test.ts`: store applyPresence, invite queue ordering/dismiss.
- Manual: two browsers (two guests), add → accept → invite → join; offline greys buttons.

## Risks

- Presence is per process; fine now, must move to Colyseus presence if the server is scaled out.
- Another session edits `GameRoom.ts` (trade handlers) on its own branch; friends code stays in its own block to keep merges clean.
