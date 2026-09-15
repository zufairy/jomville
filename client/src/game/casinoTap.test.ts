import { describe, expect, it } from 'vitest';
import { CASINO, Placement, buildGrid, casinoLayout, footprint, furnitureDef, isWalkable, placementAt, screenToTileIndex, seatAt, tileToScreen } from '@dovey/shared';
import { casinoArtHit } from './casinoArt';
import { casinoMap } from './casinoPixels';
import { TapWorld, resolveTap } from './tapTarget';

const layout = casinoLayout();
const grid = buildGrid(CASINO.size, layout);

/** the Game's tap world for the real Trading Room layout, with the art hit wired the way Game.ts does */
function world(wx: number, wy: number): TapWorld {
  return {
    walkable: (x, y) => isWalkable(grid, x, y),
    seatAt: (x, y) => seatAt(x, y, layout),
    usableAt: (x, y) => {
      const p = placementAt(x, y, layout);
      return p && furnitureDef(p.def)?.use ? p : null;
    },
    artHit: () => {
      const p = layout.find((q) => furnitureDef(q.def)?.use && casinoArtHit(q, wx, wy));
      return p ? { item: p, sit: false } : null;
    },
    spriteHit: () => null,
  };
}

/** world centres of every opaque art pixel of a placement's sprite, split at art row `split` */
function artPixels(p: Placement, state = '0') {
  const def = furnitureDef(p.def)!;
  const { w, h } = footprint(def, p.rot);
  const o = tileToScreen(p.x, p.y);
  const c = tileToScreen(w / 2, h / 2);
  const map = casinoMap({ kind: def.kind, state, frame: 0, on: true, rot: p.rot })!;
  const cols = map.rows[0].length;
  const left = Math.round(o.x + c.x - (map.anchorX ?? cols / 2) * 2);
  const top = Math.round(o.y + c.y + (map.foot ?? 0) * 2 - map.rows.length * 2);
  const out: Array<{ x: number; y: number; row: number }> = [];
  map.rows.forEach((r, row) => [...r].forEach((k, col) => k !== '.' && out.push({ x: left + col * 2 + 1, y: top + row * 2 + 1, row })));
  return out;
}

describe('tapping chance furni in the Trading Room', () => {
  const holo = layout.find((p) => p.def === 'holodice' && p.x === 5 && p.y === 20)!;

  it('the south-west holodice glass cube sits over walkable floor tiles (why the tile used to win)', () => {
    const cube = artPixels(holo).filter((q) => q.row >= 14 && q.row < 26);
    const overFloor = cube.filter((q) => {
      const t = screenToTileIndex(q.x, q.y);
      return isWalkable(grid, t.x, t.y);
    });
    expect(overFloor.length).toBeGreaterThan(cube.length / 2);
  });

  it('a tap anywhere on the holodice art uses the holodice, from any tile it overlaps', () => {
    for (const q of artPixels(holo)) {
      const a = resolveTap(screenToTileIndex(q.x, q.y), world(q.x, q.y));
      expect(a, `pixel ${q.x},${q.y}`).toEqual({ kind: 'use', item: holo });
    }
  });

  it('every chance item (holodice, dicemaster, wheel) is usable from its own drawn pixels', () => {
    for (const p of layout.filter((q) => furnitureDef(q.def)?.interaction)) {
      const px = artPixels(p);
      expect(px.every((q) => casinoArtHit(p, q.x, q.y)), p.id).toBe(true);
    }
  });

  it('transparent padding around the art is not a hit, so floor taps next to the cube still walk', () => {
    const o = tileToScreen(holo.x, holo.y);
    // well above the cube and off to the side of the pedestal
    expect(casinoArtHit(holo, o.x, o.y - 120)).toBe(false);
    expect(casinoArtHit(holo, o.x + 40, o.y + 16)).toBe(false);
    const above = { x: o.x, y: o.y - 120 };
    const t = screenToTileIndex(above.x, above.y);
    if (isWalkable(grid, t.x, t.y)) expect(resolveTap(t, world(above.x, above.y)).kind).toBe('walk');
  });
});
