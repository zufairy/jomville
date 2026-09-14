import { describe, expect, it } from 'vitest';
import { makeGrid } from '@dovey/shared';
import { MovementSim } from './movement';

describe('MovementSim', () => {
  it('advances 0.4 tiles per tick and arrives exactly', () => {
    const sim = new MovementSim(makeGrid(10, 10));
    const m = { x: 0, y: 0, dir: 2, moving: false };
    expect(sim.requestMove('a', m, { x: 2, y: 0 })).toBe(true);
    sim.step('a', m);
    expect(m.x).toBeCloseTo(0.4);
    expect(m.moving).toBe(true);
    expect(m.dir).toBe(1);
    for (let i = 0; i < 4; i++) sim.step('a', m);
    expect(m.x).toBeCloseTo(2);
    expect(m.moving).toBe(false);
  });

  it('rejects blocked target', () => {
    const sim = new MovementSim(makeGrid(4, 4, [[3, 3]]));
    const m = { x: 0, y: 0, dir: 2, moving: false };
    expect(sim.requestMove('a', m, { x: 3, y: 3 })).toBe(false);
    expect(sim.requestMove('a', m, { x: 9, y: 9 })).toBe(false);
  });

  it('re-targeting mid-walk starts from nearest tile', () => {
    const sim = new MovementSim(makeGrid(10, 10));
    const m = { x: 0, y: 0, dir: 2, moving: false };
    sim.requestMove('a', m, { x: 5, y: 0 });
    sim.step('a', m); // 0.4
    sim.step('a', m); // 0.8
    sim.requestMove('a', m, { x: 1, y: 3 });
    for (let i = 0; i < 20; i++) sim.step('a', m);
    expect(m.x).toBeCloseTo(1);
    expect(m.y).toBeCloseTo(3);
  });
});
