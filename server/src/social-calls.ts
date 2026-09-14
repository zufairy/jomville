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

/**
 * Rolling-window hit counter, same count/windowMs semantics as
 * `@dovey/shared`'s RateLimiter, but split into a non-recording peek and an
 * explicit record so a caller can check several limits and only commit hits
 * once every one of them has passed (see FriendCallBook#invite).
 */
class Window {
  private hits = new Map<string, number[]>();

  constructor(private count: number, private windowMs: number) {}

  /** Prunes stale hits for `key` and reports whether one more would fit, without recording it. */
  wouldAllow(key: string, now: number): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, arr);
    return arr.length < this.count;
  }

  record(key: string, now: number) {
    const arr = this.hits.get(key) ?? [];
    arr.push(now);
    this.hits.set(key, arr);
  }
}

export class FriendCallBook {
  private state = new Map<string, FriendCallState>();
  private callerLimit = new Window(FRIEND_CALL_RATE.count, FRIEND_CALL_RATE.windowMs);
  private pairLimit = new Window(1, FRIEND_CALL_PAIR_MS);

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
    const pairKey = `${from}>${to}`;
    // Only an invite that actually rings should count against either limit: peek at
    // both without recording, and record both only once both have passed. Otherwise
    // an invite rejected by one limit still consumes a token on the other, wrongly
    // blocking a later, legitimate invite once that limit's window frees up.
    if (!this.pairLimit.wouldAllow(pairKey, t)) return 'rate_limited';
    if (!this.callerLimit.wouldAllow(from, t)) return 'rate_limited';
    this.pairLimit.record(pairKey, t);
    this.callerLimit.record(from, t);
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
