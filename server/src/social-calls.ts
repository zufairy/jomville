/**
 * Friend calls: consent-gated 1-to-1 voice/video between friends in any room.
 * Keyed by userId (sessions change when someone changes rooms). In-process,
 * like presence; the server only relays signaling, never media.
 */
import { REPORT_NOTE_MAX, REPORT_RATE, RateLimiter, VOICE_RTC_RATE, isReportReason } from '@dovey/shared';
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
  /** caller -> token and target for an in-flight invite() still awaiting its gating checks */
  private pendingInvite = new Map<string, { token: symbol; to: string }>();

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

  /** whether `sessionId` is the tab currently carrying this user's call */
  isCallSession(userId: string, sessionId: string): boolean {
    return this.callSession.get(userId) === sessionId;
  }

  /**
   * Null when the invite rang, or when it was superseded (hangup, a newer invite, unfriend,
   * session loss) while its gating checks were resolving: a superseded invite fails silently
   * so a stale failure can never tear down a newer ring on the client.
   */
  async invite(me: CallerInfo, sessionId: string, toRaw: unknown, videoRaw: unknown): Promise<FriendCallError | null> {
    const to = userIdOf(toRaw);
    if (!to) return 'bad_request';
    if (to === me.id) return 'self';
    // A caller can hangup/cancel while areFriends/blockPairs are still resolving; only the
    // latest invite() from this caller may go ahead once its awaits settle.
    const token = Symbol();
    this.pendingInvite.set(me.id, { token, to });
    const stillPending = () => this.pendingInvite.get(me.id)?.token === token;
    const isFriend = await this.d.areFriends(me.id, to);
    if (!stillPending()) return null;
    if (!isFriend) {
      this.pendingInvite.delete(me.id);
      return 'not_friends';
    }
    const blocked = (await this.d.blockPairs(me.id)).includes(to);
    if (!stillPending()) return null;
    if (blocked) {
      this.pendingInvite.delete(me.id);
      return 'blocked_pair';
    }
    if (!this.d.isOnline(to)) {
      this.pendingInvite.delete(me.id);
      return 'friend_offline';
    }
    const video = videoRaw === true;
    const err = this.book.invite(me.id, to, video);
    this.pendingInvite.delete(me.id);
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
    this.pendingInvite.delete(meId);
    this.finish(meId, 'ended');
  }

  /** unfriend or block: end a call between exactly these two */
  endBetween(a: string, b: string) {
    // an invite still awaiting its gates, in either direction, must not ring afterwards
    if (this.pendingInvite.get(a)?.to === b) this.pendingInvite.delete(a);
    if (this.pendingInvite.get(b)?.to === a) this.pendingInvite.delete(b);
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
  /**
   * `fresh`: the resuming tab has no live peer connection (always after a page reload), so
   * both sides must rebuild theirs; an ICE restart only works against the same connection.
   */
  resume(meId: string, sessionId: string, fresh: boolean) {
    const r = this.book.resume(meId);
    if (!r) return;
    this.callSession.set(meId, sessionId);
    this.d.notifySession(meId, sessionId, 'fcall_rejoin', { peer: r.peer, video: r.video, initiator: r.initiator, fresh });
    this.toTab(r.peer, 'fcall_rejoin', { peer: meId, video: r.video, initiator: !r.initiator, fresh });
  }

  /** the call's tab left, or the user's last session did */
  sessionLost(userId: string) {
    this.pendingInvite.delete(userId);
    const r = this.book.sessionLost(userId);
    if (!r) return;
    if (r.held) {
      this.d.notify(r.peer, 'fcall_hold', { peer: userId });
    } else {
      this.callSession.delete(userId);
      this.callSession.delete(r.peer);
      this.d.notify(r.peer, 'fcall_end', { reason: 'left' });
    }
  }

  sweep() {
    const t = this.now();
    for (const [id, entry] of [...this.lastPeer]) {
      if (t - entry.at > REPORT_AFTER_CALL_MS) this.lastPeer.delete(id);
    }
    for (const e of this.book.sweep()) {
      this.callSession.delete(e.a);
      this.callSession.delete(e.b);
      this.d.notify(e.a, 'fcall_end', { reason: e.reason });
      this.d.notify(e.b, 'fcall_end', { reason: e.reason });
    }
  }

  /** Report the current (or just-ended) call's peer; reporting ends the call. */
  async report(meId: string, reasonRaw: unknown, noteRaw: unknown, roomId: string | null): Promise<FriendCallError | null> {
    if (!isReportReason(reasonRaw)) return 'bad_request';
    const s = this.book.get(meId);
    const recent = this.lastPeer.get(meId);
    const target = s.kind !== 'idle' ? s.peer : recent && this.now() - recent.at <= REPORT_AFTER_CALL_MS ? recent.peer : '';
    if (!target) return 'no_call';
    if (!this.reportLimit.allow(meId, this.now())) return 'rate_limited';
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
