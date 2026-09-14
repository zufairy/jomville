import type { kitchen } from '@dovey/shared';
import { PixelCanvas } from '../game/pixelArt';
import { Iso, IsoSprite, TILE_U, V3, cached, hash, layer } from './isoRaster';

/**
 * The diner room around the stations: a checker floor slab and two back
 * walls (tile backsplash, wood trim, teal paint, sconces, a clock, a menu
 * board and the serving hatch with its ticket rail). Anchor = tile (0,0) top
 * corner at floor level, like stations.
 */

const RP: Record<string, number> = {
  o: 0x2a1a14,
  // floor: cream + terracotta checker, grout, slab
  '0': 0xfff3dc,
  '1': 0xf7e6c6,
  '2': 0xead3aa,
  '3': 0xd4b688,
  '4': 0xe8946a,
  '5': 0xd27a52,
  '6': 0xa95a39,
  '7': 0xf6ab84,
  g: 0x9a6444,
  s: 0x6b4a36,
  S: 0x4e3526,
  // back wall
  i: 0xfbf6ec,
  j: 0xe4dccb,
  k: 0xb8ab94,
  a: 0xe0a060,
  b: 0xb97538,
  c: 0x7e4b22,
  d: 0x4a2e1c,
  T: 0x4aa39b,
  t: 0x3a8780,
  u: 0x2c6b66,
  L: 0x74c9be,
  // left wall (a step darker)
  I: 0xe9e1d0,
  J: 0xcfc5b0,
  K: 0xa6997f,
  A: 0xc98a4c,
  B: 0xa0622c,
  C: 0x6b3d1b,
  V: 0x3d8f88,
  v: 0x2f7670,
  U: 0x245c57,
  M: 0x62b3a8,
  // hatch, brass, paper, menu board
  h: 0x3a2418,
  H: 0x5a3a22,
  y: 0xffd27a,
  Y: 0xf7c948,
  '8': 0xb4812a,
  p: 0xfffbe8,
  r: 0xd04030,
  m: 0x2a3a34,
  w: 0xeef6f0,
};

export const WALL_H = 56;

const BACK = { tile: 'i', tileLo: 'j', grout: 'k', trimHi: 'a', trim: 'b', base: 'c', paint: 'T', stripe: 't', shade: 'u', glow: 'L' };
const LEFT = { tile: 'I', tileLo: 'J', grout: 'K', trimHi: 'A', trim: 'B', base: 'C', paint: 'V', stripe: 'v', shade: 'U', glow: 'M' };

function wallShade(along: number, z: number, k: typeof BACK, lamps: number[]): string {
  if (z < 1.5) return k.base;
  if (z < 24) {
    const row = Math.floor((z - 1.5) / 4);
    const lz = (z - 1.5) % 4;
    const lx = (along + (row % 2 ? 4 : 0)) % 8;
    if (lz < 0.7 || lx < 0.8) return k.grout;
    return lz < 1.6 ? k.tileLo : k.tile;
  }
  if (z < 27) return z > 26.2 ? k.trimHi : z < 24.7 ? k.base : k.trim;
  if (z > WALL_H - 4) return k.shade;
  for (const lx of lamps) {
    const d = Math.hypot(along - lx, (z - 38) * 1.2);
    if (d < 11 && hash(along, z, 11) < 0.85 - d / 13) return k.glow;
  }
  return along % 12 < 1 ? k.stripe : k.paint;
}

/** sconce, clock and menu details laid over a wall face; returns a key or null */
function sconce(along: number, z: number, lamps: number[]): string | null {
  for (const lx of lamps) {
    const dx = along - lx;
    if (Math.abs(dx) < 1.6 && z > 33 && z < 37) return z > 36 ? 'Y' : '8';
    if (Math.abs(dx) < 2.6 && z >= 37 && z < 40.5) return z > 39.5 ? 'p' : 'y';
  }
  return null;
}

function clock(along: number, z: number, at: number): string | null {
  const dx = along - at;
  const dz = z - 42;
  const r = Math.hypot(dx, dz * 1.1);
  if (r > 5.2) return null;
  if (r > 4.2) return '8';
  if ((Math.abs(dx) < 0.5 && dz > 0 && dz < 3.4) || (Math.abs(dz) < 0.5 && dx > 0 && dx < 2.5)) return 'o';
  return 'p';
}

function menuBoard(along: number, z: number, from: number, to: number): string | null {
  if (along < from || along > to || z < 30 || z > 50) return null;
  if (along < from + 1.2 || along > to - 1.2 || z < 31.2 || z > 48.8) return 'B';
  const rowZ = [45.5, 41, 37.5, 34];
  for (let i = 0; i < rowZ.length; i++) {
    if (Math.abs(z - rowZ[i]) < 0.5) {
      const len = i === 0 ? 0.7 : 0.45 + hash(i, from, 3) * 0.35;
      const inLine = along > from + 3 && along < from + 3 + (to - from - 6) * len;
      if (inLine && (i === 0 || Math.floor(along) % 4 !== 3)) return i === 0 ? 'y' : 'w';
    }
  }
  return 'm';
}

