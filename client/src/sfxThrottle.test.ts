import { describe, expect, it } from 'vitest';
import { SfxThrottle } from './sfxThrottle';

describe('SfxThrottle', () => {
  it('keeps a minimum gap between plays', () => {
    const t = new SfxThrottle(250, 4, 2000);
    expect(t.allow(0)).toBe(true);
    expect(t.allow(100)).toBe(false);
    expect(t.allow(249)).toBe(false);
    expect(t.allow(250)).toBe(true);
  });

  it('caps plays per window (chat: 4 per 2 s)', () => {
    const t = new SfxThrottle(250, 4, 2000);
    const played = [0, 300, 600, 900, 1200, 1500, 1800, 2000, 2300].filter((ms) => t.allow(ms));
    // four in the first 2 s; the fifth waits until the first play leaves the window
    expect(played).toEqual([0, 300, 600, 900, 2000, 2300]);
  });

  it('a single-slot throttle is a plain cooldown (typing: 1 per 1.5 s)', () => {
    const t = new SfxThrottle(1500);
    expect(t.allow(0)).toBe(true);
    expect(t.allow(1499)).toBe(false);
    expect(t.allow(1500)).toBe(true);
    expect(t.allow(2000)).toBe(false);
  });
});
