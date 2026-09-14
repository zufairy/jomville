import { describe, expect, it } from 'vitest';
import { isTooNew, tradeGatesOn } from './gates';

const DAY = 24 * 60 * 60 * 1000;

describe('trade gates', () => {
  it('are on only in production without TRADE_GATES=off', () => {
    expect(tradeGatesOn({ NODE_ENV: 'production' })).toBe(true);
    expect(tradeGatesOn({ NODE_ENV: 'production', TRADE_GATES: 'off' })).toBe(false);
    expect(tradeGatesOn({ NODE_ENV: 'development' })).toBe(false);
    expect(tradeGatesOn({ NODE_ENV: 'test' })).toBe(false);
    expect(tradeGatesOn({})).toBe(false);
  });

  it('too new under 24 h of age or under 30 play minutes', () => {
    const now = 10 * DAY;
    expect(isTooNew({ createdAt: new Date(now - DAY), playMinutes: 30 }, now)).toBe(false);
    expect(isTooNew({ createdAt: new Date(now - DAY + 1), playMinutes: 500 }, now)).toBe(true);
    expect(isTooNew({ createdAt: new Date(now - 5 * DAY), playMinutes: 29 }, now)).toBe(true);
  });
});
