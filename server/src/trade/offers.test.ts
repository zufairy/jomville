import { describe, expect, it } from 'vitest';
import type { Inventory } from '../repo';
import { checkOffer } from './offers';

const inv: Inventory = {
  coins: 1000,
  items: { chair: 3 },
  instances: [
    { id: 'throne1', def: 'throne_gold', serial: 7, placed: null },
    { id: 'dice1', def: 'dicemaster', serial: null, placed: null },
    { id: 'wheel1', def: 'wheel_fortune', serial: 2, placed: 'room1' },
  ],
};

describe('checkOffer', () => {
  it('resolves names and serials in slot order', () => {
    expect(checkOffer(inv, { slots: [{ itemId: 'throne1' }, { def: 'chair', qty: 3 }, { itemId: 'dice1' }], coins: 1000 })).toEqual({
      ok: true,
      resolved: {
        coins: 1000,
        slots: [
          { def: 'throne_gold', qty: 1, itemId: 'throne1', name: 'Golden Throne', serial: 7 },
          { def: 'chair', qty: 3, itemId: null, name: 'chair', serial: null },
          { def: 'dicemaster', qty: 1, itemId: 'dice1', name: 'Dicemaster', serial: null },
        ],
      },
    });
  });

  it('refuses more coins than the balance', () => {
    expect(checkOffer(inv, { slots: [], coins: 1001 })).toEqual({ ok: false, code: 'insufficient_coins' });
  });

  it('refuses more of a stack than held', () => {
    expect(checkOffer(inv, { slots: [{ def: 'chair', qty: 4 }], coins: 0 })).toEqual({ ok: false, code: 'insufficient_items' });
    expect(checkOffer(inv, { slots: [{ def: 'lamp', qty: 1 }], coins: 0 })).toEqual({ ok: false, code: 'insufficient_items' });
  });

  it('refuses placed or unknown instances', () => {
    expect(checkOffer(inv, { slots: [{ itemId: 'wheel1' }], coins: 0 })).toEqual({ ok: false, code: 'not_owned' });
    expect(checkOffer(inv, { slots: [{ itemId: 'someoneElse' }], coins: 0 })).toEqual({ ok: false, code: 'not_owned' });
  });
});