function hatch(along: number, z: number, from: number, to: number): string | null {
  if (along < from || along > to || z < 16 || z > 46) return null;
  if (along < from + 1.5 || along > to - 1.5 || z > 44.5) return z > 45.3 ? 'a' : 'b';
  // ticket rail with orders clipped on
  if (z > 40 && z < 41.2) return 'Y';
  if (z > 33 && z <= 40) {
    const slot = (along - from - 3) % 8;
    if (slot > 0 && slot < 5) return z > 38.5 ? 'p' : Math.abs(z - 36.5) < 0.5 && slot > 1 && slot < 4 ? 'r' : 'p';
  }
  // warm kitchen light beyond
  if (z > 42) return 'y';
  return z < 24 ? 'H' : hash(along, z, 8) < 0.05 ? 'H' : 'h';
}

/** Floor slab for a w x h kitchen. */
export function floorSprite(w: number, h: number): IsoSprite {
  return cached(`floor:${w}x${h}`, () => {
    const W = w * TILE_U;
    const D = h * TILE_U;
    const ox = D + 2;
    const cv = new PixelCanvas(W + D + 4, (W + D) / 2 + 12);
    const lights: Array<[number, number]> = [
      [W * 0.28, D * 0.5],
      [W * 0.72, D * 0.5],
    ];
    const top = (p: V3): string => {
      const tx = Math.min(w - 1, Math.floor(p[0] / TILE_U));
      const ty = Math.min(h - 1, Math.floor(p[1] / TILE_U));
      const u = p[0] - tx * TILE_U;
      const v = p[1] - ty * TILE_U;
      if (u < 0.9 || v < 0.9) return 'g';
      const terra = (tx + ty) % 2 === 0;
      if (u < 1.9 || v < 1.9) return terra ? '7' : '0';
      if (u > 15.1 || v > 15.1) return terra ? '6' : '3';
      const wallD = Math.min(p[0], p[1]);
      if (wallD < 12 && hash(p[0], p[1], 5) < 0.9 - wallD / 12) return terra ? '6' : '3';
      const lit = lights.some(([lx, ly]) => Math.hypot(p[0] - lx, p[1] - ly) < TILE_U * 3.2 * (0.8 + hash(p[0], p[1], 6) * 0.25));
      if (hash(p[0] * 3, p[1] * 3, 7) < 0.03) return terra ? '6' : '3';
      return terra ? (lit ? '4' : '5') : lit ? '1' : '2';
    };
    layer(cv, (l) => new Iso(l, ox, 3).box(0, 0, -5, W, D, 0, top, (p) => (p[2] > -1.2 ? 's' : 'S'), 'S'));
    return { map: cv.toMap(RP), ax: ox, ay: 3 };
  });
}

/** Back walls along row 0 and column 0 of the level, with the serving hatch over window tiles. */
export function wallsSprite(w: number, h: number, stations: Array<Pick<kitchen.Station, 'kind' | 'x' | 'y'>>): IsoSprite {
  const win = stations.filter((s) => s.kind === 'window' && s.y === 0).map((s) => s.x);
  const key = `walls:${w}x${h}:${win.join(',')}`;
  return cached(key, () => {
    const W = w * TILE_U;
    const D = h * TILE_U;
    const ox = D + 6;
    const oy = WALL_H + 6;
    const cv = new PixelCanvas(W + D + 12, oy + (W + D) / 2 + 8);
    const hatchFrom = win.length ? Math.min(...win) * TILE_U + 1 : -1;
    const hatchTo = win.length ? (Math.max(...win) + 1) * TILE_U - 1 : -1;
    const backLamps = [W * 0.18, W * 0.86].filter((x) => x < hatchFrom - 6 || x > hatchTo + 6);
    const leftLamps = [D * 0.82];
    const clockAt = hatchFrom > 40 ? hatchFrom - 22 : W * 0.4;
    layer(cv, (l) => {
      const iso = new Iso(l, ox, oy);
      iso.face([[0, 0, 0], [0, D, 0], [0, D, WALL_H], [0, 0, WALL_H]], (p) => {
        const y = p[1];
        return sconce(y, p[2], leftLamps) ?? menuBoard(y, p[2], D * 0.22, D * 0.62) ?? wallShade(y, p[2], LEFT, leftLamps);
      });
      iso.face([[0, 0, 0], [W, 0, 0], [W, 0, WALL_H], [0, 0, WALL_H]], (p) => {
        const x = p[0];
        return hatch(x, p[2], hatchFrom, hatchTo) ?? sconce(x, p[2], backLamps) ?? clock(x, p[2], clockAt) ?? wallShade(x, p[2], BACK, backLamps);
      });
      // wall thickness: a dark cap along the top and lit end faces at the front
      iso.face([[-4, -4, WALL_H], [W, -4, WALL_H], [W, 0, WALL_H], [-4, 0, WALL_H]], 'd');
      iso.face([[-4, -4, WALL_H], [0, -4, WALL_H], [0, D, WALL_H], [-4, D, WALL_H]], 'd');
      iso.face([[W, -4, 0], [W, 0, 0], [W, 0, WALL_H], [W, -4, WALL_H]], 'b');
      iso.face([[-4, D, 0], [0, D, 0], [0, D, WALL_H], [-4, D, WALL_H]], 'B');
    });
    return { map: cv.toMap(RP), ax: ox, ay: oy };
  });
}
