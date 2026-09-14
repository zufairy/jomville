import { describe, expect, it } from 'vitest';
import { TradeBook } from './TradeBook';

function book() {
  let t = 5000;
  return { b: new TradeBook(() => t), advance: (ms: number) => (t += ms), now: () => t };
}
const coins = (n: number) => ({ slots: [], coins: n });

function started() {
  const s = book();
  expect(s.b.invite('a', 'b')).toBeNull();
  expect(s.b.respond('b', true)).toMatchObject({ kind: 'start' });
  return s;
}

describe('TradeBook', () => {
  it('invites live for 20 s', () => {
    const { b, advance } = book();
    expect(b.invite('a', 'a')).toBe('bad_request');
    expect(b.invite('a', 'b')).toBeNull();
    advance(19_999);
    const r = b.respond('b', true);
    expect(r?.kind).toBe('start');
    if (r?.kind !== 'start') return;
    expect([r.trade.a.id, r.trade.b.id]).toEqual(['a', 'b']);
    expect(b.invite('c', 'd')).toBeNull();
    advance(20_000);
    expect(b.respond('d', true)).toEqual({ kind: 'expired', from: 'c' });
    expect(b.respond('d', true)).toBeNull();
  });

  it('sweep drops expired invites', () => {
    const { b, advance } = book();
    b.invite('a', 'b');
    advance(19_999);
    expect(b.sweep().expired).toEqual([]);
    advance(1);
    expect(b.sweep().expired).toEqual([{ from: 'a', to: 'b' }]);
    expect(b.respond('b', true)).toBeNull();
  });

  it('one trade per person, a fresh invite blocks other inviters, decline tells the inviter', () => {
    const { b } = book();
    b.invite('a', 'b');
    expect(b.invite('c', 'b')).toBe('trade_busy');
    b.respond('b', true);
    expect(b.invite('c', 'a')).toBe('trade_busy');
    expect(b.invite('a', 'c')).toBe('trade_busy');
    expect(b.invite('c', 'd')).toBeNull();
    expect(b.respond('d', false)).toEqual({ kind: 'declined', from: 'c' });
    expect(b.get('c')).toBeUndefined();
  });

  it('any offer change resets both accepts and the countdown', () => {
    const { b, now } = started();
    expect(b.accept('a')).not.toBeNull();
    expect(b.get('a')!.confirmAt).toBeNull();
    b.accept('b');
    expect(b.get('a')!.confirmAt).toBe(now() + 3000);
    expect(b.offer('b', coins(10))).not.toBe('locked');
    const t = b.get('a')!;
    expect([t.a.accepted, t.b.accepted, t.confirmAt]).toEqual([false, false, null]);
    expect(t.b.offer.coins).toBe(10);
    expect(b.offer('zz', coins(1))).toBeNull();
  });

  it('confirm unlocks 3 s after both accept and executes once both confirm', () => {
    const { b, advance } = started();
    expect(b.confirm('a')).toBe('not_accepted');
    b.accept('a');
    b.accept('b');
    advance(2999);
    expect(b.confirm('a')).toBe('too_early');
    advance(1);
    expect(b.confirm('a')).toBe('waiting');
    expect(b.confirm('b')).toBe('execute');
    expect(b.get('a')!.executing).toBe(true);
    expect(b.offer('a', coins(1))).toBe('locked');
    expect(b.accept('b')).toBe('locked');
    expect(b.close('a')).toEqual({ trade: null, peers: [] });
    expect(b.get('a')).toBeDefined();
    b.finish(b.get('a')!);
    expect(b.get('a')).toBeUndefined();
    expect(b.get('b')).toBeUndefined();
    expect(b.confirm('a')).toBe('no_trade');
  });

  it('closes a trade after 5 minutes without activity', () => {
    const { b, advance } = started();
    advance(299_999);
    expect(b.sweep().idle).toEqual([]);
    b.offer('a', coins(1));
    advance(299_999);
    expect(b.sweep().idle).toEqual([]);
    advance(1);
    const { idle } = b.sweep();
    expect(idle).toHaveLength(1);
    expect(idle[0].a.id).toBe('a');
    expect(b.get('b')).toBeUndefined();
  });

  it('leaving closes the trade, even mid-execution, and pending invites both ways', () => {
    const { b, advance } = started();
    b.accept('a');
    b.accept('b');
    advance(3000);
    b.confirm('a');
    b.confirm('b');
    const closed = b.close('a', true);
    expect(closed.trade?.b.id).toBe('b');
    expect(closed.peers).toEqual(['b']);
    expect(b.get('b')).toBeUndefined();

    b.invite('p', 'q');
    b.invite('r', 'p');
    expect(b.close('p').peers.sort()).toEqual(['q', 'r']);
    expect(b.respond('q', true)).toBeNull();
    expect(b.respond('p', true)).toBeNull();
  });
});
