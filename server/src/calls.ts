import { RateLimiter } from '@dovey/shared';

/**
 * Consent-gated 1-to-1 call signaling inside a room. Pure state; the room
 * relays messages. A call only starts after the callee explicitly accepts.
 */
export type CallState =
  | { kind: 'idle' }
  | { kind: 'invited'; peer: string; video: boolean; since: number; initiator: boolean }
  | { kind: 'active'; peer: string; video: boolean };

export const INVITE_TTL_MS = 30_000;

export class CallBook {
  private state = new Map<string, CallState>();
  private inviteLimit = new RateLimiter(3, 30_000);

  get(id: string): CallState {
    return this.state.get(id) ?? { kind: 'idle' };
  }

  /** Caller invites callee. Returns error code or null. */
  invite(from: string, to: string, video: boolean, now = Date.now()): string | null {
    if (from === to) return 'self';
    if (this.get(from).kind !== 'idle') return 'busy_self';
    if (this.get(to).kind !== 'idle') return 'busy_peer';
    if (!this.inviteLimit.allow(from, now)) return 'rate_limited';
    this.state.set(from, { kind: 'invited', peer: to, video, since: now, initiator: true });
    this.state.set(to, { kind: 'invited', peer: from, video, since: now, initiator: false });
    return null;
  }

  /** Callee accepts. Returns the pair or null if there was no matching invite. */
  accept(callee: string, now = Date.now()): { caller: string; video: boolean } | null {
    const s = this.get(callee);
    if (s.kind !== 'invited' || s.initiator) return null;
    if (now - s.since > INVITE_TTL_MS) {
      this.clear(callee);
      return null;
    }
    const caller = s.peer;
    const cs = this.get(caller);
    if (cs.kind !== 'invited' || cs.peer !== callee) {
      this.clear(callee);
      return null;
    }
    this.state.set(caller, { kind: 'active', peer: callee, video: s.video });
    this.state.set(callee, { kind: 'active', peer: caller, video: s.video });
    return { caller, video: s.video };
  }

  /** Put two idle people straight into a call. Love Meter only: joining its queue is the consent. */
  pair(a: string, b: string, video: boolean): boolean {
    if (a === b || this.get(a).kind !== 'idle' || this.get(b).kind !== 'idle') return false;
    this.state.set(a, { kind: 'active', peer: b, video });
    this.state.set(b, { kind: 'active', peer: a, video });
    return true;
  }

  /** Decline, cancel, or hang up. Returns the peer that must be notified, if any. */
  clear(id: string): string | null {
    const s = this.get(id);
    if (s.kind === 'idle') return null;
    this.state.delete(id);
    const ps = this.get(s.peer);
    if (ps.kind !== 'idle' && ps.peer === id) this.state.delete(s.peer);
    return s.peer;
  }

  /** Whether a relayed RTC payload from `from` to `to` is allowed. */
  canRelay(from: string, to: string): boolean {
    const s = this.get(from);
    return s.kind === 'active' && s.peer === to;
  }

  /** Expire stale invites; returns affected pairs. */
  sweep(now = Date.now()): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const [id, s] of this.state) {
      if (s.kind === 'invited' && s.initiator && now - s.since > INVITE_TTL_MS) {
        out.push([id, s.peer]);
        this.clear(id);
      }
    }
    return out;
  }
}
