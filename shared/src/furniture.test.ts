import { describe, expect, it } from 'vitest';
import { findPath } from './astar';
import { Placement, buildGrid, placementAt, tilesOf, validatePlacement } from './furniture';

const P = (id: string, def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): Placement => ({ id, def, x, y, rot });

describe('furniture placement', () => {
  it('rotation swaps footprint', () => {
    expect(tilesOf(P('a', 'table', 2, 2, 0))).toEqual([[2, 2], [3, 2]]);
    expect(tilesOf(P('a', 'table', 2, 2, 1))).toEqual([[2, 2], [2, 3]]);
  });
  it('rejects out of bounds and unknown', () => {
    expect(validatePlacement(P('a', 'table', 9, 0), 10, [])).toBe('out_of_bounds');
    expect(validatePlacement(P('a', 'table', -1, 0), 10, [])).toBe('out_of_bounds');
    expect(validatePlacement(P('a', 'nope', 0, 0), 10, [])).toBe('unknown_def');
    expect(validatePlacement(P('a', 'chair', 1.5, 0), 10, [])).toBe('bad_coords');
  });
  it('rejects overlap between solid items, allows furniture on rug', () => {
    const chair = P('c', 'chair', 3, 3);
    expect(validatePlacement(P('t', 'table', 2, 3), 10, [chair])).toBe('overlap');
    expect(validatePlacement(P('t', 'table', 4, 3), 10, [chair])).toBeNull();
    const rug = P('r', 'rug', 3, 3);
    expect(validatePlacement(P('c2', 'chair', 3, 3), 10, [rug])).toBeNull();
    expect(validatePlacement(P('r2', 'rug_small', 4, 4), 10, [rug])).toBe('overlap');
  });
  it('ignores itself when moving', () => {
    const chair = P('c', 'chair', 3, 3);
    expect(validatePlacement(P('c', 'chair', 3, 3, 1), 10, [chair])).toBeNull();
  });
  it('builds a grid that blocks solid furniture only', () => {
    const g = buildGrid(10, [P('t', 'table', 4, 4), P('r', 'rug', 0, 0)]);
    expect(g.walkable[4][4]).toBe(false);
    expect(g.walkable[4][5]).toBe(false);
    expect(g.walkable[0][0]).toBe(true);
    const path = findPath(g, { x: 3, y: 4 }, { x: 6, y: 4 })!;
    expect(path.some((t) => t.y !== 4)).toBe(true); // routed around
  });
  it('placementAt prefers furniture over rug', () => {
    const rug = P('r', 'rug', 3, 3);
    const chair = P('c', 'chair', 3, 3);
    expect(placementAt(3, 3, [rug, chair])?.id).toBe('c');
    expect(placementAt(4, 4, [rug, chair])?.id).toBe('r');
    expect(placementAt(9, 9, [rug, chair])).toBeNull();
  });
});
