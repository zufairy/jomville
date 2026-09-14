import { describe, expect, it } from 'vitest';
import { findPath } from './astar';
import { makeGrid } from './grid';

describe('findPath', () => {
  it('returns empty path when start equals goal', () => {
    const g = makeGrid(10, 10);
    expect(findPath(g, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([]);
  });

  it('finds straight path, excluding start, including goal', () => {
    const g = makeGrid(10, 10);
    const p = findPath(g, { x: 0, y: 0 }, { x: 3, y: 0 })!;
    expect(p).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('path length equals manhattan distance on open grid', () => {
    const g = makeGrid(10, 10);
    const p = findPath(g, { x: 0, y: 0 }, { x: 9, y: 9 })!;
    expect(p.length).toBe(18);
    expect(p[p.length - 1]).toEqual({ x: 9, y: 9 });
  });

  it('routes around obstacles', () => {
    const g = makeGrid(5, 5, [[1, 0], [1, 1], [1, 2], [1, 3]]);
    const p = findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 })!;
    expect(p.length).toBe(10);
    for (const t of p) expect(g.walkable[t.y][t.x]).toBe(true);
  });

  it('returns null when unreachable', () => {
    const g = makeGrid(3, 3, [[1, 0], [1, 1], [1, 2]]);
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it('returns null for out-of-bounds or blocked goal', () => {
    const g = makeGrid(3, 3, [[2, 2]]);
    expect(findPath(g, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeNull();
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it('consecutive steps are 4-adjacent', () => {
    const g = makeGrid(10, 10, [[4, 4], [4, 5], [5, 4]]);
    const p = findPath(g, { x: 0, y: 0 }, { x: 9, y: 9 })!;
    let prev = { x: 0, y: 0 };
    for (const t of p) {
      expect(Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y)).toBe(1);
      prev = t;
    }
  });
});
