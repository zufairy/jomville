import { describe, expect, it } from 'vitest';
import { CallBook, INVITE_TTL_MS } from './calls';

describe('CallBook', () => {
  it('requires explicit accept before relay is allowed', () => {
    const b = new CallBook();
    expect(b.invite('a', 'b', true)).toBeNull();
    expect(b.canRelay('a', 'b')).toBe(false);
    expect(b.accept('a')).toBeNull(); // caller cannot self-accept
    expect(b.accept('b')).toEqual({ caller: 'a', video: true });
    expect(b.canRelay('a', 'b')).toBe(true);
    expect(b.canRelay('b', 'a')).toBe(true);
    expect(b.canRelay('a', 'c')).toBe(false);
  });
  it('rejects busy peers and self-calls', () => {
    const b = new CallBook();
    expect(b.invite('a', 'a', false)).toBe('self');
    b.invite('a', 'b', false);
    expect(b.invite('c', 'b', false)).toBe('busy_peer');
    expect(b.invite('a', 'c', false)).toBe('busy_self');
  });
  it('decline clears both sides and reports the peer', () => {
    const b = new CallBook();
    b.invite('a', 'b', false);
    expect(b.clear('b')).toBe('a');
    expect(b.get('a').kind).toBe('idle');
    expect(b.get('b').kind).toBe('idle');
    expect(b.clear('b')).toBeNull();
  });
  it('expires invites', () => {
    const b = new CallBook();
    b.invite('a', 'b', false, 0);
    expect(b.accept('b', INVITE_TTL_MS + 1)).toBeNull();
    b.invite('a', 'b', false, 0);
    expect(b.sweep(INVITE_TTL_MS + 1)).toEqual([['a', 'b']]);
    expect(b.get('b').kind).toBe('idle');
  });
  it('rate-limits invites per caller', () => {
    const b = new CallBook();
    for (let i = 0; i < 3; i++) {
      expect(b.invite('a', 'b', false, 1000 + i)).toBeNull();
      b.clear('a');
    }
    expect(b.invite('a', 'b', false, 1010)).toBe('rate_limited');
  });
});
