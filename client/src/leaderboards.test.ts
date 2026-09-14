import { describe, expect, it } from 'vitest';
import { boardKey, formatCoins, formatPlayTime, formatValue, isTimeBoard, rankLabel } from './leaderboards';

describe('leaderboard formatting', () => {
  it('formats coins with thousands separators', () => {
    expect(formatCoins(0)).toBe('0');
    expect(formatCoins(999)).toBe('999');
    expect(formatCoins(1000)).toBe('1,000');
    expect(formatCoins(1234567)).toBe('1,234,567');
    expect(formatCoins(12.9)).toBe('12');
  });

  it('formats play time as hours and minutes', () => {
    expect(formatPlayTime(750)).toBe('12h 30m');
    expect(formatPlayTime(60)).toBe('1h 0m');
    expect(formatPlayTime(45)).toBe('45m');
    expect(formatPlayTime(0)).toBe('0m');
  });

  it('picks the board and the formatter', () => {
    expect(boardKey('coins', 'week')).toBe('coins');
    expect(boardKey('assets', 'all')).toBe('assets');
    expect(boardKey('time', 'week')).toBe('timeWeek');
    expect(boardKey('time', 'all')).toBe('timeAll');
    expect(isTimeBoard('timeAll')).toBe(true);
    expect(isTimeBoard('assets')).toBe(false);
    expect(formatValue('timeWeek', 750)).toBe('12h 30m');
    expect(formatValue('assets', 25000)).toBe('25,000');
  });

  it('labels the viewer rank', () => {
    const mine = { rank: 7, value: 10 };
    const none = { rank: null, value: 0 };
    const me = { hidden: false as const, coins: mine, assets: none, timeWeek: mine, timeAll: mine };
    expect(rankLabel(null, 'coins')).toBeNull();
    expect(rankLabel({ hidden: true }, 'coins')).toBe('Your rank: Hidden');
    expect(rankLabel(me, 'coins')).toBe('Your rank: #7');
    expect(rankLabel(me, 'assets')).toBe('Your rank: –');
  });
});
