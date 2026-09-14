import { PixelCanvas, PixelMap } from '../game/pixelArt';

/**
 * Small iso raster for kitchen sprites (same projection as the casino set:
 * +X runs down-right, +Y down-left, +Z up; 16 units span one tile edge, so a
 * tile is a 32x16 art-px diamond = 64x32 world px at PX 2).
 */

export type V3 = [number, number, number];
export type Pt = [number, number];
export type Shader = string | ((p: V3) => string | null);

/** art units along one tile edge */
export const TILE_U = 16;

/** A pixel map plus the art pixel that sits on its anchor point. */
export interface IsoSprite {
  map: PixelMap;
  /** anchor column/row in art px (for stations and rooms: the tile (0,0) top corner at z 0) */
  ax: number;
  ay: number;
}

export class Iso {
  constructor(
    readonly cv: PixelCanvas,
    readonly ox: number,
    readonly oy: number,
  ) {}

  p(x: number, y: number, z: number): Pt {
    return [this.ox + x - y, this.oy + (x + y) / 2 - z];
  }

  /** fills a planar 3D polygon; shaders receive the 3D point under each pixel */
  face(pts: V3[], shader: Shader) {
    const screen = pts.map((q) => this.p(...q));
    if (typeof shader === 'string') return this.cv.poly(screen, shader);
    const [a, b, c] = pts;
    const n = cross(sub(b, a), sub(c, a));
    const d = dot(n, a);
    const nv = n[0] + n[1] + n[2];
    return this.cv.poly(screen, (x, y) => {
      const sx = x + 0.5 - this.ox;
      const sy = y + 0.5 - this.oy;
      const p0: V3 = [sx / 2 + sy, sy - sx / 2, 0];
      const t = Math.abs(nv) < 1e-6 ? 0 : (d - dot(n, p0)) / nv;
      return shader([p0[0] + t, p0[1] + t, p0[2] + t]);
    });
  }

  /** axis-aligned box: the three faces the camera sees (left = +Y face, right = +X face) */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: Shader, left: Shader, right: Shader) {
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], left);
    this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], right);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
    return this;
  }

  dot(x: number, y: number, z: number, key: string, w = 1) {
    const [sx, sy] = this.p(x, y, z);
    for (let i = 0; i < w; i++) this.cv.set(Math.floor(sx) - Math.floor(w / 2) + i, Math.floor(sy), key);
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** stable per-pixel noise for grain and speckle */
export function hash(a: number, b: number, c = 0): number {
  let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263 + Math.floor(c) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** draws into a fresh layer, rings it with an outline, then lays it over `base` */
export function layer(base: PixelCanvas, draw: (l: PixelCanvas) => void, outline = 'o', dx = 0, dy = 0) {
  const l = new PixelCanvas(base.w, base.h);
  draw(l);
  if (outline) l.outline(outline);
  base.stamp(l, dx, dy);
  return l;
}

/** screen-space shaded ellipse lit from the upper left; ramp runs light -> dark */
export function orb(cv: PixelCanvas, cx: number, cy: number, rx: number, ry: number, ramp: string[], shine = 'w') {
  cv.ellipse(cx, cy, rx, ry, (x, y) => {
    const u = (x + 0.5 - cx) / rx;
    const v = (y + 0.5 - cy) / ry;
    const lit = -0.55 * u - 0.65 * v + 0.35 * Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const i = Math.max(0, Math.min(ramp.length - 1, Math.floor((0.75 - lit) * ramp.length * 0.75)));
    return ramp[i];
  });
  if (shine) cv.set(Math.round(cx - rx * 0.45), Math.round(cy - ry * 0.5), shine);
}

/** a squat screen-space cylinder: side ramp runs left (lit) to right */
export function drum(cv: PixelCanvas, cx: number, top: number, rx: number, ry: number, h: number, lid: Shader2, side: string[]) {
  for (let y = 0; y <= h; y++)
    cv.ellipse(cx, top + ry + y, rx, ry, (x) => {
      const u = (x + 0.5 - cx) / rx;
      return side[Math.min(side.length - 1, Math.max(0, Math.floor((u + 1) * 0.5 * side.length)))];
    });
  cv.ellipse(cx, top + ry, rx, ry, lid);
}
type Shader2 = string | ((x: number, y: number) => string | null);

const memo = new Map<string, IsoSprite>();
export function cached(key: string, build: () => IsoSprite): IsoSprite {
  let m = memo.get(key);
  if (!m) memo.set(key, (m = build()));
  return m;
}
