import { describe, expect, it } from 'vitest';
import { loveScore, mergeVibes, normalizeVibe, pairSeed } from './loveMeter';

describe('love score', () => {
  it('rewards a balanced lively chat over a one-sided one', () => {
    const seed = 0.5;
    const lively = loveScore({ aTalk: 50, bTalk: 46, both: 10, turns: 22, n: 120 }, seed);
    const oneSided = loveScore({ aTalk: 90, bTalk: 4, both: 0, turns: 2, n: 120 }, seed);
    const silent = loveScore({ aTalk: 0, bTalk: 0, both: 0, turns: 0, n: 120 }, seed);
    expect(lively).toBeGreaterThan(oneSided);
    expect(oneSided).toBeGreaterThan(silent);
    expect(lively).toBeLessThanOrEqual(100);
    expect(silent).toBeGreaterThanOrEqual(1);
  });

  it('pair seed is order independent and stable', () => {
    expect(pairSeed('x', 'y')).toBe(pairSeed('y', 'x'));
    expect(pairSeed('x', 'y')).toBeGreaterThanOrEqual(0);
    expect(pairSeed('x', 'y')).toBeLessThan(1);
  });

  it('merges both reports into the A/B frame', () => {
    const fromA = { aTalk: 40, bTalk: 20, both: 2, turns: 10, n: 100 };
    const fromB = { aTalk: 22, bTalk: 38, both: 4, turns: 12, n: 100 }; // B reports itself as A
    expect(mergeVibes(fromA, fromB)).toEqual({ aTalk: 39, bTalk: 21, both: 3, turns: 11, n: 100 });
    expect(mergeVibes(null, fromB)).toEqual({ aTalk: 38, bTalk: 22, both: 4, turns: 12, n: 100 });
  });

  it('rejects junk vibe payloads and clamps counts', () => {
    expect(normalizeVibe(null)).toBeNull();
    expect(normalizeVibe({ n: 0 })).toBeNull();
    expect(normalizeVibe({ n: 10, aTalk: 99, bTalk: -3, both: 'x', turns: 4 })).toEqual({ aTalk: 10, bTalk: 0, both: 0, turns: 4, n: 10 });
  });
});
