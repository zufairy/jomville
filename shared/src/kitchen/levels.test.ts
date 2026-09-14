import { describe, expect, it } from 'vitest';
import { LEVELS, parseLevel } from './levels';
import { nextRandom } from './rng';

describe('levels', () => {
  it('Diner parses into a 14x9 kitchen with every station kind and 4 spawns', () => {
    const lv = parseLevel(LEVELS.diner);
    expect([lv.w, lv.h]).toEqual([14, 9]);
    const kinds = new Set<string>(lv.stations.map((s) => s.kind));
    for (const k of ['counter', 'crate', 'board', 'stove', 'plates', 'window', 'bin', 'return']) expect(kinds.has(k), k).toBe(true);
    expect(lv.spawns).toHaveLength(4);
    for (const sp of lv.spawns) expect(lv.solid[Math.floor(sp.y) * lv.w + Math.floor(sp.x)]).toBe(false);
    expect(lv.stations.filter((s) => s.kind === 'stove').every((s) => s.item?.kind === 'pot')).toBe(true);
    expect(lv.stations.find((s) => s.kind === 'plates')?.count).toBe(LEVELS.diner.plates);
    expect(lv.stations.filter((s) => s.kind === 'crate').map((s) => s.ing).sort()).toEqual(['lettuce', 'mushroom', 'onion', 'tomato']);
  });

  it('rejects ragged rows and unknown tiles', () => {
    expect(() => parseLevel({ ...LEVELS.diner, rows: ['###', '##'] })).toThrow(/wide/);
    expect(() => parseLevel({ ...LEVELS.diner, rows: ['#?#'] })).toThrow(/unknown tile/);
  });

  it('rng is deterministic and in range', () => {
    const a = nextRandom(42);
    expect(nextRandom(42)).toEqual(a);
    expect(a[0]).toBeGreaterThanOrEqual(0);
    expect(a[0]).toBeLessThan(1);
    expect(nextRandom(a[1])[0]).not.toBe(a[0]);
  });
});
