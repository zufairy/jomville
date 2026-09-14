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
    // Check the pair limit first: a repeat invite to the same peer that is only
    // blocked by the 10s per-pair cooldown must not also consume a per-caller
    // rate-limit token, or it silently eats into the 3-per-30s budget.
    if (!this.pairLimit.allow(`${from}>${to}`, t)) return 'rate_limited';
    if (!this.callerLimit.allow(from, t)) return 'rate_limited';
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
