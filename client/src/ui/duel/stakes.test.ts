import { describe, expect, it } from 'vitest';
import { canCover, isBotUser, resultCoins, resultNet, stakeChoices } from './stakes';

const enabled = (xs: ReturnType<typeof stakeChoices>) => xs.filter((c) => c.enabled).map((c) => c.stake);

describe('stake picker rules', () => {
  it('lists all six stakes and disables the ones above your balance', () => {
    const xs = stakeChoices(120);
    expect(xs.map((c) => c.stake)).toEqual([0, 25, 50, 100, 250, 500]);
    expect(enabled(xs)).toEqual([0, 25, 50, 100]);
    expect(xs.find((c) => c.stake === 250)).toEqual({ stake: 250, enabled: false, blocked: 'coins' });
  });

  it('a stake equal to the balance is allowed', () => {
    expect(enabled(stakeChoices(500))).toEqual([0, 25, 50, 100, 250, 500]);
  });

  it('an unknown balance only allows a free duel', () => {
    expect(enabled(stakeChoices(null))).toEqual([0]);
  });

  it('locals only duel for free', () => {
    const xs = stakeChoices(10_000, { bot: true });
    expect(enabled(xs)).toEqual([0]);
    expect(xs[1]).toEqual({ stake: 25, enabled: false, blocked: 'bot' });
  });

  it('cover check for the invitee accept button', () => {
    expect(canCover(null, 0)).toBe(true);
    expect(canCover(49, 50)).toBe(false);
    expect(canCover(50, 50)).toBe(true);
    expect(canCover(null, 25)).toBe(false);
  });

  it('spots locals by their account id', () => {
    expect(isBotUser('bot:aiman')).toBe(true);
    expect(isBotUser('a1b2c3')).toBe(false);
    expect(isBotUser(undefined)).toBe(false);
  });

  it('result coins: prize for a win, refund for a draw, nothing for a loss', () => {
    expect(resultCoins(50, true)).toBe(100);
    expect(resultCoins(0, true)).toBe(25);
    expect(resultCoins(250, null)).toBe(250);
    expect(resultCoins(0, null)).toBe(0);
    expect(resultCoins(100, false)).toBe(0);
    expect(resultNet(50, true)).toBe(50);
    expect(resultNet(0, true)).toBe(25);
    expect(resultNet(250, null)).toBe(0);
    expect(resultNet(100, false)).toBe(-100);
  });
});
