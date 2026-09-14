import { describe, expect, it } from 'vitest';
import { makeGrid } from '@dovey/shared';
import { LocalMover } from './localMover';

describe('LocalMover.reconcile', () => {
  it('ignores server lag while walking', () => {
    const m = new LocalMover(makeGrid(10, 10), 0, 0);
    m.setTarget({ x: 5, y: 0 });
    m.update(500); // 2 tiles
    m.reconcile(0.8, 0, true); // server 1.2 behind
    expect(m.x).toBeCloseTo(2);
    expect(m.moving).toBe(true);
  });
  it('snaps on large drift', () => {
    const m = new LocalMover(makeGrid(10, 10), 0, 0);
    m.setTarget({ x: 9, y: 0 });
    m.update(1000);
    m.reconcile(0, 0, true);
    expect(m.x).toBe(0);
    expect(m.moving).toBe(false);
  });
  it('corrects when both idle', () => {
    const m = new LocalMover(makeGrid(10, 10), 3, 3);
    m.reconcile(3, 4, false);
    expect(m.y).toBe(4);
  });
  it('arrives at target exactly', () => {
    const m = new LocalMover(makeGrid(10, 10), 4, 4);
    m.setTarget({ x: 9, y: 2 });
    for (let i = 0; i < 200; i++) m.update(16.7);
    expect(m.x).toBe(9);
    expect(m.y).toBe(2);
    expect(m.moving).toBe(false);
  });
});
