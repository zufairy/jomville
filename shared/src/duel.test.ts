import { describe, expect, it } from 'vitest';
import { DUEL_MAX_ROUNDS, DUEL_PICK_MS, DUEL_REWARD, DUEL_STAKES, duelPrize, isDuelStake } from './duel';

describe('duel stakes', () => {
  it('offers the six approved stakes', () => {
    expect(DUEL_STAKES).toEqual([0, 25, 50, 100, 250, 500]);
    expect(DUEL_REWARD).toBe(25);
    expect(DUEL_MAX_ROUNDS).toBe(6);
    expect(DUEL_PICK_MS).toBe(20_000);
  });

  it('accepts only those exact integers', () => {
    for (const s of DUEL_STAKES) expect(isDuelStake(s)).toBe(true);
    for (const bad of [1, 30, -25, 25.5, 1000, NaN, '50', null, undefined, {}]) expect(isDuelStake(bad)).toBe(false);
  });

  it('the prize is the pot, or the house reward for a free duel', () => {
    expect(duelPrize(0)).toBe(25);
    expect(duelPrize(50)).toBe(100);
    expect(duelPrize(500)).toBe(1000);
  });
});
