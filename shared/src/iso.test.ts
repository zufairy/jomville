import { describe, expect, it } from 'vitest';
import { screenToTile, screenToTileIndex, tileToScreen } from './iso';

describe('iso', () => {
  it('tileToScreen origin', () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });
  it('tileToScreen basis vectors match 64x32 tiles', () => {
    expect(tileToScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(tileToScreen(0, 1)).toEqual({ x: -32, y: 16 });
  });
  it('round-trips', () => {
    for (const [x, y] of [[0, 0], [3, 7], [9, 9], [2.5, 4.25]] as const) {
      const s = tileToScreen(x, y);
      const t = screenToTile(s.x, s.y);
      expect(t.x).toBeCloseTo(x);
      expect(t.y).toBeCloseTo(y);
    }
  });
  it('screenToTileIndex picks tile whose diamond contains point', () => {
    const c = tileToScreen(4, 6); // top corner of tile (4,6)
    // center of diamond is TILE_H/2 below top corner
    expect(screenToTileIndex(c.x, c.y + 16)).toEqual({ x: 4, y: 6 });
    expect(screenToTileIndex(c.x + 10, c.y + 16)).toEqual({ x: 4, y: 6 });
    expect(screenToTileIndex(c.x - 10, c.y + 16)).toEqual({ x: 4, y: 6 });
  });
});
