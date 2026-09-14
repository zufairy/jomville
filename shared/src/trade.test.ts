import { describe, expect, it } from 'vitest';
import { TRADE_SLOTS, parseOffer } from './trade';

describe('parseOffer', () => {
  it('accepts stacks, instances and coins', () => {
    expect(parseOffer({ slots: [{ def: 'chair', qty: 2 }, { itemId: 'abcDEF_12-x' }], coins: 300 })).toEqual({
      slots: [{ def: 'chair', qty: 2 }, { itemId: 'abcDEF_12-x' }],
      coins: 300,
    });
  });

  it('defaults missing coins to 0 and allows an empty offer', () => {
    expect(parseOffer({ slots: [] })).toEqual({ slots: [], coins: 0 });
  });

  it('caps the slot count at 9', () => {
    const ten = Array.from({ length: TRADE_SLOTS + 1 }, (_, i) => ({ itemId: `item${i}` }));
    expect(parseOffer({ slots: ten, coins: 0 })).toBeNull();
    expect(parseOffer({ slots: ten.slice(0, TRADE_SLOTS), coins: 0 })?.slots).toHaveLength(9);
  });

  it('rejects bad quantities', () => {
    for (const qty of [0, -1, 1.5, '2', 10_000, undefined]) expect(parseOffer({ slots: [{ def: 'chair', qty }] })).toBeNull();
  });

  it('rejects duplicate item ids and duplicate stack defs', () => {
    expect(parseOffer({ slots: [{ itemId: 'same1' }, { itemId: 'same1' }] })).toBeNull();
    expect(parseOffer({ slots: [{ def: 'chair', qty: 1 }, { def: 'chair', qty: 1 }] })).toBeNull();
  });

  it('rejects unknown defs, instance defs as stacks, and system furniture (empty itemId)', () => {
    expect(parseOffer({ slots: [{ def: 'nope', qty: 1 }] })).toBeNull();
    expect(parseOffer({ slots: [{ def: 'dicemaster', qty: 1 }] })).toBeNull();
    expect(parseOffer({ slots: [{ def: 'throne_gold', qty: 1 }] })).toBeNull();
    expect(parseOffer({ slots: [{ itemId: '' }] })).toBeNull();
    expect(parseOffer({ slots: [{ itemId: 'ok1', def: 'chair' }] })).toBeNull();
  });

  it('rejects bad coins and bad shapes', () => {
    for (const coins of [-1, 1.2, '5', 1_000_000_001]) expect(parseOffer({ slots: [], coins })).toBeNull();
    expect(parseOffer(null)).toBeNull();
    expect(parseOffer('x')).toBeNull();
    expect(parseOffer({ slots: 'nope' })).toBeNull();
    expect(parseOffer({ slots: [null] })).toBeNull();
  });
});
