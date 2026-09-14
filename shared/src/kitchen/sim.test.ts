import { describe, expect, it } from 'vitest';
import { makeSnap } from './snapshot';
import { createKitchen, step } from './sim';
import { KitchenInput } from './types';
import { kitchen } from '../index';

function play(seed: number, ticks = 900) {
  const ids = ['a', 'b', 'c'];
  const s = createKitchen('diner', seed, ids);
  let r = 7;
  const rand = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const seq: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let t = 0; t < ticks; t++) {
    const inputs: Record<string, KitchenInput> = {};
    for (const id of ids) inputs[id] = { seq: ++seq[id], mx: rand() * 2 - 1, my: rand() * 2 - 1, grab: rand() < 0.1, use: rand() < 0.5, dash: rand() < 0.02 };
    step(s, inputs);
  }
  return s;
}

describe('simulation', () => {
  it('is deterministic for the same seed and inputs', () => {
    expect(JSON.stringify(play(5))).toBe(JSON.stringify(play(5)));
    expect(play(5).rng).not.toBe(play(6).rng);
  });

  it('never lets a chef stand inside a solid tile', () => {
    const s = play(11, 1500);
    for (const c of Object.values(s.chefs)) expect(s.solid[Math.floor(c.y) * s.w + Math.floor(c.x)]).toBe(false);
  });
});

describe('snapshots', () => {
  it('full snapshots carry everything; deltas carry only what changed', () => {
    const s = createKitchen('diner', 2, ['a']);
    const full = makeSnap(s, 0, true);
    expect(full.full).toBe(true);
    expect(full.stations).toHaveLength(s.stations.length);
    expect(full.orders).toEqual([]);
    expect(full.acks).toEqual({ a: 0 });

    const since = s.rev;
    step(s, { a: { seq: 4, mx: 1, my: 0, grab: false, use: false, dash: false } });
    const quiet = makeSnap(s, since, false);
    expect(quiet.stations).toBeUndefined();
    expect(quiet.orders).toBeUndefined();
    expect(quiet.acks.a).toBe(4);
    expect(quiet.chefs[0].x).toBe(Math.round(s.chefs.a.x * 100) / 100);

    s.stations[0].count = 9;
    s.stations[0].v = ++s.rev;
    expect(makeSnap(s, since, false).stations).toEqual([{ i: 0, item: s.stations[0].item, chop: 0, count: 9 }]);
  });

  it('is exported from @dovey/shared as the kitchen namespace', () => {
    expect(typeof kitchen.step).toBe('function');
    expect(kitchen.LEVELS.diner.name).toBe('Dovey Diner');
  });
});
