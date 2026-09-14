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
