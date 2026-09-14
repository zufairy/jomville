import { describe, expect, it } from 'vitest';
import { FRIEND_REJOIN_GRACE_MS, FRIEND_RING_TTL_MS, FriendCallBook, FriendCallDeps, FriendCallService } from './social-calls';

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

  it('a pair-cooldown rejection does not consume a caller rate-limit token', () => {
    const c = clock();
    const b = new FriendCallBook(c.now);
    expect(b.invite('a', 'b', false)).toBeNull();
    b.end('a');
    expect(b.invite('a', 'b', false)).toBe('rate_limited'); // pair cooldown, not counted against caller
    expect(b.invite('a', 'c', false)).toBeNull();
    b.end('a');
    expect(b.invite('a', 'd', false)).toBeNull(); // only 2 real invites so far (b, c) plus this one is the 3rd
  });

  it('a caller-limit rejection does not consume the pair token, so the pair invite works once the caller window frees up', () => {
    const c = clock();
    const b = new FriendCallBook(c.now);
    expect(b.invite('a', 'b', false)).toBeNull();
    b.end('a');
    expect(b.invite('a', 'c', false)).toBeNull();
    b.end('a');
    expect(b.invite('a', 'd', false)).toBeNull();
    b.end('a');
    c.t += 25_000;
    expect(b.invite('a', 'f', false)).toBe('rate_limited'); // 4th caller invite within 30 s
    c.t += 6_000; // t = start + 31_000: caller window (30 s) has freed up
    expect(b.invite('a', 'f', false)).toBeNull(); // must not be blocked by a phantom pair-cooldown hit
  });

  it('mutual simultaneous invites: the second side is already busy calling', () => {
    const b = new FriendCallBook(clock().now);
    expect(b.invite('a', 'b', false)).toBeNull();
    expect(b.invite('b', 'a', false)).toBe('busy_self');
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
