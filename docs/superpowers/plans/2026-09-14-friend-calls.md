# Friend Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voice/video call any online friend from the friends sheet, across rooms, in a floating draggable window that survives walking and room changes (10 s rejoin grace); TURN-capable ICE config from the server; one-time 18+ confirmation before calling non-friends in the same-room call flow.

**Architecture:** A pure `FriendCallBook` (state keyed by userId, injected clock) and a `FriendCallService` (friend/block/online gating, rate limits, notifications through injected deps) live in `server/src/social-calls.ts`; `index.ts` binds the singleton `friendCalls` to `repo` + `presence` and starts a 1 s sweep. `GameRoom` gets a separate thin `fcall_*`/`fsig` block. `server/src/ice.ts` builds ICE servers from env for `POST /api/ice`. Client: `FriendCallManager` + `useFriendCall` store in `client/src/friendCall.ts` (sessionStorage resume across page-reload room changes), `FriendCallWindow`, `FriendCallPopup`, `FriendCallButtons` (inserted into d7's `FriendsSheet` rows), `AdultGate`, CSS in `client/src/ui/friend-call.css`.

**Tech Stack:** Node ≥ 22, pnpm 11, Express 5, Colyseus 0.16 (+ colyseus.js 0.16 for the smoke script), PGlite, Vitest 2, React 18, Zustand 5, WebRTC.

**Spec:** `docs/superpowers/specs/2026-09-14-friend-calls-design.md` (depends on `docs/superpowers/specs/2026-09-14-friends-design.md`, implemented on `main` through `74b7445`)

## Global Constraints

- Run every command from the worktree root `/Users/along/Documents/GitHub/jomville/.claude/worktrees/social` (branch `feat/social`, which contains `main` incl. d7's friends UI `74b7445`, d7's friends fix pass `63a940a` and the Leypark merge). Run `pnpm install` once first. Stage explicit paths only; never bare `git stash`; never push.
- Node ≥ 22, pnpm 11.
- Ports: dev server **2597** only; tests never bind TCP ports (API tests use a unix socket), and **2596** is reserved for the leaderboards API test. Never 5173 or 2567.
- The worktree path contains `/.claude/`; `express.static` refuses dot-directories, so serve the built client through a symlink outside it: `ln -sfn "$PWD/client/dist" /tmp/leypark-social-dist` and `CLIENT_DIST=/tmp/leypark-social-dist`.
- Exact values: ring TTL `FRIEND_RING_TTL_MS = 30_000`; rejoin grace `FRIEND_REJOIN_GRACE_MS = 10_000`; invite rate `FRIEND_CALL_RATE = { count: 3, windowMs: 30_000 }` per caller plus 1 per (caller, callee) per `FRIEND_CALL_PAIR_MS = 10_000`; `fsig` rate `VOICE_RTC_RATE` (150 per 5 s); report rate `REPORT_RATE`; report window after a call `REPORT_AFTER_CALL_MS = 300_000`; sweep every 1000 ms; client resume max age `RESUME_MAX_AGE_MS = 15_000`; STUN `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`; env `TURN_URLS` (comma-separated), `TURN_USERNAME`, `TURN_CREDENTIAL` (all three required); sessionStorage key `leypark.fcall`; window position localStorage key `leypark.fcall.pos`.
- jomville-d7 owns the friends feature. **Do not restructure** `server/src/social.ts`, `client/src/friends.ts`, `client/src/ui/FriendsSheet.tsx`, `client/src/ui/FriendInvitePopup.tsx`, `client/src/ui/friends.css`, the friends routes in `server/src/api.ts`, the `friend_invite` block and `presence.*` lines in `GameRoom`. The only permitted touches (coordination points to tell d7 about) are:
  1. `FriendsSheet.tsx`: one import line and one `<FriendCallButtons f={f} />` element as the first child of the non-confirm button fragment in `FriendRow`.
  2. `api.ts` `/api/friends/remove`: one line `friendCalls.endBetween(u.id, other);` after `if (await repo.removeFriend(u.id, other)) presence.notify(other, 'friend_update', {});`.
- Other sessions' areas, never edit: `client/src/ui/ChatBar.tsx`, `ChatFeed.tsx`, `Customizer.tsx`, `VendingSheet.tsx`, `client/src/wear.ts`, `server/src/bots.ts`.
- `GameRoom` friend-call handlers go in their own block `// ---- friend calls (cross-room)` directly after the existing `rtc` handler, separate from the friends block.
- App.tsx: mount new components directly after `<CallUI />` (not next to `<FriendInvitePopup />`, not in the sheet chain, no new tray button).
- Call CSS goes in `client/src/ui/friend-call.css`, never `styles.css` or `friends.css`.
- Commands: `pnpm --filter @dovey/server test`, `pnpm --filter @dovey/server typecheck`, `pnpm --filter @dovey/client test`, `pnpm --filter @dovey/client typecheck`, `pnpm --filter @dovey/client build`.
- Commit messages use exactly:

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
| `server/src/social-calls.ts` | create | `FriendCallBook`, `FriendCallService`, `friendCalls` singleton, `startFriendCallSweep` |
| `server/src/social-calls.test.ts` | create | book + service unit tests |
| `server/src/ice.ts`, `server/src/ice.test.ts` | create | `iceServersFromEnv` |
| `server/src/db.ts` | modify `COLUMNS` | `users.adult_confirmed_at` |
| `server/src/repo.ts` | modify (new `// ---- call safety` section after `resolveReport`) | `isAdultConfirmed`, `confirmAdult` |
| `server/src/api.ts` | modify | `POST /api/ice`, `POST /api/me/adult`, one line in `/api/friends/remove` |
| `server/src/calls-api.test.ts` | create | routes over a unix socket |
| `server/src/index.ts` | modify | bind `friendCalls`, start sweep |
| `server/src/GameRoom.ts` | modify | `fcall_*` block, `call_invite` gates, block handler, `onLeave` hook |
| `client/src/api.ts` | modify (append `// ---- calls`) | `fetchIceServers`, `confirmAdult` |
| `client/src/call.ts` | modify | `loadIce`/`currentIce`, `setOtherCallBusy`, gate comment |
| `client/src/voice.ts` | modify | use `currentIce()` |
| `client/src/ice.test.ts` | create | ICE fallback test |
| `client/src/friendCall.ts`, `client/src/friendCall.test.ts` | create | store, storage helpers, manager, message handlers |
| `client/src/adultGate.ts` | create | pending-invite store for the 18+ gate |
| `client/src/net.ts` | modify | register `fcall_*` handlers; `sys` codes |
| `client/src/game/Game.ts` | modify | bind sender, install, `loadIce`, resume on join |
| `client/src/ui/FriendCallWindow.tsx`, `FriendCallPopup.tsx`, `FriendCallButtons.tsx`, `AdultGate.tsx`, `friend-call.css` | create | UI |
| `client/src/ui/FriendsSheet.tsx` | modify (coordination point 1) | call buttons in rows |
| `client/src/App.tsx` | modify | mount after `<CallUI />` |
| `client/scripts/friend-call-smoke.mjs` | create | two-client cross-room smoke |

---

### Task 1: FriendCallBook

**Files:**
- Create: `server/src/social-calls.ts`
- Test: `server/src/social-calls.test.ts`

**Interfaces:**
- Consumes: `RateLimiter` (`@dovey/shared`, `allow(key, now = Date.now()): boolean`)
- Produces:
  - `type FriendCallState = { kind: 'idle' } | { kind: 'ringing'; peer: string; video: boolean; since: number; initiator: boolean } | { kind: 'active'; peer: string; video: boolean; since: number; initiator: boolean } | { kind: 'rejoining'; peer: string; video: boolean; since: number; initiator: boolean; lostAt: number }`
  - constants `FRIEND_RING_TTL_MS`, `FRIEND_REJOIN_GRACE_MS`, `FRIEND_CALL_RATE`, `FRIEND_CALL_PAIR_MS`
  - `type BookInviteError = 'self' | 'busy_self' | 'busy_peer' | 'rate_limited'`
  - `class FriendCallBook { constructor(now?: () => number); get(id): FriendCallState; isBusy(id): boolean; invite(from, to, video): BookInviteError | null; accept(callee): { caller: string; video: boolean } | null; end(id): string | null; canRelay(from, to): boolean; sessionLost(id): { peer: string; held: boolean } | null; resume(id): { peer: string; video: boolean; initiator: boolean } | null; sweep(): Array<{ a: string; b: string; reason: 'timeout' | 'lost' }> }`

- [ ] **Step 0: Base check — d7's friends fix pass must be merged**

Run: `git merge main --no-edit && git merge-base --is-ancestor 63a940a HEAD && echo friends-fix-in && grep -c "notifySession\|sessions(" server/src/social.ts`
Expected: `friends-fix-in` and a count of at least `2` (`presence.sessions(userId)` and `presence.notifySession(userId, sessionId, type, payload)` exist). This plan never edits `server/src/social.ts` or the GameRoom friends block (`friend_invite`, the imported `inviteLimit`, `presence.*` lines). If `main` moved further, re-check the anchors quoted in Tasks 3–7 before editing.

- [ ] **Step 1: Write the failing tests**

Create `server/src/social-calls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FRIEND_REJOIN_GRACE_MS, FRIEND_RING_TTL_MS, FriendCallBook } from './social-calls';

const clock = (start = 1_000_000) => {
  const c = { t: start, now: () => c.t };
  return c;
};

describe('FriendCallBook', () => {
  it('rings, accepts, relays only between the pair, ends for both', () => {
    const c = clock();
    const b = new FriendCallBook(c.now);
    expect(b.invite('a', 'a', true)).toBe('self');
    expect(b.invite('a', 'b', true)).toBeNull();
    expect(b.get('a')).toMatchObject({ kind: 'ringing', peer: 'b', initiator: true, video: true });
    expect(b.get('b')).toMatchObject({ kind: 'ringing', peer: 'a', initiator: false });
    expect(b.canRelay('a', 'b')).toBe(false);
    expect(b.accept('a')).toBeNull(); // the caller cannot accept
    expect(b.accept('b')).toEqual({ caller: 'a', video: true });
    expect(b.get('a')).toMatchObject({ kind: 'active', peer: 'b', initiator: true });
    expect(b.canRelay('a', 'b')).toBe(true);
    expect(b.canRelay('b', 'a')).toBe(true);
    expect(b.canRelay('a', 'x')).toBe(false);
    expect(b.end('b')).toBe('a');
    expect(b.get('a').kind).toBe('idle');
    expect(b.get('b').kind).toBe('idle');
    expect(b.end('b')).toBeNull();
  });

  it('a user in any call is busy both ways', () => {
    const b = new FriendCallBook(clock().now);
    expect(b.invite('a', 'b', false)).toBeNull();
    expect(b.isBusy('a')).toBe(true);
    expect(b.invite('c', 'a', false)).toBe('busy_peer');
    expect(b.invite('b', 'c', false)).toBe('busy_self');
    expect(b.isBusy('c')).toBe(false);
  });

  it('rate limits invites per caller and per pair', () => {
    const c = clock();
    const b = new FriendCallBook(c.now);
    expect(b.invite('a', 'b', false)).toBeNull();
    b.end('a');
    expect(b.invite('a', 'b', false)).toBe('rate_limited'); // same pair within 10 s
    expect(b.invite('a', 'c', false)).toBeNull();
    b.end('a');
    expect(b.invite('a', 'd', false)).toBeNull();
    b.end('a');
    expect(b.invite('a', 'e', false)).toBe('rate_limited'); // 4th in 30 s
    c.t += 30_000;
    expect(b.invite('a', 'e', false)).toBeNull();
  });

  it('expires rings after 30 s', () => {
    const c = clock();
    const b = new FriendCallBook(c.now);
    b.invite('a', 'b', false);
    c.t += FRIEND_RING_TTL_MS;
    expect(b.sweep()).toEqual([]);
    c.t += 1;
    expect(b.accept('b')).toBeNull();
    expect(b.sweep()).toEqual([{ a: 'a', b: 'b', reason: 'timeout' }]);
    expect(b.isBusy('a') || b.isBusy('b')).toBe(false);
  });

  it('holds an active call for 10 s when a side loses its last session, resume restores it', () => {
    const c = clock();
    const b = new FriendCallBook(c.now);
    b.invite('a', 'b', true);
    b.accept('b');
    expect(b.sessionLost('b')).toEqual({ peer: 'a', held: true });
    expect(b.get('b')).toMatchObject({ kind: 'rejoining', peer: 'a', initiator: false });
    expect(b.isBusy('b')).toBe(true);
    expect(b.canRelay('a', 'b')).toBe(true);
    c.t += FRIEND_REJOIN_GRACE_MS;
    expect(b.sweep()).toEqual([]);
    expect(b.resume('b')).toEqual({ peer: 'a', video: true, initiator: false });
    expect(b.get('b').kind).toBe('active');
    expect(b.resume('a')).toEqual({ peer: 'b', video: true, initiator: true }); // live reconnect of the other side
    expect(b.resume('nobody')).toBeNull();
  });

  it('ends a held call after the grace, and a lost ring at once', () => {
    const c = clock();
    const b = new FriendCallBook(c.now);
    b.invite('a', 'b', false);
    b.accept('b');
    b.sessionLost('a');
    c.t += FRIEND_REJOIN_GRACE_MS + 1;
    expect(b.sweep()).toEqual([{ a: 'a', b: 'b', reason: 'lost' }]);
    expect(b.isBusy('b')).toBe(false);
    c.t += 60_000;
    b.invite('c', 'd', false);
    expect(b.sessionLost('d')).toEqual({ peer: 'c', held: false });
    expect(b.isBusy('c')).toBe(false);
    expect(b.sessionLost('zzz')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dovey/server test -- social-calls`
Expected: FAIL — `Failed to resolve import "./social-calls"`.

- [ ] **Step 3: Implement the book**

Create `server/src/social-calls.ts`:

```ts
import { RateLimiter } from '@dovey/shared';

/**
 * Friend calls: consent-gated 1-to-1 voice/video between friends in any room.
 * Keyed by userId (sessions change when someone changes rooms). In-process,
 * like presence; the server only relays signaling, never media.
 */
export type FriendCallState =
  | { kind: 'idle' }
  | { kind: 'ringing'; peer: string; video: boolean; since: number; initiator: boolean }
  | { kind: 'active'; peer: string; video: boolean; since: number; initiator: boolean }
  | { kind: 'rejoining'; peer: string; video: boolean; since: number; initiator: boolean; lostAt: number };

export const FRIEND_RING_TTL_MS = 30_000;
export const FRIEND_REJOIN_GRACE_MS = 10_000;
export const FRIEND_CALL_RATE = { count: 3, windowMs: 30_000 };
export const FRIEND_CALL_PAIR_MS = 10_000;

export type BookInviteError = 'self' | 'busy_self' | 'busy_peer' | 'rate_limited';

const IDLE: FriendCallState = { kind: 'idle' };

export class FriendCallBook {
  private state = new Map<string, FriendCallState>();
  private callerLimit = new RateLimiter(FRIEND_CALL_RATE.count, FRIEND_CALL_RATE.windowMs);
  private pairLimit = new RateLimiter(1, FRIEND_CALL_PAIR_MS);

  constructor(private now: () => number = Date.now) {}

  get(id: string): FriendCallState {
    return this.state.get(id) ?? IDLE;
  }

  isBusy(id: string): boolean {
    return this.get(id).kind !== 'idle';
  }

  invite(from: string, to: string, video: boolean): BookInviteError | null {
    if (from === to) return 'self';
    if (this.isBusy(from)) return 'busy_self';
    if (this.isBusy(to)) return 'busy_peer';
    const t = this.now();
    if (!this.callerLimit.allow(from, t)) return 'rate_limited';
    if (!this.pairLimit.allow(`${from}>${to}`, t)) return 'rate_limited';
    this.state.set(from, { kind: 'ringing', peer: to, video, since: t, initiator: true });
    this.state.set(to, { kind: 'ringing', peer: from, video, since: t, initiator: false });
    return null;
  }

  /** Callee accepts. Null when there is no live ring (an expired ring is left for sweep to report). */
  accept(callee: string): { caller: string; video: boolean } | null {
    const s = this.get(callee);
    const t = this.now();
    if (s.kind !== 'ringing' || s.initiator) return null;
    if (t - s.since > FRIEND_RING_TTL_MS) return null;
    const cs = this.get(s.peer);
    if (cs.kind !== 'ringing' || cs.peer !== callee) {
      this.state.delete(callee);
      return null;
    }
    this.state.set(s.peer, { kind: 'active', peer: callee, video: s.video, since: t, initiator: true });
    this.state.set(callee, { kind: 'active', peer: s.peer, video: s.video, since: t, initiator: false });
    return { caller: s.peer, video: s.video };
  }

  /** Decline, cancel or hang up. Returns the peer to notify. */
  end(id: string): string | null {
    const s = this.get(id);
    if (s.kind === 'idle') return null;
    this.state.delete(id);
    const ps = this.get(s.peer);
    if (ps.kind !== 'idle' && ps.peer === id) this.state.delete(s.peer);
    return s.peer;
  }

  canRelay(from: string, to: string): boolean {
    const s = this.get(from);
    return (s.kind === 'active' || s.kind === 'rejoining') && s.peer === to;
  }

  /** The user's last session left. An active call waits for a rejoin; a ring just ends. */
  sessionLost(id: string): { peer: string; held: boolean } | null {
    const s = this.get(id);
    if (s.kind === 'idle') return null;
    if (s.kind === 'active') {
      this.state.set(id, { ...s, kind: 'rejoining', lostAt: this.now() });
      return { peer: s.peer, held: true };
    }
    if (s.kind === 'rejoining') return { peer: s.peer, held: true };
    const peer = this.end(id)!;
    return { peer, held: false };
  }

  /** A page (re)joined with a call to continue: back to active; both sides renegotiate. */
  resume(id: string): { peer: string; video: boolean; initiator: boolean } | null {
    const s = this.get(id);
    if (s.kind !== 'active' && s.kind !== 'rejoining') return null;
    this.state.set(id, { kind: 'active', peer: s.peer, video: s.video, since: s.since, initiator: s.initiator });
    return { peer: s.peer, video: s.video, initiator: s.initiator };
  }

  sweep(): Array<{ a: string; b: string; reason: 'timeout' | 'lost' }> {
    const t = this.now();
    const out: Array<{ a: string; b: string; reason: 'timeout' | 'lost' }> = [];
    for (const [id, s] of [...this.state]) {
      if (!this.state.has(id)) continue;
      if (s.kind === 'ringing' && s.initiator && t - s.since > FRIEND_RING_TTL_MS) {
        out.push({ a: id, b: s.peer, reason: 'timeout' });
        this.end(id);
      } else if (s.kind === 'rejoining' && t - s.lostAt > FRIEND_REJOIN_GRACE_MS) {
        out.push({ a: id, b: s.peer, reason: 'lost' });
        this.end(id);
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @dovey/server test -- social-calls`
Expected: PASS — `Tests  6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add server/src/social-calls.ts server/src/social-calls.test.ts
git commit -F - <<'MSG'
feat(server): friend call book keyed by user with ring timeout and rejoin grace

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 2: FriendCallService — gating, notifications, sweep

**Files:**
- Modify: `server/src/social-calls.ts` (append)
- Modify: `server/src/social-calls.test.ts` (append)

**Interfaces:**
- Consumes: `FriendCallBook` (Task 1); `REPORT_NOTE_MAX`, `REPORT_RATE`, `VOICE_RTC_RATE`, `isReportReason` (`@dovey/shared`)
- Produces:
  - `interface FriendCallDeps { areFriends(a: string, b: string): Promise<boolean>; blockPairs(userId: string): Promise<string[]>; isOnline(userId: string): boolean; notify(userId: string, type: string, payload: unknown): void; notifySession(userId: string, sessionId: string, type: string, payload: unknown): boolean; sessions(userId: string): ReadonlyArray<{ sessionId: string }>; report(reporterId: string, targetId: string, roomId: string | null, reason: string, context: string | null): Promise<boolean> }`
  - `interface CallerInfo { id: string; handle: string; avatar: string }`
  - `type FriendCallError = BookInviteError | 'bad_request' | 'not_friends' | 'blocked_pair' | 'friend_offline' | 'no_invite' | 'no_call'`
  - `const REPORT_AFTER_CALL_MS = 300_000`
  - `class FriendCallService { readonly book: FriendCallBook; constructor(book: FriendCallBook, deps?: FriendCallDeps, now?: () => number); bind(deps: FriendCallDeps): void; invite(me: CallerInfo, sessionId: string, to: unknown, video: unknown): Promise<FriendCallError | null>; accept(meId: string, sessionId: string): FriendCallError | null; decline(meId: string, busy: boolean): void; hangup(meId: string): void; endBetween(a: string, b: string): void; signal(meId: string, to: unknown, data: unknown): boolean; resume(meId: string, sessionId: string): void; sessionLost(userId: string): void; sweep(): void; report(meId: string, reason: unknown, note: unknown, roomId: string | null): Promise<FriendCallError | null> }`
  - `const friendCalls: FriendCallService`, `function startFriendCallSweep(service: FriendCallService, everyMs?: number): () => void`
  - Messages sent: `fcall_incoming {from: CallerInfo, video}`, `fcall_ringing {to}`, `fcall_start {peer, video, initiator}`, `fcall_end {reason: 'declined'|'busy'|'cancelled'|'ended'|'left'|'timeout'|'lost'|'elsewhere'}` (`fcall_start`, `fsig`, `fcall_rejoin` go to the call's tab via `notifySession`, falling back to all tabs), `fcall_hold {peer}`, `fcall_rejoin {peer, video, initiator}`, `fsig {from, data}`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/social-calls.test.ts` (merge the import into the top import block):

```ts
import { FriendCallDeps, FriendCallService } from './social-calls';

function fakeDeps(opts: { friends?: Array<[string, string]>; blocks?: Array<[string, string]>; online?: string[]; tabs?: Record<string, string[]> } = {}) {
  const sent: Array<[string, string, unknown]> = [];
  const reports: unknown[][] = [];
  const friends = new Set((opts.friends ?? []).map(([x, y]) => [x, y].sort().join('|')));
  const deps: FriendCallDeps = {
    areFriends: async (a, b) => friends.has([a, b].sort().join('|')),
    blockPairs: async (id) => (opts.blocks ?? []).flatMap(([x, y]) => (x === id ? [y] : y === id ? [x] : [])),
    isOnline: (id) => (opts.online ?? []).includes(id),
    notify: (id, type, payload) => sent.push([id, type, payload]),
    notifySession: (id, _sid, type, payload) => {
      sent.push([id, type, payload]);
      return true;
    },
    sessions: (id) => (opts.tabs?.[id] ?? [`${id}-s1`]).map((sessionId) => ({ sessionId })),
    report: async (...args) => {
      reports.push(args);
      return true;
    },
  };
  return { deps, sent, reports };
}

const A = { id: 'a', handle: 'amy', avatar: '{}' };

describe('FriendCallService', () => {
  it('gates invites: bad id, not friends, blocked either way, offline', async () => {
    const c = clock();
    const { deps, sent } = fakeDeps({ friends: [['a', 'b'], ['a', 'c'], ['a', 'd']], blocks: [['c', 'a']], online: ['b', 'c'] });
    const s = new FriendCallService(new FriendCallBook(c.now), deps, c.now);
    expect(await s.invite(A, 'a-s1', 42, true)).toBe('bad_request');
    expect(await s.invite(A, 'a-s1', 'a', true)).toBe('self');
    expect(await s.invite(A, 'a-s1', 'x', true)).toBe('not_friends');
    expect(await s.invite(A, 'a-s1', 'c', true)).toBe('blocked_pair');
    expect(await s.invite(A, 'a-s1', 'd', true)).toBe('friend_offline');
    expect(sent).toEqual([]);
    expect(await s.invite(A, 'a-s1', 'b', true)).toBeNull();
    expect(sent).toEqual([
      ['b', 'fcall_incoming', { from: A, video: true }],
      ['a', 'fcall_ringing', { to: 'b' }],
    ]);
  });

  it('accept starts both sides, signals relay only inside the call, hangup notifies both users', async () => {
    const c = clock();
    const { deps, sent } = fakeDeps({ friends: [['a', 'b']], online: ['b'] });
    const s = new FriendCallService(new FriendCallBook(c.now), deps, c.now);
    await s.invite(A, 'a-s1', 'b', false);
    expect(s.signal('a', 'b', { sdp: 1 })).toBe(false); // not accepted yet
    sent.length = 0;
    expect(s.accept('a', 'a-s1')).toBe('no_invite');
    expect(s.accept('b', 'b-s1')).toBeNull();
    expect(sent).toEqual([
      ['a', 'fcall_start', { peer: 'b', video: false, initiator: true }],
      ['b', 'fcall_start', { peer: 'a', video: false, initiator: false }],
    ]);
    sent.length = 0;
    expect(s.signal('a', 'b', { sdp: 1 })).toBe(true);
    expect(s.signal('a', 'z', { sdp: 1 })).toBe(false);
    expect(sent).toEqual([['b', 'fsig', { from: 'a', data: { sdp: 1 } }]]);
    sent.length = 0;
    s.hangup('b');
    expect(sent).toEqual([
      ['a', 'fcall_end', { reason: 'ended' }],
      ['b', 'fcall_end', { reason: 'ended' }],
    ]);
  });

  it('decline reasons: declined, busy, cancelled by the caller', async () => {
    const c = clock();
    const { deps, sent } = fakeDeps({ friends: [['a', 'b'], ['a', 'c'], ['a', 'd']], online: ['b', 'c', 'd'] });
    const s = new FriendCallService(new FriendCallBook(c.now), deps, c.now);
    await s.invite(A, 'a-s1', 'b', false);
    sent.length = 0;
    s.decline('b', false);
    expect(sent[0]).toEqual(['a', 'fcall_end', { reason: 'declined' }]);
    await s.invite(A, 'a-s1', 'c', false);
    sent.length = 0;
    s.decline('c', true);
    expect(sent[0]).toEqual(['a', 'fcall_end', { reason: 'busy' }]);
    await s.invite(A, 'a-s1', 'd', false);
    sent.length = 0;
    s.decline('a', false);
    expect(sent[0]).toEqual(['d', 'fcall_end', { reason: 'cancelled' }]);
  });

  it('holds on lost session, rejoins both sides on resume, sweeps timeouts and lost calls', async () => {
    const c = clock();
    const { deps, sent } = fakeDeps({ friends: [['a', 'b']], online: ['b'] });
    const s = new FriendCallService(new FriendCallBook(c.now), deps, c.now);
    await s.invite(A, 'a-s1', 'b', true);
    s.accept('b', 'b-s1');
    sent.length = 0;
    s.sessionLost('b');
    expect(sent).toEqual([['a', 'fcall_hold', { peer: 'b' }]]);
    sent.length = 0;
    c.t += 5_000;
    s.resume('b', 'b-s2');
    expect(sent).toEqual([
      ['b', 'fcall_rejoin', { peer: 'a', video: true, initiator: false }],
      ['a', 'fcall_rejoin', { peer: 'b', video: true, initiator: true }],
    ]);
    sent.length = 0;
    s.sessionLost('a');
    c.t += 10_001;
    s.sweep();
    expect(sent.slice(1)).toEqual([
      ['a', 'fcall_end', { reason: 'lost' }],
      ['b', 'fcall_end', { reason: 'lost' }],
    ]);
    c.t += 60_000;
    await s.invite(A, 'a-s1', 'b', false);
    sent.length = 0;
    c.t += 30_001;
    s.sweep();
    expect(sent).toEqual([
      ['a', 'fcall_end', { reason: 'timeout' }],
      ['b', 'fcall_end', { reason: 'timeout' }],
    ]);
  });

  it('starts only the accepting tab and quiets the callee\'s other tabs', async () => {
    const c = clock();
    const { deps, sent } = fakeDeps({ friends: [['a', 'b']], online: ['b'], tabs: { b: ['b-s1', 'b-s2'] } });
    const s = new FriendCallService(new FriendCallBook(c.now), deps, c.now);
    await s.invite(A, 'a-s1', 'b', false);
    sent.length = 0;
    expect(s.accept('b', 'b-s2')).toBeNull();
    expect(sent).toEqual([
      ['a', 'fcall_start', { peer: 'b', video: false, initiator: true }],
      ['b', 'fcall_start', { peer: 'a', video: false, initiator: false }],
      ['b', 'fcall_end', { reason: 'elsewhere' }],
    ]);
  });

  it('endBetween ends only the matching call; report files against the peer and ends the call', async () => {
    const c = clock();
    const { deps, sent, reports } = fakeDeps({ friends: [['a', 'b']], online: ['b'] });
    const s = new FriendCallService(new FriendCallBook(c.now), deps, c.now);
    await s.invite(A, 'a-s1', 'b', false);
    s.accept('b', 'b-s1');
    s.endBetween('a', 'zzz');
    expect(s.book.isBusy('a')).toBe(true);
    expect(await s.report('a', 'nope', null, 'room1')).toBe('bad_request');
    sent.length = 0;
    expect(await s.report('a', 'harassment', ' rude ', 'room1')).toBeNull();
    expect(reports).toEqual([['a', 'b', 'room1', 'harassment', 'friend call: rude']]);
    expect(s.book.isBusy('a') || s.book.isBusy('b')).toBe(false);
    expect(sent[0]).toEqual(['b', 'fcall_end', { reason: 'ended' }]);
    // right after the call a report still reaches the last peer; much later there is no call to report
    expect(await s.report('b', 'spam', undefined, null)).toBeNull();
    expect(reports[1]).toEqual(['b', 'a', null, 'spam', 'friend call']);
    c.t += 300_001;
    expect(await s.report('b', 'spam', undefined, null)).toBe('no_call');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dovey/server test -- social-calls`
Expected: FAIL — `FriendCallService is not a constructor`.

- [ ] **Step 3: Implement the service**

In `server/src/social-calls.ts` change the first import to:

```ts
import { REPORT_NOTE_MAX, REPORT_RATE, RateLimiter, VOICE_RTC_RATE, isReportReason } from '@dovey/shared';
```

Append:

```ts
export interface FriendCallDeps {
  areFriends(a: string, b: string): Promise<boolean>;
  blockPairs(userId: string): Promise<string[]>;
  isOnline(userId: string): boolean;
  notify(userId: string, type: string, payload: unknown): void;
  /** presence.notifySession: one tab only; false when that session is gone */
  notifySession(userId: string, sessionId: string, type: string, payload: unknown): boolean;
  /** presence.sessions: every tab of the user, most recent last */
  sessions(userId: string): ReadonlyArray<{ sessionId: string }>;
  report(reporterId: string, targetId: string, roomId: string | null, reason: string, context: string | null): Promise<boolean>;
}

export interface CallerInfo {
  id: string;
  handle: string;
  avatar: string;
}

export type FriendCallError = BookInviteError | 'bad_request' | 'not_friends' | 'blocked_pair' | 'friend_offline' | 'no_invite' | 'no_call';

/** a report can still name the last call's peer for this long after hanging up */
export const REPORT_AFTER_CALL_MS = 300_000;

const userIdOf = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : '');

export class FriendCallService {
  private deps: FriendCallDeps | null;
  private sigLimit = new RateLimiter(VOICE_RTC_RATE.count, VOICE_RTC_RATE.windowMs);
  private reportLimit = new RateLimiter(REPORT_RATE.count, REPORT_RATE.windowMs);
  private lastPeer = new Map<string, { peer: string; at: number }>();

  constructor(
    readonly book: FriendCallBook,
    deps?: FriendCallDeps,
    private now: () => number = Date.now,
  ) {
    this.deps = deps ?? null;
  }

  bind(deps: FriendCallDeps) {
    this.deps = deps;
  }

  private get d(): FriendCallDeps {
    if (!this.deps) throw new Error('friend calls not bound');
    return this.deps;
  }

  private remember(a: string, b: string) {
    const at = this.now();
    this.lastPeer.set(a, { peer: b, at });
    this.lastPeer.set(b, { peer: a, at });
  }

  /** userId -> the tab carrying the call (inviting tab, accepting tab, or the tab that resumed) */
  private callSession = new Map<string, string>();

  /** to the call's tab when known and still there, else every tab of the user */
  private toTab(userId: string, type: string, payload: unknown) {
    const sid = this.callSession.get(userId);
    if (!sid || !this.d.notifySession(userId, sid, type, payload)) this.d.notify(userId, type, payload);
  }

  async invite(me: CallerInfo, sessionId: string, toRaw: unknown, videoRaw: unknown): Promise<FriendCallError | null> {
    const to = userIdOf(toRaw);
    if (!to) return 'bad_request';
    if (to === me.id) return 'self';
    if (!(await this.d.areFriends(me.id, to))) return 'not_friends';
    if ((await this.d.blockPairs(me.id)).includes(to)) return 'blocked_pair';
    if (!this.d.isOnline(to)) return 'friend_offline';
    const video = videoRaw === true;
    const err = this.book.invite(me.id, to, video);
    if (err) return err;
    this.callSession.set(me.id, sessionId);
    this.callSession.delete(to);
    // every tab of the friend rings; the first to accept takes the call
    this.d.notify(to, 'fcall_incoming', { from: me, video });
    this.toTab(me.id, 'fcall_ringing', { to });
    return null;
  }

  accept(meId: string, sessionId: string): FriendCallError | null {
    const r = this.book.accept(meId);
    if (!r) return 'no_invite';
    this.remember(meId, r.caller);
    this.callSession.set(meId, sessionId);
    this.toTab(r.caller, 'fcall_start', { peer: meId, video: r.video, initiator: true });
    this.d.notifySession(meId, sessionId, 'fcall_start', { peer: r.caller, video: r.video, initiator: false });
    // the callee's other tabs stop ringing quietly
    for (const s of this.d.sessions(meId)) {
      if (s.sessionId !== sessionId) this.d.notifySession(meId, s.sessionId, 'fcall_end', { reason: 'elsewhere' });
    }
    return null;
  }

  /** Both users hear the end, so every tab of each stops ringing or tears down. */
  private finish(meId: string, reason: string) {
    const s = this.book.get(meId);
    const peer = this.book.end(meId);
    if (!peer) return;
    if (s.kind !== 'ringing') this.remember(meId, peer);
    this.callSession.delete(meId);
    this.callSession.delete(peer);
    this.d.notify(peer, 'fcall_end', { reason });
    this.d.notify(meId, 'fcall_end', { reason });
  }

  decline(meId: string, busy: boolean) {
    const s = this.book.get(meId);
    if (s.kind !== 'ringing') return this.hangup(meId);
    this.finish(meId, s.initiator ? 'cancelled' : busy ? 'busy' : 'declined');
  }

  hangup(meId: string) {
    this.finish(meId, 'ended');
  }

  /** unfriend or block: end a call between exactly these two */
  endBetween(a: string, b: string) {
    const s = this.book.get(a);
    if (s.kind !== 'idle' && s.peer === b) this.finish(a, 'ended');
  }

  signal(meId: string, toRaw: unknown, data: unknown): boolean {
    const to = userIdOf(toRaw);
    if (!to || !this.book.canRelay(meId, to)) return false;
    if (!this.sigLimit.allow(meId, this.now())) return false;
    this.toTab(to, 'fsig', { from: meId, data });
    return true;
  }

  /** a tab (re)joined a room with this call: it becomes the call's tab, both sides renegotiate */
  resume(meId: string, sessionId: string) {
    const r = this.book.resume(meId);
    if (!r) return;
    this.callSession.set(meId, sessionId);
    this.d.notifySession(meId, sessionId, 'fcall_rejoin', { peer: r.peer, video: r.video, initiator: r.initiator });
    this.toTab(r.peer, 'fcall_rejoin', { peer: meId, video: r.video, initiator: !r.initiator });
  }

  sessionLost(userId: string) {
    const r = this.book.sessionLost(userId);
    if (!r) return;
    if (r.held) this.d.notify(r.peer, 'fcall_hold', { peer: userId });
    else this.d.notify(r.peer, 'fcall_end', { reason: 'left' });
  }

  sweep() {
    for (const e of this.book.sweep()) {
      this.d.notify(e.a, 'fcall_end', { reason: e.reason });
      this.d.notify(e.b, 'fcall_end', { reason: e.reason });
    }
  }

  /** Report the current (or just-ended) call's peer; reporting ends the call. */
  async report(meId: string, reasonRaw: unknown, noteRaw: unknown, roomId: string | null): Promise<FriendCallError | null> {
    if (!isReportReason(reasonRaw)) return 'bad_request';
    if (!this.reportLimit.allow(meId, this.now())) return 'rate_limited';
    const s = this.book.get(meId);
    const recent = this.lastPeer.get(meId);
    const target = s.kind !== 'idle' ? s.peer : recent && this.now() - recent.at <= REPORT_AFTER_CALL_MS ? recent.peer : '';
    if (!target) return 'no_call';
    const note = typeof noteRaw === 'string' ? noteRaw.slice(0, REPORT_NOTE_MAX).trim() : '';
    await this.d.report(meId, target, roomId, reasonRaw, note ? `friend call: ${note}` : 'friend call');
    if (s.kind !== 'idle') this.hangup(meId);
    return null;
  }
}

export const friendCalls = new FriendCallService(new FriendCallBook());

export function startFriendCallSweep(service: FriendCallService, everyMs = 1000): () => void {
  const t = setInterval(() => service.sweep(), everyMs);
  t.unref?.();
  return () => clearInterval(t);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @dovey/server test -- social-calls && pnpm --filter @dovey/server typecheck`
Expected: PASS — `Tests  12 passed (12)`; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/social-calls.ts server/src/social-calls.test.ts
git commit -F - <<'MSG'
feat(server): friend call service with friend, block and online gates

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 3: ICE servers, adult confirmation, API routes

**Files:**
- Create: `server/src/ice.ts`, `server/src/ice.test.ts`
- Modify: `server/src/db.ts` — `COLUMNS`, append as the last entry
- Modify: `server/src/repo.ts` — new `// ---- call safety` section directly after the `resolveReport` method
- Modify: `server/src/api.ts` — imports; routes directly after the `app.post('/api/daily', ...)` handler (after the leaderboards routes if they already follow it); coordination point 2 in `/api/friends/remove`
- Test: `server/src/calls-api.test.ts`

**Interfaces:**
- Consumes: `friendCalls.endBetween` (Task 2), `tokenOf`, `repo.userByToken`
- Produces:
  - `const STUN_URLS: string[]`; `interface IceServer { urls: string | string[]; username?: string; credential?: string }`; `function iceServersFromEnv(env?: Record<string, string | undefined>): IceServer[]`
  - `Repo.isAdultConfirmed(userId: string): Promise<boolean>`, `Repo.confirmAdult(userId: string): Promise<void>`
  - `POST /api/ice {token}` → `{ iceServers: IceServer[] }` (`cache-control: no-store`) | 401
  - `POST /api/me/adult {token}` → `{ adultConfirmed: true }` | 401

- [ ] **Step 1: Write the failing tests**

Create `server/src/ice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STUN_URLS, iceServersFromEnv } from './ice';

describe('iceServersFromEnv', () => {
  it('STUN only without full TURN config', () => {
    expect(iceServersFromEnv({})).toEqual([{ urls: STUN_URLS }]);
    expect(iceServersFromEnv({ TURN_URLS: 'turn:t.example:3478', TURN_USERNAME: 'u' })).toEqual([{ urls: STUN_URLS }]);
    expect(iceServersFromEnv({ TURN_URLS: ' , ', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' })).toEqual([{ urls: STUN_URLS }]);
  });
  it('adds TURN when urls, username and credential are all set', () => {
    expect(
      iceServersFromEnv({ TURN_URLS: 'turn:t.example:3478?transport=udp, turns:t.example:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' }),
    ).toEqual([
      { urls: STUN_URLS },
      { urls: ['turn:t.example:3478?transport=udp', 'turns:t.example:5349'], username: 'u', credential: 'p' },
    ]);
  });
});
```

Create `server/src/calls-api.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type Server } from 'node:http';
import { rmSync } from 'node:fs';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { buildApi } from './api';

/** a unix socket, so this test never takes a TCP port */
const SOCK = `/tmp/leypark-calls-api-${process.pid}.sock`;
const TOKEN = 'c'.repeat(32);
let db: Db;
let repo: Repo;
let server: Server;

function call(method: string, path: string, body?: unknown): Promise<{ status: number; headers: Record<string, unknown>; json: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      { socketPath: SOCK, method, path, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, json: buf ? JSON.parse(buf) : null }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.createUser(TOKEN, DEFAULT_AVATAR);
  rmSync(SOCK, { force: true });
  const app = buildApi(repo);
  await new Promise<void>((resolve) => {
    server = app.listen(SOCK, () => resolve());
  });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(SOCK, { force: true });
  await db.close();
});

describe('call api', () => {
  it('/api/ice needs a known user and follows the env', async () => {
    expect((await call('POST', '/api/ice', { token: 'z'.repeat(32) })).status).toBe(401);
    delete process.env.TURN_URLS;
    const plain = await call('POST', '/api/ice', { token: TOKEN });
    expect(plain.status).toBe(200);
    expect(plain.headers['cache-control']).toBe('no-store');
    expect(plain.json.iceServers).toHaveLength(1);
    process.env.TURN_URLS = 'turn:t.example:3478';
    process.env.TURN_USERNAME = 'u';
    process.env.TURN_CREDENTIAL = 'p';
    const turn = await call('POST', '/api/ice', { token: TOKEN });
    expect(turn.json.iceServers[1]).toEqual({ urls: ['turn:t.example:3478'], username: 'u', credential: 'p' });
    delete process.env.TURN_URLS;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
  });

  it('/api/me/adult confirms once, idempotently', async () => {
    const u = (await repo.userByToken(TOKEN))!;
    expect(await repo.isAdultConfirmed(u.id)).toBe(false);
    expect((await call('POST', '/api/me/adult', {})).status).toBe(401);
    expect((await call('POST', '/api/me/adult', { token: TOKEN })).json).toEqual({ adultConfirmed: true });
    const [first] = await db.query<{ at: string }>('select adult_confirmed_at::text as at from users where id = $1', [u.id]);
    await call('POST', '/api/me/adult', { token: TOKEN });
    const [second] = await db.query<{ at: string }>('select adult_confirmed_at::text as at from users where id = $1', [u.id]);
    expect(second.at).toBe(first.at);
    expect(await repo.isAdultConfirmed(u.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dovey/server test -- ice calls-api`
Expected: FAIL — `Failed to resolve import "./ice"`; `repo.isAdultConfirmed is not a function`.

- [ ] **Step 3: Implement**

Create `server/src/ice.ts`:

```ts
/**
 * ICE servers for WebRTC. STUN always; TURN only when all three env vars are
 * set (provider decided later: Cloudflare Calls TURN, Metered, Twilio NTS...).
 * Credentials live in server/.env or the host's env, never in the repo.
 */
export const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export function iceServersFromEnv(env: Record<string, string | undefined> = process.env): IceServer[] {
  const servers: IceServer[] = [{ urls: STUN_URLS }];
  const urls = (env.TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return servers;
}
```

In `server/src/db.ts` `COLUMNS`, add as the last entry (after the last existing entry):

```ts
  { table: 'users', column: 'adult_confirmed_at', ddl: 'alter table users add column adult_confirmed_at timestamptz' },
```

In `server/src/repo.ts`, directly after the `resolveReport` method add:

```ts
  // ---- call safety

  /** Calling someone who is not a friend needs a one-time "I am 18 or older". */
  async isAdultConfirmed(userId: string): Promise<boolean> {
    const r = await this.db.query('select 1 from users where id = $1 and adult_confirmed_at is not null', [userId]);
    return r.length > 0;
  }

  async confirmAdult(userId: string): Promise<void> {
    await this.db.query('update users set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = $1', [userId]);
  }
```

In `server/src/api.ts`, after `import { wardrobe } from './vending';` add:

```ts
import { iceServersFromEnv } from './ice';
import { friendCalls } from './social-calls';
```

Directly after the `app.post('/api/daily', ...)` handler (and after the leaderboards routes if present) add:

```ts
  /** ICE servers for calls: STUN, plus TURN when configured. Signed-in devices only (TURN costs money). */
  app.post('/api/ice', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    res.set('cache-control', 'no-store');
    res.json({ iceServers: iceServersFromEnv() });
  });

  /** One-time 18+ confirmation, needed before calling someone who is not a friend. */
  app.post('/api/me/adult', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    await repo.confirmAdult(user.id);
    res.json({ adultConfirmed: true });
  });
```

Coordination point 2 (d7's route, one line): in `app.post('/api/friends/remove', ...)` replace

```ts
    if (await repo.removeFriend(u.id, other)) presence.notify(other, 'friend_update', {});
```

with

```ts
    if (await repo.removeFriend(u.id, other)) presence.notify(other, 'friend_update', {});
    friendCalls.endBetween(u.id, other);
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @dovey/server test && pnpm --filter @dovey/server typecheck`
Expected: all test files pass incl. `ice.test.ts` (2) and `calls-api.test.ts` (2); typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/ice.ts server/src/ice.test.ts server/src/db.ts server/src/repo.ts server/src/api.ts server/src/calls-api.test.ts
git commit -F - <<'MSG'
feat(server): ice servers from env, adult confirmation, end calls on unfriend

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 4: Wire the server — boot binding, GameRoom handlers, same-room gates

**Files:**
- Modify: `server/src/index.ts` — imports; binding after the `setInterval(() => void repo.pruneRolls(), ...)` line
- Modify: `server/src/GameRoom.ts` — import after `import { inviteLimit, presence } from './social';`; `call_invite` handler; `block` handler (one line); new block after the `rtc` handler; `onLeave` (one statement before `this.sim.remove(client.sessionId);`)

**Interfaces:**
- Consumes: `friendCalls`, `startFriendCallSweep` (Task 2); `repo.isAdultConfirmed`, `repo.areFriends`, `repo.blockPairs`, `repo.report`; `presence.isOnline`, `presence.notify`
- Produces: room messages `fcall_invite {toUserId, video}`, `fcall_accept`, `fcall_decline {busy?}`, `fcall_end`, `fcall_resume`, `fsig {toUserId, data}`, `fcall_report {reason, note?}`; new `sys` code `adult_required`; `call_invite` rejects `busy_self`/`busy_peer` while either user is in a friend call

- [ ] **Step 1: Bind at boot**

In `server/src/index.ts`, after `import { buildApi } from './api';` add:

```ts
import { presence } from './social';
import { friendCalls, startFriendCallSweep } from './social-calls';
```

After the line `setInterval(() => void repo.pruneRolls(), 24 * 60 * 60 * 1000).unref();` add:

```ts
  friendCalls.bind({
    areFriends: (a, b) => repo.areFriends(a, b),
    blockPairs: (id) => repo.blockPairs(id),
    isOnline: (id) => presence.isOnline(id),
    notify: (id, type, payload) => presence.notify(id, type, payload),
    notifySession: (id, sid, type, payload) => presence.notifySession(id, sid, type, payload),
    sessions: (id) => presence.sessions(id),
    report: (reporter, target, room, reason, context) => repo.report(reporter, target, room, reason, context),
  });
  startFriendCallSweep(friendCalls);
```

- [ ] **Step 2: GameRoom import**

After `import { inviteLimit, presence } from './social';` add (do not edit that line):

```ts
import { friendCalls } from './social-calls';
```

- [ ] **Step 3: Gate same-room calls**

Replace the whole existing handler

```ts
    this.onMessage('call_invite', (client, msg: { to?: unknown; video?: unknown }) => {
      const to = typeof msg?.to === 'string' ? msg.to : '';
      const target = this.clients.find((c) => c.sessionId === to);
      if (!target || !this.state.players.has(to)) return this.reject(client, 'no_such_player');
      if (this.blocks.isHidden(client.sessionId, to)) return this.reject(client, 'blocked_pair');
      const err = this.calls.invite(client.sessionId, to, Boolean(msg?.video));
```

with

```ts
    this.onMessage('call_invite', async (client, msg: { to?: unknown; video?: unknown }) => {
      const to = typeof msg?.to === 'string' ? msg.to : '';
      const target = this.clients.find((c) => c.sessionId === to);
      if (!target || !this.state.players.has(to)) return this.reject(client, 'no_such_player');
      if (this.blocks.isHidden(client.sessionId, to)) return this.reject(client, 'blocked_pair');
      const caller = client.auth as User | undefined;
      const calleeId = this.state.players.get(to)?.userId ?? '';
      // a friend call anywhere makes you busy here too
      if (caller && friendCalls.book.isBusy(caller.id)) return this.reject(client, 'busy_self');
      if (calleeId && friendCalls.book.isBusy(calleeId)) return this.reject(client, 'busy_peer');
      // calling a non-friend needs the one-time 18+ confirmation (friends don't)
      if (caller && calleeId && !(await GameRoom.repo.areFriends(caller.id, calleeId)) && !(await GameRoom.repo.isAdultConfirmed(caller.id))) {
        return this.reject(client, 'adult_required');
      }
      if (!this.clients.includes(target)) return this.reject(client, 'no_such_player');
      const err = this.calls.invite(client.sessionId, to, Boolean(msg?.video));
```

(the rest of the handler body stays as it is).

- [ ] **Step 4: Blocking ends a friend call**

In the `block` handler, replace

```ts
      await GameRoom.repo.block(me.id, target);
      this.blocks.add(me.id, target);
```

with

```ts
      await GameRoom.repo.block(me.id, target);
      this.blocks.add(me.id, target);
      friendCalls.endBetween(me.id, target);
```

- [ ] **Step 5: Friend-call block**

Directly after the closing `});` of `this.onMessage('rtc', ...)` add:

```ts
    // ---- friend calls (cross-room): consent-gated 1-to-1 calls between friends in any room.
    // Routed by userId through presence; state and gates live in social-calls.ts.
    this.onMessage('fcall_invite', async (client, msg: { toUserId?: unknown; video?: unknown }) => {
      const me = client.auth as User | undefined;
      if (!me) return;
      if (this.calls.get(client.sessionId).kind !== 'idle') return this.reject(client, 'busy_self');
      const avatar = this.state.players.get(client.sessionId)?.avatar ?? serializeAvatar(me.avatar);
      const err = await friendCalls.invite({ id: me.id, handle: me.handle, avatar }, client.sessionId, msg?.toUserId, msg?.video);
      if (err) this.reject(client, err);
    });

    this.onMessage('fcall_accept', (client) => {
      const me = client.auth as User | undefined;
      if (!me) return;
      const err = friendCalls.accept(me.id, client.sessionId);
      if (err) this.reject(client, err);
    });

    this.onMessage('fcall_decline', (client, msg: { busy?: unknown }) => {
      const me = client.auth as User | undefined;
      if (me) friendCalls.decline(me.id, msg?.busy === true);
    });

    this.onMessage('fcall_end', (client) => {
      const me = client.auth as User | undefined;
      if (me) friendCalls.hangup(me.id);
    });

    this.onMessage('fcall_resume', (client) => {
      const me = client.auth as User | undefined;
      if (me) friendCalls.resume(me.id, client.sessionId);
    });

    this.onMessage('fsig', (client, msg: { toUserId?: unknown; data?: unknown }) => {
      const me = client.auth as User | undefined;
      if (me) friendCalls.signal(me.id, msg?.toUserId, msg?.data);
    });

    this.onMessage('fcall_report', async (client, msg: { reason?: unknown; note?: unknown }) => {
      const me = client.auth as User | undefined;
      if (!me) return;
      const err = await friendCalls.report(me.id, msg?.reason, msg?.note, this.state.slug);
      if (err) return this.reject(client, err);
      client.send('sys', { code: 'reported' });
    });
```

- [ ] **Step 6: Hold on the last session leaving**

In `onLeave`, directly before `this.sim.remove(client.sessionId);` add:

```ts
    // friend calls: the user's last session is gone -> hold the call for the rejoin grace
    if (leaver && !presence.isOnline(leaver.id)) friendCalls.sessionLost(leaver.id);
```

(`leaver` is the `const leaver = client.auth as User | undefined;` declared above; d7's `if (leaver) { presence.leave(...) ... }` block is not edited.)

- [ ] **Step 7: Typecheck and test**

Run: `pnpm --filter @dovey/server typecheck && pnpm --filter @dovey/server test`
Expected: typecheck exits 0; all server tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/index.ts server/src/GameRoom.ts
git commit -F - <<'MSG'
feat(server): route friend calls across rooms and gate calls to non-friends

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 5: Client ICE loading, busy hook, adult API

**Files:**
- Modify: `client/src/api.ts` (append)
- Modify: `client/src/call.ts` — the `ICE` constant area, the SAFETY TODO comment, `CallManager.invite`, `CallManager.onIncoming`, `new RTCPeerConnection(ICE)` in `onStart`
- Modify: `client/src/voice.ts` — import line and `createLink`
- Modify: `client/src/game/Game.ts` — after `bindFriendSender(...)` line
- Test: `client/src/ice.test.ts`

**Interfaces:**
- Consumes: `POST /api/ice`, `POST /api/me/adult` (Task 3)
- Produces:
  - api: `fetchIceServers(): Promise<RTCIceServer[] | null>`, `confirmAdult(): Promise<boolean>`
  - call.ts: `currentIce(): RTCConfiguration`, `loadIce(fetcher?: () => Promise<RTCIceServer[] | null>): Promise<RTCConfiguration>`, `resetIceForTests(): void`, `setOtherCallBusy(fn: () => boolean): void`, `isOtherCallBusy(): boolean`

- [ ] **Step 1: Write the failing test**

Create `client/src/ice.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ICE, currentIce, isOtherCallBusy, loadIce, resetIceForTests, setOtherCallBusy } from './call';

describe('ICE config', () => {
  beforeEach(() => resetIceForTests());

  it('uses server ICE servers once loaded, fetching only once', async () => {
    let calls = 0;
    const servers = [{ urls: ['stun:s'] }, { urls: ['turn:t'], username: 'u', credential: 'p' }];
    const fetcher = async () => {
      calls++;
      return servers;
    };
    expect(currentIce()).toBe(ICE);
    expect(await loadIce(fetcher)).toEqual({ iceServers: servers });
    await loadIce(fetcher);
    expect(calls).toBe(1);
    expect(currentIce()).toEqual({ iceServers: servers });
  });

  it('falls back to STUN-only on null or a thrown fetch', async () => {
    expect(await loadIce(async () => null)).toBe(ICE);
    resetIceForTests();
    expect(await loadIce(async () => Promise.reject(new Error('offline')))).toBe(ICE);
  });

  it('lets another call type mark the user busy', () => {
    expect(isOtherCallBusy()).toBe(false);
    setOtherCallBusy(() => true);
    expect(isOtherCallBusy()).toBe(true);
    setOtherCallBusy(() => false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dovey/client test -- ice`
Expected: FAIL — `currentIce` / `loadIce` not exported.

- [ ] **Step 3: API helpers**

Append to `client/src/api.ts`:

```ts
// ---- calls
export async function fetchIceServers(): Promise<RTCIceServer[] | null> {
  try {
    const r = await fetch(`${base}/api/ice`, json({ token: deviceToken() }));
    if (!r.ok) return null;
    return ((await r.json()) as { iceServers?: RTCIceServer[] }).iceServers ?? null;
  } catch {
    return null;
  }
}

export async function confirmAdult(): Promise<boolean> {
  try {
    const r = await fetch(`${base}/api/me/adult`, json({ token: deviceToken() }));
    return r.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: call.ts**

At the top of `client/src/call.ts`, after `import { useAppStore } from './store';` add:

```ts
import { fetchIceServers } from './api';
```

Replace

```ts
export const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

/**
 * SAFETY TODO (Phase 2 age gate): calls must be disabled by default for under-18
 * accounts and only enabled between mutual follows. Wire the gate in `invite()`
 * and in the server's call_invite handler once age_bracket exists.
 */
```

with

```ts
/** STUN-only fallback, used until (or if never) the server's /api/ice answers */
export const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

let iceConfig: RTCConfiguration = ICE;
let iceLoad: Promise<RTCConfiguration> | null = null;

/** the best ICE config known right now (sync, for proximity voice links) */
export function currentIce(): RTCConfiguration {
  return iceConfig;
}

/** Fetch STUN + TURN from the server once; any failure keeps STUN-only. */
export function loadIce(fetcher: () => Promise<RTCIceServer[] | null> = fetchIceServers): Promise<RTCConfiguration> {
  iceLoad ??= fetcher().then(
    (servers) => {
      if (servers?.length) iceConfig = { iceServers: servers };
      return iceConfig;
    },
    () => iceConfig,
  );
  return iceLoad;
}

export function resetIceForTests() {
  iceConfig = ICE;
  iceLoad = null;
}

let otherCallBusy: () => boolean = () => false;
/** friend calls register here so a same-room call can't start while one is on */
export function setOtherCallBusy(fn: () => boolean) {
  otherCallBusy = fn;
}
export function isOtherCallBusy(): boolean {
  return otherCallBusy();
}

/**
 * Safety gate: calling someone who is not your friend needs a one-time
 * "Saya 18 tahun ke atas" confirmation (users.adult_confirmed_at), enforced by
 * the server's call_invite handler (sys code adult_required, see adultGate.ts).
 * Friend calls (friendCall.ts) need no confirmation.
 */
```

In `CallManager.invite`, replace

```ts
    if (useAppStore.getState().call.phase !== 'idle') return;
```

with

```ts
    if (useAppStore.getState().call.phase !== 'idle') return;
    if (isOtherCallBusy()) return useAppStore.getState().flash('you are already on a call');
```

In `CallManager.onIncoming`, replace

```ts
    if (useAppStore.getState().call.phase !== 'idle') {
```

with

```ts
    if (useAppStore.getState().call.phase !== 'idle' || isOtherCallBusy()) {
```

In `onStart`, replace

```ts
    const pc = new RTCPeerConnection(ICE);
```

with

```ts
    const pc = new RTCPeerConnection(await loadIce());
```

- [ ] **Step 5: voice.ts**

Replace `import { ICE, unlockAudio } from './call';` with `import { currentIce, unlockAudio } from './call';` and in `createLink` replace `const pc = new RTCPeerConnection(ICE);` with `const pc = new RTCPeerConnection(currentIce());`.

- [ ] **Step 6: Prime ICE at game start**

In `client/src/game/Game.ts`, change `import { CallManager, unlockAudio } from '../call';` to `import { CallManager, loadIce, unlockAudio } from '../call';` and directly after the line `bindFriendSender((type, data) => this.net.send(type, data));` add:

```ts
    void loadIce();
```

- [ ] **Step 7: Run tests, typecheck**

Run: `pnpm --filter @dovey/client test && pnpm --filter @dovey/client typecheck`
Expected: all client tests pass (incl. `ice.test.ts`, 3 tests); typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add client/src/api.ts client/src/call.ts client/src/voice.ts client/src/game/Game.ts client/src/ice.test.ts
git commit -F - <<'MSG'
feat(client): load ice servers from the server with a stun fallback

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 6: Client friend-call manager and message wiring

**Files:**
- Create: `client/src/friendCall.ts`, `client/src/friendCall.test.ts`
- Modify: `client/src/net.ts` — imports; handler lines directly after d7's `room.onMessage('friend_invite_sent', onFriendInviteSent);`; one line at the top of the `sys` handler body; new entries at the end of its `msgs` map
- Modify: `client/src/game/Game.ts` — after the `void loadIce();` line (Task 5) and inside `onJoined` after `void useFriends.getState().load();`
- Create: `client/src/adultGate.ts`

**Interfaces:**
- Consumes: `loadIce`, `setOtherCallBusy`, `IDLE_CALL` (`call.ts`), `useAppStore` (`call`, `setCall`, `flash`), server messages from Task 4
- Produces:
  - `type FriendCallPhase = 'idle' | 'ringing_out' | 'ringing_in' | 'connecting' | 'active' | 'rejoining'`
  - `interface FriendPeer { id: string; handle: string; avatar: string }`
  - `interface FriendCallView { phase; peer: FriendPeer | null; video; initiator; micOn; camOn; remoteHasVideo; collapsed; ringingSince: number }`, `IDLE_FRIEND_CALL`
  - `useFriendCall` (zustand: view + `patch(p)`, `reset()`)
  - `STORAGE_KEY = 'leypark.fcall'`, `RESUME_MAX_AGE_MS = 15_000`, `REJOIN_GRACE_MS = 10_000`, `CONNECT_TIMEOUT_MS = 30_000`
  - `interface SavedCall { peer: FriendPeer; video: boolean; initiator: boolean; savedAt: number }`
  - `saveCall(s, storage?)`, `loadCall(now?, storage?): SavedCall | null`, `clearCall(storage?)`, `clampPos(p, size, view, margin?)`
  - `bindFriendCallSender(fn)`, `class FriendCallManager`, `const friendCall: FriendCallManager`
  - handlers `onFriendCallIncoming`, `onFriendCallStart`, `onFriendCallEnd`, `onFriendCallHold`, `onFriendCallRejoin`, `onFriendSignal`, `onFriendCallSys(code)`
  - adultGate: `useAdultGate` (`pending: { peer: string; handle: string; video: boolean } | null`, `close()`), `onAdultRequired(): void`

- [ ] **Step 1: Write the failing tests**

Create `client/src/friendCall.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { IDLE_CALL } from './call';
import { useAppStore } from './store';
import {
  FriendCallManager,
  IDLE_FRIEND_CALL,
  RESUME_MAX_AGE_MS,
  STORAGE_KEY,
  bindFriendCallSender,
  clampPos,
  loadCall,
  saveCall,
  useFriendCall,
} from './friendCall';
import { onAdultRequired, useAdultGate } from './adultGate';

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const PEER = { id: 'u2', handle: 'bob', avatar: '{}' };

describe('friend call storage and layout', () => {
  it('saves and restores a call within the resume window only', () => {
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: false, savedAt: 1000 }, s);
    expect(JSON.parse(s.m.get(STORAGE_KEY)!)).toMatchObject({ peer: PEER });
    expect(loadCall(1000 + RESUME_MAX_AGE_MS, s)).toEqual({ peer: PEER, video: true, initiator: false, savedAt: 1000 });
    expect(loadCall(1001 + RESUME_MAX_AGE_MS, s)).toBeNull();
    expect(s.m.has(STORAGE_KEY)).toBe(false);
    s.setItem(STORAGE_KEY, '{broken');
    expect(loadCall(0, s)).toBeNull();
  });

  it('clamps the window inside the viewport', () => {
    expect(clampPos({ x: -50, y: 900 }, { w: 200, h: 150 }, { w: 400, h: 800 })).toEqual({ x: 8, y: 642 });
    expect(clampPos({ x: 100, y: 100 }, { w: 200, h: 150 }, { w: 400, h: 800 })).toEqual({ x: 100, y: 100 });
    expect(clampPos({ x: 100, y: 100 }, { w: 500, h: 150 }, { w: 400, h: 800 })).toEqual({ x: 8, y: 100 });
  });
});

describe('FriendCallManager signaling (no media)', () => {
  let sent: Array<[string, unknown]>;
  let m: FriendCallManager;
  beforeEach(() => {
    sent = [];
    bindFriendCallSender((type, data) => sent.push([type, data]));
    useFriendCall.getState().reset();
    useAppStore.getState().setCall(IDLE_CALL);
    m = new FriendCallManager(memStorage());
  });

  it('invites, and a rejection code resets the ring', () => {
    m.invite(PEER, true);
    expect(sent).toEqual([['fcall_invite', { toUserId: 'u2', video: true }]]);
    expect(useFriendCall.getState()).toMatchObject({ phase: 'ringing_out', peer: PEER, video: true, initiator: true });
    m.onSys('busy_peer');
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('auto-declines as busy while a same-room call is on', () => {
    useAppStore.getState().setCall({ ...IDLE_CALL, phase: 'active', peer: 's1' });
    m.onIncoming({ from: PEER, video: false });
    expect(sent).toEqual([['fcall_decline', { busy: true }]]);
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('rings in, declines, and ignores a start meant for another tab', () => {
    m.onIncoming({ from: PEER, video: false });
    expect(useFriendCall.getState()).toMatchObject({ phase: 'ringing_in', peer: PEER, initiator: false });
    // another tab of mine accepted: this tab stops ringing
    void m.onStart({ peer: 'u2', video: false, initiator: false });
    expect(useFriendCall.getState().phase).toBe('idle');
    m.onIncoming({ from: PEER, video: false });
    m.decline();
    expect(sent.at(-1)).toEqual(['fcall_decline', {}]);
    expect(useFriendCall.getState()).toMatchObject(IDLE_FRIEND_CALL);
  });

  it('ignores signals and rejoins when idle; ends clear the view', () => {
    void m.onSignal({ from: 'u2', data: { ice: {} } });
    void m.onRejoin({ peer: 'u2', video: false, initiator: true });
    expect(useFriendCall.getState().phase).toBe('idle');
    m.onIncoming({ from: PEER, video: false });
    m.onEnd({ reason: 'cancelled' });
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('resume with a saved call asks the server to rejoin', () => {
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: true, savedAt: Date.now() }, s);
    const r = new FriendCallManager(s);
    r.resume();
    expect(sent).toEqual([['fcall_resume', undefined]]);
    expect(useFriendCall.getState()).toMatchObject({ phase: 'rejoining', peer: PEER, initiator: true });
    r.teardown();
  });
});

describe('adult gate', () => {
  it('turns a rejected same-room invite into a pending confirmation', () => {
    useAppStore.getState().setCall({ ...IDLE_CALL, phase: 'ringing_out', peer: 's9', handle: 'zed', video: true });
    onAdultRequired();
    expect(useAdultGate.getState().pending).toEqual({ peer: 's9', handle: 'zed', video: true });
    expect(useAppStore.getState().call.phase).toBe('idle');
    useAdultGate.getState().close();
    expect(useAdultGate.getState().pending).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @dovey/client test -- friendCall`
Expected: FAIL — `Failed to resolve import "./friendCall"`.

- [ ] **Step 3: adultGate.ts**

Create `client/src/adultGate.ts`:

```ts
import { create } from 'zustand';
import { IDLE_CALL } from './call';
import { useAppStore } from './store';

/** A same-room call to a non-friend was refused until the caller confirms they are 18+. */
interface AdultGateStore {
  pending: { peer: string; handle: string; video: boolean } | null;
  close: () => void;
}

export const useAdultGate = create<AdultGateStore>((set) => ({
  pending: null,
  close: () => set({ pending: null }),
}));

export function onAdultRequired() {
  const st = useAppStore.getState();
  const c = st.call;
  if (c.phase === 'ringing_out') useAdultGate.setState({ pending: { peer: c.peer, handle: c.handle, video: c.video } });
  // nothing was connected yet (no peer connection before accept), so a plain reset is safe
  st.setCall(IDLE_CALL);
}
```

- [ ] **Step 4: friendCall.ts**

Create `client/src/friendCall.ts`:

```ts
import { create } from 'zustand';
import { loadIce, setOtherCallBusy } from './call';
import { useAppStore } from './store';

/**
 * Friend calls: 1-to-1 voice/video with a friend in any room. Signaling goes
 * through whichever room this tab is in (server routes by userId). Room changes
 * reload the page, so a live call is parked in sessionStorage and resumed when
 * the next room joins; the server holds it for 10 s.
 */
export type FriendCallPhase = 'idle' | 'ringing_out' | 'ringing_in' | 'connecting' | 'active' | 'rejoining';

export interface FriendPeer {
  id: string;
  handle: string;
  avatar: string;
}

export interface FriendCallView {
  phase: FriendCallPhase;
  peer: FriendPeer | null;
  video: boolean;
  /** this side sends the offers */
  initiator: boolean;
  micOn: boolean;
  camOn: boolean;
  remoteHasVideo: boolean;
  collapsed: boolean;
  ringingSince: number;
}

export const IDLE_FRIEND_CALL: FriendCallView = {
  phase: 'idle',
  peer: null,
  video: false,
  initiator: false,
  micOn: true,
  camOn: true,
  remoteHasVideo: false,
  collapsed: false,
  ringingSince: 0,
};

export const useFriendCall = create<FriendCallView & { patch: (p: Partial<FriendCallView>) => void; reset: () => void }>((set) => ({
  ...IDLE_FRIEND_CALL,
  patch: (p) => set(p),
  reset: () => set({ ...IDLE_FRIEND_CALL }),
}));

export const STORAGE_KEY = 'leypark.fcall';
export const RESUME_MAX_AGE_MS = 15_000;
export const REJOIN_GRACE_MS = 10_000;
export const CONNECT_TIMEOUT_MS = 30_000;

export interface SavedCall {
  peer: FriendPeer;
  video: boolean;
  initiator: boolean;
  savedAt: number;
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const session = (): KV | null => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

export function saveCall(s: SavedCall, storage: KV | null = session()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: the call just won't survive a room change */
  }
}

export function loadCall(now = Date.now(), storage: KV | null = session()): SavedCall | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedCall;
    if (!s?.peer?.id || typeof s.savedAt !== 'number' || now - s.savedAt > RESUME_MAX_AGE_MS) {
      storage?.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearCall(storage: KV | null = session()) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clampPos(p: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }, margin = 8) {
  return {
    x: Math.min(Math.max(margin, p.x), Math.max(margin, view.w - size.w - margin)),
    y: Math.min(Math.max(margin, p.y), Math.max(margin, view.h - size.h - margin)),
  };
}

type Send = (type: string, data?: unknown) => void;
let send: Send | null = null;
export function bindFriendCallSender(fn: Send | null) {
  send = fn;
}

const END_TEXT: Record<string, string> = {
  declined: 'Dia tak angkat',
  busy: 'Kawan kau tengah sibuk',
  cancelled: 'Panggilan dibatalkan',
  ended: 'Panggilan tamat',
  left: 'Dia dah keluar',
  timeout: 'Tak berjawab',
  lost: 'Talian terputus',
};

/** codes from the server that mean our outgoing ring never started */
const REJECT_CODES = new Set(['bad_request', 'self', 'not_friends', 'blocked_pair', 'friend_offline', 'busy_self', 'busy_peer', 'rate_limited', 'no_invite']);

const LIVE: FriendCallPhase[] = ['connecting', 'active', 'rejoining'];

export class FriendCallManager {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private remote: MediaStream | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private pendingSdp: RTCSessionDescriptionInit | null = null;
  private acceptedHere = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private videoEls: { local: HTMLVideoElement; remote: HTMLVideoElement } | null = null;

  constructor(private storage: KV | null = session()) {}

  private get s() {
    return useFriendCall.getState();
  }

  private patch(p: Partial<FriendCallView>) {
    useFriendCall.getState().patch(p);
  }

  private busy(): boolean {
    return this.s.phase !== 'idle' || useAppStore.getState().call.phase !== 'idle';
  }

  /** once, at game start: busy hook for same-room calls, park the call on navigation */
  install() {
    setOtherCallBusy(() => this.s.phase !== 'idle');
    window.addEventListener('pagehide', () => this.park());
  }

  private park() {
    const s = this.s;
    if (!s.peer || !LIVE.includes(s.phase)) return;
    saveCall({ peer: s.peer, video: s.video, initiator: s.initiator, savedAt: Date.now() }, this.storage);
  }

  els() {
    this.videoEls ??= (() => {
      const local = document.createElement('video');
      const remote = document.createElement('video');
      for (const el of [local, remote]) {
        el.autoplay = true;
        el.playsInline = true;
      }
      local.muted = true;
      return { local, remote };
    })();
    return this.videoEls;
  }

  // ---- user intents
  invite(peer: FriendPeer, video: boolean) {
    if (this.busy()) return useAppStore.getState().flash('you are already on a call');
    send?.('fcall_invite', { toUserId: peer.id, video });
    this.patch({ ...IDLE_FRIEND_CALL, phase: 'ringing_out', peer, video, initiator: true, ringingSince: Date.now() });
  }

  accept() {
    if (this.s.phase !== 'ringing_in') return;
    this.acceptedHere = true;
    send?.('fcall_accept');
    this.patch({ phase: 'connecting' });
  }

  decline() {
    const phase = this.s.phase;
    if (phase === 'idle') return;
    if (phase === 'ringing_in' || phase === 'ringing_out') send?.('fcall_decline', {});
    else send?.('fcall_end');
    this.teardown();
  }

  hangup() {
    this.decline();
  }

  toggleMic() {
    const on = !this.s.micOn;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.patch({ micOn: on });
  }

  toggleCam() {
    const on = !this.s.camOn;
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.patch({ camOn: on });
  }

  setCollapsed(collapsed: boolean) {
    this.patch({ collapsed });
  }

  report(reason: string, note?: string) {
    if (this.s.phase === 'idle') return;
    send?.('fcall_report', { reason, note });
    this.teardown();
  }

  /** every room (re)join: continue a parked or live call */
  resume() {
    const s = this.s;
    if (s.phase !== 'idle') {
      if (LIVE.includes(s.phase)) send?.('fcall_resume');
      return;
    }
    const saved = loadCall(Date.now(), this.storage);
    if (!saved) return;
    this.patch({ ...IDLE_FRIEND_CALL, phase: 'rejoining', peer: saved.peer, video: saved.video, initiator: saved.initiator });
    this.startTimer(REJOIN_GRACE_MS, 'Talian terputus');
    send?.('fcall_resume');
  }

  // ---- server events
  onIncoming(m: { from: FriendPeer; video: boolean }) {
    if (this.busy()) {
      send?.('fcall_decline', { busy: true });
      return;
    }
    this.patch({ ...IDLE_FRIEND_CALL, phase: 'ringing_in', peer: m.from, video: m.video, initiator: false, ringingSince: Date.now() });
  }

  async onStart(m: { peer: string; video: boolean; initiator: boolean }) {
    const s = this.s;
    const mine =
      s.peer?.id === m.peer && ((s.phase === 'ringing_out' && m.initiator) || (s.phase === 'connecting' && this.acceptedHere && !m.initiator));
    if (!mine) {
      // answered in another tab of mine
      if (s.phase === 'ringing_in' && s.peer?.id === m.peer) this.teardown();
      return;
    }
    this.patch({ phase: 'connecting', video: m.video, initiator: m.initiator });
    this.park();
    await this.connect(m.initiator, CONNECT_TIMEOUT_MS);
  }

  async onSignal(m: { from: string; data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit } }) {
    const s = this.s;
    if (s.phase === 'idle' || s.peer?.id !== m.from || !m.data) return;
    if (m.data.sdp) {
      if (!this.pc) {
        this.pendingSdp = m.data.sdp;
        return;
      }
      await this.applySdp(m.data.sdp);
    } else if (m.data.ice) {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(m.data.ice).catch(() => {});
      else this.pendingIce.push(m.data.ice);
    }
  }

  onHold(m: { peer: string }) {
    if (this.s.peer?.id !== m.peer) return;
    this.pc?.close();
    this.pc = null;
    this.hold();
  }

  async onRejoin(m: { peer: string; video: boolean; initiator: boolean }) {
    const s = this.s;
    if (s.phase === 'idle' || s.peer?.id !== m.peer) return;
    this.patch({ phase: 'rejoining', initiator: m.initiator, video: m.video });
    const pc = this.pc;
    if (pc && pc.connectionState === 'connected') {
      // only the websocket blipped: keep the connection, restart ICE
      this.startTimer(REJOIN_GRACE_MS, 'Talian terputus');
      if (m.initiator) {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        send?.('fsig', { toUserId: m.peer, data: { sdp: pc.localDescription } });
      }
      this.patch({ phase: 'active' });
      this.clearTimer();
      return;
    }
    this.pendingSdp = null;
    this.pendingIce = [];
    await this.connect(m.initiator, REJOIN_GRACE_MS);
  }

  onEnd(m: { reason: string }) {
    if (this.s.phase === 'idle') return;
    // 'elsewhere': another tab of mine took the call
    if (m.reason !== 'elsewhere') useAppStore.getState().flash(END_TEXT[m.reason] ?? 'Panggilan tamat');
    this.teardown();
  }

  /** a sys rejection while our ring is going out */
  onSys(code: string) {
    if (this.s.phase === 'ringing_out' && REJECT_CODES.has(code)) this.teardown();
  }

  // ---- media
  private async connect(initiator: boolean, timeoutMs: number) {
    const peer = this.s.peer;
    if (!peer) return;
    this.startTimer(timeoutMs, 'Tak dapat sambung');
    if (!this.local) {
      try {
        this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.s.video ? { facingMode: 'user', width: { ideal: 640 } } : false });
      } catch {
        useAppStore.getState().flash('mic/camera blocked');
        send?.('fcall_end');
        this.teardown();
        return;
      }
      this.local.getAudioTracks().forEach((t) => (t.enabled = this.s.micOn));
      this.local.getVideoTracks().forEach((t) => (t.enabled = this.s.camOn));
    }
    const els = this.els();
    els.local.srcObject = this.local;
    this.pc?.close();
    const remote = new MediaStream();
    this.remote = remote;
    els.remote.srcObject = remote;
    const pc = new RTCPeerConnection(await loadIce());
    this.pc = pc;
    for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    pc.ontrack = (ev) => {
      if (this.pc !== pc) return;
      remote.addTrack(ev.track);
      if (ev.track.kind === 'video') this.patch({ remoteHasVideo: true });
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.pc === pc) send?.('fsig', { toUserId: peer.id, data: { ice: ev.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'connected') {
        this.clearTimer();
        this.patch({ phase: 'active' });
        this.park();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.hold();
      }
    };
    if (this.pendingSdp) {
      const sdp = this.pendingSdp;
      this.pendingSdp = null;
      await this.applySdp(sdp);
    }
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send?.('fsig', { toUserId: peer.id, data: { sdp: pc.localDescription } });
    }
  }

  private async applySdp(sdp: RTCSessionDescriptionInit) {
    const pc = this.pc;
    const peer = this.s.peer;
    if (!pc || !peer) return;
    await pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send?.('fsig', { toUserId: peer.id, data: { sdp: pc.localDescription } });
    }
    for (const c of this.pendingIce) await pc.addIceCandidate(c).catch(() => {});
    this.pendingIce = [];
  }

  private hold() {
    if (!LIVE.includes(this.s.phase)) return;
    this.patch({ phase: 'rejoining' });
    if (!this.timer) this.startTimer(REJOIN_GRACE_MS, 'Talian terputus');
  }

  private startTimer(ms: number, text: string) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      const phase = this.s.phase;
      if (phase === 'connecting' || phase === 'rejoining') {
        useAppStore.getState().flash(text);
        send?.('fcall_end');
        this.teardown();
      }
    }, ms);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  teardown() {
    this.clearTimer();
    this.pc?.close();
    this.pc = null;
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.remote = null;
    if (this.videoEls) {
      this.videoEls.local.srcObject = null;
      this.videoEls.remote.srcObject = null;
    }
    this.pendingIce = [];
    this.pendingSdp = null;
    this.acceptedHere = false;
    clearCall(this.storage);
    useFriendCall.getState().reset();
  }
}

export const friendCall = new FriendCallManager();

/** Server message handlers; registered in Net.join() after the friends handlers. */
export const onFriendCallIncoming = (m: { from: FriendPeer; video: boolean }) => friendCall.onIncoming(m);
export const onFriendCallStart = (m: { peer: string; video: boolean; initiator: boolean }) => void friendCall.onStart(m);
export const onFriendCallEnd = (m: { reason: string }) => friendCall.onEnd(m);
export const onFriendCallHold = (m: { peer: string }) => friendCall.onHold(m);
export const onFriendCallRejoin = (m: { peer: string; video: boolean; initiator: boolean }) => void friendCall.onRejoin(m);
export const onFriendSignal = (m: { from: string; data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit } }) => void friendCall.onSignal(m);
export const onFriendCallSys = (code: string) => friendCall.onSys(code);
```

- [ ] **Step 5: Register the messages in net.ts**

After d7's import line `import { onFriendInvite, onFriendInviteSent, onFriendPresence, onFriendRequest, onFriendUpdate } from './friends';` add:

```ts
import { onFriendCallEnd, onFriendCallHold, onFriendCallIncoming, onFriendCallRejoin, onFriendCallStart, onFriendCallSys, onFriendSignal } from './friendCall';
import { onAdultRequired } from './adultGate';
```

Directly after `room.onMessage('friend_invite_sent', onFriendInviteSent);` add:

```ts
    // friend calls (cross-room)
    room.onMessage('fcall_incoming', onFriendCallIncoming);
    room.onMessage('fcall_ringing', () => {});
    room.onMessage('fcall_start', onFriendCallStart);
    room.onMessage('fcall_end', onFriendCallEnd);
    room.onMessage('fcall_hold', onFriendCallHold);
    room.onMessage('fcall_rejoin', onFriendCallRejoin);
    room.onMessage('fsig', onFriendSignal);
```

In the `sys` handler, replace

```ts
    room.onMessage('sys', (m: { code: string }) => {
      const msgs: Record<string, string> = {
```

with

```ts
    room.onMessage('sys', (m: { code: string }) => {
      onFriendCallSys(m.code);
      if (m.code === 'adult_required') return onAdultRequired();
      const msgs: Record<string, string> = {
```

and replace the map's last entry

```ts
        friend_offline: 'they went offline',
      };
```

with

```ts
        friend_offline: 'they went offline',
        self: "that's you",
        no_call: 'no call to report',
      };
```

- [ ] **Step 6: Bind in Game.ts**

Add to the imports of `client/src/game/Game.ts` (after d7's `import { bindFriendSender, useFriends } from '../friends';`):

```ts
import { bindFriendCallSender, friendCall } from '../friendCall';
```

After the `void loadIce();` line (Task 5) add:

```ts
    bindFriendCallSender((type, data) => this.net.send(type, data));
    friendCall.install();
```

Inside `onJoined`, after `void useFriends.getState().load();` add:

```ts
          friendCall.resume();
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @dovey/client test && pnpm --filter @dovey/client typecheck`
Expected: all client tests pass (`friendCall.test.ts`: 8 tests); typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add client/src/friendCall.ts client/src/friendCall.test.ts client/src/adultGate.ts client/src/net.ts client/src/game/Game.ts
git commit -F - <<'MSG'
feat(client): friend call manager with room-change resume and message wiring

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 7: Friend-call UI — window, ringing popup, sheet buttons, adult gate

**Files:**
- Create: `client/src/ui/FriendCallWindow.tsx`, `client/src/ui/FriendCallPopup.tsx`, `client/src/ui/FriendCallButtons.tsx`, `client/src/ui/AdultGate.tsx`, `client/src/ui/friend-call.css`
- Modify: `client/src/ui/FriendsSheet.tsx` (coordination point 1 with jomville-d7)
- Modify: `client/src/App.tsx` — imports after `import { CallUI } from './ui/CallUI';`; mounts directly after `<CallUI />`

**Interfaces:**
- Consumes: `friendCall`, `useFriendCall`, `clampPos`, `FRIEND_RING` constants (Task 6); `useAdultGate`; `confirmAdult` (Task 5); `FriendView` (`client/src/api.ts`, d7); `REPORT_REASONS` (`@dovey/shared`); `AvatarPreview`; `useAppStore` (`actions.callInvite`)
- Produces: `FriendCallWindow()`, `FriendCallPopup()`, `FriendCallButtons({ f }: { f: FriendView })`, `AdultGate()`

- [ ] **Step 1: Buttons**

Create `client/src/ui/FriendCallButtons.tsx`:

```tsx
import type { FriendView } from '../api';
import { friendCall, useFriendCall } from '../friendCall';
import { useFriends } from '../friends';
import { useAppStore } from '../store';
import './friend-call.css';

/** 🎙 / 📹 on a friend row. Owned by the friend-calls feature, rendered inside d7's FriendsSheet. */
export function FriendCallButtons({ f }: { f: FriendView }) {
  const busy = useFriendCall((s) => s.phase !== 'idle') || useAppStore((s) => s.call.phase !== 'idle');
  const start = (video: boolean) => {
    friendCall.invite({ id: f.id, handle: f.handle, avatar: f.avatar }, video);
    useFriends.getState().setOpen(false);
  };
  return (
    <span className="fcall-btns">
      <button className="btn" disabled={!f.online || busy} onClick={() => start(false)} aria-label={`voice call ${f.handle}`} title="panggilan suara">
        🎙
      </button>
      <button className="btn" disabled={!f.online || busy} onClick={() => start(true)} aria-label={`video call ${f.handle}`} title="panggilan video">
        📹
      </button>
    </span>
  );
}
```

Note: the two hooks are called unconditionally (the `||` evaluates both selectors every render because each `useX(...)` call runs before `||` short-circuits only on the value — to keep hook order stable write it as two consts):

```tsx
  const friendBusy = useFriendCall((s) => s.phase !== 'idle');
  const roomBusy = useAppStore((s) => s.call.phase !== 'idle');
  const busy = friendBusy || roomBusy;
```

Use this two-const form in the file (replace the single `const busy = ...` line with these three lines).

- [ ] **Step 2: Coordination point 1 — FriendsSheet**

In `client/src/ui/FriendsSheet.tsx`, after `import { AvatarPreview } from './AvatarPreview';` add:

```tsx
import { FriendCallButtons } from './FriendCallButtons';
```

In `FriendRow`, replace

```tsx
          <>
            <button className="btn btn--primary" disabled={!f.online || sameRoom} onClick={() => friends.invite(f.id)} title="invite to my room">
```

with

```tsx
          <>
            <FriendCallButtons f={f} />
            <button className="btn btn--primary" disabled={!f.online || sameRoom} onClick={() => friends.invite(f.id)} title="invite to my room">
```

Nothing else in the file changes.

- [ ] **Step 3: Ringing popup**

Create `client/src/ui/FriendCallPopup.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { parseAvatar } from '@dovey/shared';
import { friendCall, useFriendCall } from '../friendCall';
import { AvatarPreview } from './AvatarPreview';
import './friend-call.css';

const RING_MS = 30_000;

/** "{handle} panggil kau" with Angkat / Tolak and a 30 s countdown. */
export function FriendCallPopup() {
  const phase = useFriendCall((s) => s.phase);
  const peer = useFriendCall((s) => s.peer);
  const video = useFriendCall((s) => s.video);
  const since = useFriendCall((s) => s.ringingSince);
  const [now, setNow] = useState(() => Date.now());
  const cfg = useMemo(() => (peer ? parseAvatar(peer.avatar) : null), [peer]);

  useEffect(() => {
    if (phase !== 'ringing_in') return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  if (phase !== 'ringing_in' || !peer || !cfg) return null;
  const left = Math.max(0, Math.ceil((RING_MS - (now - since)) / 1000));

  return (
    <div className="fcall-ring" role="alertdialog" aria-label={`${peer.handle} panggil kau`}>
      <span className="fcall-ring__head">
        <AvatarPreview cfg={cfg} focus="head" scale={1.6} animate={false} fx={false} />
      </span>
      <div className="fcall-ring__text">
        <b>{peer.handle}</b> panggil kau {video ? '📹' : '🎙'}
        <span className="fcall-ring__left">{left}s</span>
      </div>
      <div className="fcall-ring__btns">
        <button className="btn btn--go" onClick={() => friendCall.accept()}>
          Angkat
        </button>
        <button className="btn btn--danger" onClick={() => friendCall.decline()}>
          Tolak
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Floating window**

Create `client/src/ui/FriendCallWindow.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { REPORT_REASONS, parseAvatar } from '@dovey/shared';
import { clampPos, friendCall, useFriendCall } from '../friendCall';
import { AvatarPreview } from './AvatarPreview';
import './friend-call.css';

const POS_KEY = 'leypark.fcall.pos';

function loadPos(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? '');
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
  } catch {
    /* default below */
  }
  return { x: window.innerWidth - 240, y: 90 };
}

function savePos(p: { x: number; y: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function Slot({ el, mirror }: { el: HTMLVideoElement; mirror?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.appendChild(el);
    el.play().catch(() => {});
    return () => {
      if (el.parentElement === host) host.removeChild(el);
    };
  }, [el]);
  return <div ref={ref} className={`fcall-win__video ${mirror ? 'fcall-win__video--mirror' : ''}`} />;
}

/** Floating, draggable call window (collapses to a bubble). Stays up while walking and across room changes. */
export function FriendCallWindow() {
  const phase = useFriendCall((s) => s.phase);
  const peer = useFriendCall((s) => s.peer);
  const video = useFriendCall((s) => s.video);
  const micOn = useFriendCall((s) => s.micOn);
  const camOn = useFriendCall((s) => s.camOn);
  const remoteHasVideo = useFriendCall((s) => s.remoteHasVideo);
  const collapsed = useFriendCall((s) => s.collapsed);
  const [pos, setPos] = useState(loadPos);
  const [reporting, setReporting] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number; id: number; moved: boolean } | null>(null);
  const cfg = useMemo(() => (peer ? parseAvatar(peer.avatar) : null), [peer]);

  useEffect(() => {
    const onResize = () => {
      const r = box.current?.getBoundingClientRect();
      if (r) setPos((p) => clampPos(p, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (phase === 'idle' || phase === 'ringing_in' || !peer || !cfg) return null;

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, id: e.pointerId, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.moved = true;
    const r = box.current?.getBoundingClientRect();
    setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, { w: r?.width ?? 220, h: r?.height ?? 160 }, { w: window.innerWidth, h: window.innerHeight }));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    savePos(pos);
    if (!d.moved && collapsed) friendCall.setCollapsed(false);
  };

  const status =
    phase === 'ringing_out' ? 'Memanggil…' : phase === 'connecting' ? 'Menyambung…' : phase === 'rejoining' ? 'Menyambung semula…' : null;
  const els = friendCall.els();

  return (
    <div
      ref={box}
      className={`fcall-win ${collapsed ? 'fcall-win--bubble' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      role="dialog"
      aria-label={`panggilan dengan ${peer.handle}`}
    >
      {collapsed ? (
        <span className="fcall-win__bubble-head">
          <AvatarPreview cfg={cfg} focus="head" scale={1.6} animate={false} fx={false} />
          {status && <i className="fcall-win__pulse" />}
        </span>
      ) : reporting ? (
        <div className="fcall-win__report">
          <b>Report {peer.handle}</b>
          {REPORT_REASONS.map((r) => (
            <button key={r.id} className="reason" onClick={() => friendCall.report(r.id)}>
              {r.label}
            </button>
          ))}
          <button className="btn" onClick={() => setReporting(false)}>
            back
          </button>
        </div>
      ) : (
        <>
          <div className="fcall-win__top">
            <span className="fcall-win__who">{peer.handle}</span>
            <button className="fcall-win__icon" onClick={() => friendCall.setCollapsed(true)} aria-label="kecilkan">
              ▾
            </button>
          </div>
          <div className="fcall-win__stage">
            {video && remoteHasVideo ? (
              <Slot el={els.remote} />
            ) : (
              <span className="fcall-win__avatar">
                <AvatarPreview cfg={cfg} focus="head" scale={3} animate={false} fx={false} />
                <Slot el={els.remote} />
              </span>
            )}
            {video && (
              <div className="fcall-win__pip">
                <Slot el={els.local} mirror />
              </div>
            )}
            {status && <span className="fcall-win__status">{status}</span>}
          </div>
          <div className="fcall-win__bar">
            <button className={`fcall-win__icon ${micOn ? '' : 'fcall-win__icon--off'}`} onClick={() => friendCall.toggleMic()} aria-label="mic">
              {micOn ? '🎙' : '🔇'}
            </button>
            {video && (
              <button className={`fcall-win__icon ${camOn ? '' : 'fcall-win__icon--off'}`} onClick={() => friendCall.toggleCam()} aria-label="kamera">
                {camOn ? '📹' : '🚫'}
              </button>
            )}
            <button className="fcall-win__icon" onClick={() => setReporting(true)} aria-label="report">
              🚩
            </button>
            <button className="fcall-win__end" onClick={() => friendCall.hangup()} aria-label="letak">
              📵
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Adult gate dialog**

Create `client/src/ui/AdultGate.tsx`:

```tsx
import { useState } from 'react';
import { confirmAdult } from '../api';
import { useAdultGate } from '../adultGate';
import { useAppStore } from '../store';
import './friend-call.css';

/** One-time 18+ confirmation before calling someone who is not a friend. */
export function AdultGate() {
  const pending = useAdultGate((s) => s.pending);
  const close = useAdultGate((s) => s.close);
  const [saving, setSaving] = useState(false);
  if (!pending) return null;

  const yes = async () => {
    setSaving(true);
    const ok = await confirmAdult();
    setSaving(false);
    if (!ok) return useAppStore.getState().flash('Tak jadi. Cuba lagi.');
    close();
    useAppStore.getState().actions?.callInvite(pending.peer, pending.handle, pending.video);
  };

  return (
    <div className="fcall-adult" role="dialog" aria-label="pengesahan umur">
      <p>
        Panggilan dengan orang yang bukan kawan hanya untuk umur 18 tahun ke atas. Kawan boleh call tanpa pengesahan.
      </p>
      <div className="fcall-adult__btns">
        <button className="btn btn--primary" disabled={saving} onClick={yes}>
          Saya 18 tahun ke atas
        </button>
        <button className="btn" onClick={close}>
          Batal
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Styles**

Create `client/src/ui/friend-call.css`:

```css
/* ---- friend calls: sheet buttons, ringing popup, floating window, adult gate ---- */
.fcall-btns { display: inline-flex; gap: 4px; }
.fcall-btns .btn { min-width: 34px; padding: 4px 6px; }

.fcall-ring {
  position: absolute; top: calc(140px + env(safe-area-inset-top, 0px)); left: 50%; z-index: 45; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; width: min(92vw, 380px); padding: 10px 12px; border-radius: 20px;
  background: var(--cream, #fff8ec); border: 3px solid var(--ink, #3b2a2a); box-shadow: 0 6px 0 rgba(59, 42, 42, 0.25);
}
.fcall-ring__head { flex: none; width: 52px; height: 52px; border-radius: 50%; overflow: hidden; background: #f1e9ff; }
.fcall-ring__head canvas { width: 100%; height: 100%; image-rendering: pixelated; }
.fcall-ring__text { flex: 1; min-width: 0; font-weight: 700; font-size: 14px; }
.fcall-ring__left { display: block; font-size: 12px; opacity: 0.6; }
.fcall-ring__btns { display: flex; flex-direction: column; gap: 6px; }
.fcall-ring__btns .btn { min-height: 34px; padding: 4px 12px; font-size: 13px; }

.fcall-win {
  position: fixed; z-index: 44; width: min(240px, calc(100vw - 16px)); border-radius: 18px; overflow: hidden;
  background: #1f1a24; color: #fff; border: 3px solid var(--ink, #3b2a2a); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  touch-action: none; user-select: none; cursor: grab;
}
.fcall-win--bubble { width: 64px; height: 64px; border-radius: 50%; }
.fcall-win__bubble-head { position: relative; display: block; width: 100%; height: 100%; }
.fcall-win__bubble-head canvas { width: 100%; height: 100%; image-rendering: pixelated; }
.fcall-win__pulse { position: absolute; inset: 0; border-radius: 50%; box-shadow: inset 0 0 0 3px #f4b73c; }
.fcall-win__top { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; font-weight: 800; }
.fcall-win__who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fcall-win__stage { position: relative; aspect-ratio: 4 / 3; max-width: 100%; background: #000; display: grid; place-items: center; }
.fcall-win__video { width: 100%; height: 100%; }
.fcall-win__video video { width: 100%; height: 100%; object-fit: cover; }
.fcall-win__video--mirror video { transform: scaleX(-1); }
.fcall-win__avatar { display: grid; place-items: center; }
.fcall-win__avatar .fcall-win__video { position: absolute; width: 1px; height: 1px; opacity: 0; }
.fcall-win__avatar canvas { image-rendering: pixelated; }
.fcall-win__pip { position: absolute; right: 6px; bottom: 6px; width: 64px; aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden; border: 2px solid #fff; }
.fcall-win__status { position: absolute; left: 8px; bottom: 8px; padding: 2px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.6); font-size: 12px; font-weight: 700; }
.fcall-win__bar { display: flex; justify-content: space-around; padding: 6px; gap: 4px; }
.fcall-win__icon, .fcall-win__end { min-width: 40px; min-height: 40px; border-radius: 999px; border: 0; background: rgba(255, 255, 255, 0.14); color: #fff; font-size: 18px; cursor: pointer; }
.fcall-win__icon--off { background: rgba(255, 79, 109, 0.5); }
.fcall-win__end { background: #e8384f; }
.fcall-win__report { display: flex; flex-direction: column; gap: 6px; padding: 10px; max-height: 60vh; overflow-y: auto; }
.fcall-win__report .reason { text-align: left; }

.fcall-adult {
  position: fixed; left: 50%; top: 50%; z-index: 60; transform: translate(-50%, -50%); width: min(92vw, 360px);
  padding: 16px; border-radius: 20px; background: var(--cream, #fff8ec); border: 3px solid var(--ink, #3b2a2a); box-shadow: 0 8px 0 rgba(59, 42, 42, 0.25);
  font-weight: 700;
}
.fcall-adult__btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
```

- [ ] **Step 7: Mount in App.tsx**

After `import { CallUI } from './ui/CallUI';` add:

```tsx
import { FriendCallWindow } from './ui/FriendCallWindow';
import { FriendCallPopup } from './ui/FriendCallPopup';
import { AdultGate } from './ui/AdultGate';
```

Replace `      <CallUI />` with:

```tsx
      <CallUI />
      <FriendCallWindow />
      <FriendCallPopup />
      <AdultGate />
```

- [ ] **Step 8: Typecheck, test, build**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test && pnpm --filter @dovey/client build`
Expected: typecheck exits 0; tests pass; `✓ built in`.

- [ ] **Step 9: Commit**

```bash
git add client/src/ui/FriendCallWindow.tsx client/src/ui/FriendCallPopup.tsx client/src/ui/FriendCallButtons.tsx client/src/ui/AdultGate.tsx client/src/ui/friend-call.css client/src/ui/FriendsSheet.tsx client/src/App.tsx
git commit -F - <<'MSG'
feat(client): floating friend call window, ringing popup, call buttons and age gate

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

Tell jomville-d7 (coordination): `FriendsSheet.tsx` now imports `FriendCallButtons` and renders it first in `FriendRow`'s buttons; `/api/friends/remove` ends an active friend call.

---

### Task 8: Two-client cross-room smoke script

**Files:**
- Create: `client/scripts/friend-call-smoke.mjs` (under `client/` so `colyseus.js` resolves from the client package)

**Interfaces:**
- Consumes: running server on port 2597; `POST /api/me`, `/api/friends/request`, `/api/friends/respond`; room messages from Task 4
- Produces: exit code 0 and `friend-call smoke: OK`, or exit 1 with the failing step

- [ ] **Step 1: Write the script**

Create `client/scripts/friend-call-smoke.mjs`:

```js
// Two (three) headless clients in different rooms exercise friend-call signaling end to end.
// Usage: server on 2597, then `node client/scripts/friend-call-smoke.mjs`
import { randomBytes } from 'node:crypto';
import { Client } from 'colyseus.js';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:2597';
const WS = BASE.replace(/^http/, 'ws');
const token = () => randomBytes(16).toString('hex');

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** join a room and keep every message in an inbox so nothing is missed between awaits */
async function join(slug, tok) {
  const room = await new Client(WS).joinOrCreate('room', { slug, token: tok });
  const inbox = [];
  const waiters = [];
  room.onMessage('*', (type, message) => {
    const i = waiters.findIndex((w) => w.type === type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(message);
    else inbox.push({ type, message });
  });
  const next = (type, ms = 5000) => {
    const i = inbox.findIndex((e) => e.type === type);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0].message);
    return new Promise((resolve, reject) => {
      const w = { type, resolve };
      waiters.push(w);
      setTimeout(() => {
        const k = waiters.indexOf(w);
        if (k >= 0) {
          waiters.splice(k, 1);
          reject(new Error(`${slug}: timeout waiting for ${type}`));
        }
      }, ms);
    });
  };
  const userId = await new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const p = room.state?.players?.get?.(room.sessionId);
      if (p?.userId) return resolve(p.userId);
      if (Date.now() - started > 5000) return reject(new Error(`${slug}: no player state`));
      setTimeout(check, 50);
    };
    check();
  });
  return { room, next, userId, send: (t, d) => room.send(t, d) };
}

async function main() {
  const [ta, tb, tc] = [token(), token(), token()];
  for (const t of [ta, tb, tc]) assert((await post('/api/me', { token: t })).status === 200, 'create user');

  const a = await join('mainlobby', ta);
  let b = await join('gameden', tb);
  const c = await join('casino', tc);
  console.log('1. three clients in three rooms');

  assert((await post('/api/friends/request', { token: ta, toUserId: b.userId })).json?.result === 'sent', 'friend request');
  assert((await post('/api/friends/respond', { token: tb, fromUserId: a.userId, accept: true })).json?.result === 'accepted', 'friend accept');
  console.log('2. a and b are friends');

  c.send('fcall_invite', { toUserId: a.userId, video: false });
  assert((await c.next('sys')).code === 'not_friends', 'non-friend is refused');
  console.log('3. non-friend invite refused');

  a.send('fcall_invite', { toUserId: b.userId, video: true });
  await a.next('fcall_ringing');
  const inc = await b.next('fcall_incoming');
  assert(inc.from.id === a.userId && inc.video === true, 'incoming payload');
  b.send('fcall_accept');
  assert((await a.next('fcall_start')).initiator === true, 'caller is initiator');
  assert((await b.next('fcall_start')).initiator === false, 'callee answers');
  a.send('fsig', { toUserId: b.userId, data: { sdp: { type: 'offer', sdp: 'smoke' } } });
  assert((await b.next('fsig')).from === a.userId, 'signal relayed across rooms');
  console.log('4. rang, accepted, relayed across rooms');

  await b.room.leave();
  assert((await a.next('fcall_hold')).peer === b.userId, 'hold while b changes room');
  b = await join('wonderdome', tb);
  b.send('fcall_resume');
  assert((await b.next('fcall_rejoin')).initiator === false, 'b rejoins');
  assert((await a.next('fcall_rejoin')).initiator === true, 'a renegotiates');
  b.send('fsig', { toUserId: a.userId, data: { sdp: { type: 'answer', sdp: 'smoke' } } });
  assert((await a.next('fsig')).from === b.userId, 'signal after room change');
  console.log('5. b changed room within the grace and the call resumed');

  a.send('fcall_end');
  assert((await b.next('fcall_end')).reason === 'ended', 'hang up reaches b');
  console.log('6. hang up');

  await new Promise((r) => setTimeout(r, 10_500)); // pair rate limit (10 s)
  a.send('fcall_invite', { toUserId: b.userId, video: false });
  await b.next('fcall_incoming');
  b.send('fcall_accept');
  await a.next('fcall_start');
  await b.room.leave();
  await a.next('fcall_hold');
  assert((await a.next('fcall_end', 15_000)).reason === 'lost', 'grace expiry ends the call');
  console.log('7. no rejoin within 10 s ends the call');

  await a.room.leave();
  await c.room.leave();
  console.log('friend-call smoke: OK');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('friend-call smoke: FAIL -', e.message);
    process.exit(1);
  },
);
```

- [ ] **Step 2: Run it against a fresh server**

```bash
rm -rf /tmp/leypark-fcall-pglite
PORT=2597 PGLITE_DIR=/tmp/leypark-fcall-pglite pnpm --filter @dovey/server dev
```

In a second shell (worktree root): `node client/scripts/friend-call-smoke.mjs`
Expected output ends with:

```
6. hang up
7. no rejoin within 10 s ends the call
friend-call smoke: OK
```

and exit code 0 (`echo $?` → `0`). Stop the server afterwards.

- [ ] **Step 3: Commit**

```bash
git add client/scripts/friend-call-smoke.mjs
git commit -F - <<'MSG'
test: two-client cross-room friend call smoke script

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 9: Manual browser check (controller)

**Files:** none

**Interfaces:**
- Consumes: the whole feature
- Produces: pass/fail note in the task report

- [ ] **Step 1: Build and serve on 2597**

```bash
pnpm --filter @dovey/client build
ln -sfn "$PWD/client/dist" /tmp/leypark-social-dist
PORT=2597 CLIENT_DIST=/tmp/leypark-social-dist PGLITE_DIR=/tmp/leypark-fcall-pglite pnpm --filter @dovey/server dev
```

Expected: `serving client from /tmp/leypark-social-dist`, `listening on http://localhost:2597`.

- [ ] **Step 2: Two browser profiles (A, B), both at `http://localhost:2597/play`**

- Make them friends (tap avatar → 👥 add friend; accept in B's friends sheet).
- B walks to another room (map → any room). A opens 👥: B shows online "in <room>" with 🎙 📹 enabled.
- A taps 📹: A sees the floating window "Memanggil…"; B sees "A panggil kau" popup with countdown.
- B taps Angkat: both windows show remote video and a mirrored self preview; toggle mic/camera on both sides.
- Drag A's window around (stays inside the viewport at desktop and at 400 px width); collapse to bubble; tap to expand; reload keeps the position.
- A walks around the room: the window stays.
- B changes room via the room browser: B's page reloads, window shows "Menyambung semula…", video returns within ~10 s on both sides.
- A 🚩 → pick a reason: call ends for both; `curl -s -H "x-mod-token: $MOD_TOKEN" localhost:2597/api/mod/reports` (with `MOD_TOKEN` set in the server env) lists the report with context `friend call`.
- Decline path: A calls B again after 10 s, B taps Tolak → A sees "Dia tak angkat".
- Busy: while A↔B call, a third profile C (friend of B) calls B → C sees "Kawan kau tengah sibuk".
- Non-friend same-room call: C taps A's avatar → 📹 video call → "Saya 18 tahun ke atas" dialog; confirm → the normal same-room call rings; a second call later does not ask again.
- ICE: `curl -s -X POST localhost:2597/api/ice -H 'content-type: application/json' -d '{"token":"<A token from localStorage dovey.token>"}'` → STUN only; restart the server with `TURN_URLS=turn:example.invalid:3478 TURN_USERNAME=u TURN_CREDENTIAL=p` → response includes the TURN entry.

- [ ] **Step 3: Stop the server**

Ctrl+C; `rm -rf /tmp/leypark-fcall-pglite` if the data should not persist.

---

## Done when

- Server and client tests pass, both typechecks exit 0, client build succeeds, smoke script prints `friend-call smoke: OK`.
- Friends can call each other across rooms; ring times out after 30 s; busy users auto-decline; room changes resume within 10 s or end the call; blocking/unfriending/reporting ends it.
- Same-room calls still work; non-friends need the one-time 18+ confirmation.
- `/api/ice` serves STUN, plus TURN only with full env; client falls back to STUN-only.
- d7's files touched only at the two coordination points.

## Self-review against the spec

| Spec requirement | Task |
| --- | --- |
| Call online friends across rooms: `fcall_invite/accept/decline/end`, `fsig` via `presence.notify`, friend + block (both ways) + online gates, rate limits | 2, 4 |
| Ringing popup Accept/Decline, 30 s timeout, busy | 1, 2, 6, 7 |
| Only the accepting tab gets the call (`presence.notifySession` / `presence.sessions`), other tabs stop ringing | 2, 6 |
| Pure `FriendCallBook` keyed by userId with injected clock in `server/src/social-calls.ts`; thin GameRoom handlers separate from friends block | 1, 2, 4 |
| Floating draggable window, bubble, mute, camera, hang up, 🚩 report ending the call | 2, 6, 7 |
| Room change → re-join and renegotiate within 10 s (sessionStorage park, `fcall_resume`, `fcall_rejoin`, ICE restart when the connection survived) | 1, 2, 4, 6 |
| Same-room calls keep working; non-friend calls need "Saya 18 tahun ke atas" stored in `users.adult_confirmed_at`; SAFETY TODO resolved | 3, 4, 5, 6, 7 |
| `POST /api/ice {token}` STUN + env TURN; client fetches once with STUN fallback in call.ts and voice.ts | 3, 5 |
| Tests: book (busy, TTL, rejoin grace), gating, `/api/ice` env, two-client cross-room smoke, manual check | 1, 2, 3, 8, 9 |
