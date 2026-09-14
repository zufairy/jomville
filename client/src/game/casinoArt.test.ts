import { describe, expect, it } from 'vitest';
import { furnitureDef } from '@dovey/shared';
import { CASINO_PAINTERS, artStateKey } from './casinoArt';

describe('casino art', () => {
  it('buckets holodice faces so the atlas stays small', () => {
    const h = furnitureDef('holodice')!;
    expect(artStateKey(h, '12')).toBe('lo');
    expect(artStateKey(h, '50')).toBe('mid');
    expect(artStateKey(h, '100')).toBe('hi');
    expect(artStateKey(h, '-1')).toBe('-1');
    expect(artStateKey(h, undefined)).toBe('0');
  });
  it('dice and wheel keep their exact face; décor has no state', () => {
    expect(artStateKey(furnitureDef('dicemaster')!, '5')).toBe('5');
    expect(artStateKey(furnitureDef('wheel_fortune')!, '8')).toBe('8');
    expect(artStateKey(furnitureDef('chip_stack')!, '3')).toBe('');
  });
  it('has a painter for every casino kind', () => {
    for (const k of ['dicemaster', 'holodice', 'wheel_fortune', 'dragon_egg', 'throne', 'felt_table', 'chip_stack', 'casino_carpet', 'neon_casino', 'slot_prop', 'velvet_rope_gold']) {
      expect(typeof CASINO_PAINTERS[k], k).toBe('function');
    }
  });
});
