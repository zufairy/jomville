import { describe, expect, it } from 'vitest';
import type { ResolvedOffer } from '@dovey/shared';
import { confirmLeft, flashKeys, isFlashing, markChanged, removeSlot, toOffer, toggleInstance, withCoins, withStack } from './tradeLogic';

const chair = (qty: number) => ({ def: 'chair', qty, itemId: null, name: 'chair', serial: null });
const throne = (id: string, serial: number) => ({ def: 'throne_gold', qty: 1, itemId: id, name: 'Golden Throne', serial });

describe('trade offer editing', () => {
  it('turns a resolved offer back into a wire offer', () => {
    expect(toOffer({ slots: [chair(2), throne('t1', 7)], coins: 5 })).toEqual({ slots: [{ def: 'chair', qty: 2 }, { itemId: 't1' }], coins: 5 });
  });

  it('adds, updates and removes a stack in place', () => {
    const o = { slots: [{ itemId: 't1' }], coins: 0 };
    const added = withStack(o, 'chair', 1);
    expect(added.slots).toEqual([{ itemId: 't1' }, { def: 'chair', qty: 1 }]);
    expect(withStack(added, 'chair', 3).slots).toEqual([{ itemId: 't1' }, { def: 'chair', qty: 3 }]);
    expect(withStack(added, 'chair', 0).slots).toEqual([{ itemId: 't1' }]);
    expect(withStack(o, 'lamp', 0)).toBe(o);
  });

  it('never grows past 9 slots', () => {
    const full = { slots: Array.from({ length: 9 }, (_, i) => ({ itemId: `i${i}` })), coins: 0 };
    expect(withStack(full, 'chair', 1)).toBe(full);
    expect(toggleInstance(full, 'new')).toBe(full);
    expect(toggleInstance(full, 'i4').slots).toHaveLength(8);
  });

  it('toggles instances, removes by index and clamps coins', () => {
    const o = toggleInstance({ slots: [], coins: 0 }, 't1');
    expect(o.slots).toEqual([{ itemId: 't1' }]);
    expect(toggleInstance(o, 't1').slots).toEqual([]);
    expect(removeSlot({ slots: [{ itemId: 'a' }, { itemId: 'b' }], coins: 0 }, 0).slots).toEqual([{ itemId: 'b' }]);
    expect(withCoins(o, 12.9).coins).toBe(12);
    expect(withCoins(o, -4).coins).toBe(0);
    expect(withCoins(o, Number.NaN).coins).toBe(0);
    expect(withCoins(o, 5e12).coins).toBe(1_000_000_000);
  });
});

describe('changed-slot flash', () => {
  const before: ResolvedOffer = { slots: [chair(2), throne('t1', 7)], coins: 100 };

  it('the first state flashes nothing', () => {
    expect(flashKeys(null, before, 'them')).toEqual([]);
  });

  it('flags a swapped slot, a changed qty, a removed tail and coins', () => {
    expect(flashKeys(before, { slots: [chair(2), throne('t2', 9)], coins: 100 }, 'them')).toEqual(['them:1']);
    expect(flashKeys(before, { slots: [chair(3), throne('t1', 7)], coins: 100 }, 'you')).toEqual(['you:0']);
    expect(flashKeys(before, { slots: [chair(2)], coins: 50 }, 'them')).toEqual(['them:1', 'them:coins']);
    expect(flashKeys(before, before, 'them')).toEqual([]);
  });

  it('flashes for 2 s after the change', () => {
    const at = markChanged({}, ['them:1'], 1000);
    expect(markChanged(at, [], 5000)).toBe(at);
    expect(isFlashing(at, 'them:1', 2999)).toBe(true);
    expect(isFlashing(at, 'them:1', 3000)).toBe(false);
    expect(isFlashing(at, 'them:0', 1000)).toBe(false);
  });

  it('counts down to confirm', () => {
    expect(confirmLeft(null, 5)).toBeNull();
    expect(confirmLeft(4000, 1000)).toBe(3000);
    expect(confirmLeft(4000, 9000)).toBe(0);
  });
});
