import { PixelCanvas, PixelMap } from './pixelArt';

/**
 * Shared raster kit for the chunky pixel sets (casino, trading room): a tiny iso
 * projector, outlined layers, shaded orbs/drums, a gold shimmer and the warm
 * gold palette. Frames built with it are memoised by key.
 */
export type V3 = [number, number, number];
export type Pt = [number, number];
export type Shader = string | ((p: V3) => string | null);

/** iso projection onto a canvas: +X runs down-right, +Y down-left, +Z up */
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

  /** axis-aligned box: the three faces the camera sees */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: Shader, left: Shader, right: Shader) {
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], left);
    this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], right);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
    return this;
  }

  /** convex solid from faces; only camera-facing faces are drawn */
  solid(faces: Array<{ pts: V3[]; shader: Shader }>) {
    const all = faces.flatMap((f) => f.pts);
    const mid = all.reduce<V3>((m, q) => [m[0] + q[0] / all.length, m[1] + q[1] / all.length, m[2] + q[2] / all.length], [0, 0, 0]);
    for (const f of faces) {
      const [a, b, c] = f.pts;
      let n = cross(sub(b, a), sub(c, a));
      const fc = f.pts.reduce<V3>((m, q) => [m[0] + q[0] / f.pts.length, m[1] + q[1] / f.pts.length, m[2] + q[2] / f.pts.length], [0, 0, 0]);
      if (dot(n, sub(fc, mid)) < 0) n = [-n[0], -n[1], -n[2]];
      if (n[0] + n[1] + n[2] > 1e-6) this.face(f.pts, f.shader);
    }
    return this;
  }

  dot(x: number, y: number, z: number, key: string, w = 1) {
    const [sx, sy] = this.p(x, y, z);
    for (let i = 0; i < w; i++) this.cv.set(Math.floor(sx) - Math.floor(w / 2) + i, Math.floor(sy), key);
  }
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** stable per-pixel noise for grain and sparkle */
export function hash(a: number, b: number, c = 0): number {
  let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263 + Math.floor(c) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** draws into a fresh layer, rings it with outline, then lays it over `base` */
export function layer(base: PixelCanvas, draw: (l: PixelCanvas) => void, outline = 'o', dx = 0, dy = 0) {
  const l = new PixelCanvas(base.w, base.h);
  draw(l);
  if (outline) l.outline(outline);
  base.stamp(l, dx, dy);
  return l;
}

const memo = new Map<string, PixelMap>();
export function cached(key: string, build: () => PixelMap): PixelMap {
  let m = memo.get(key);
  if (!m) memo.set(key, (m = build()));
  return m;
}

// ---------------------------------------------------------------- palettes

/** warm brass & honey wood, dark brown ink */
export const GOLD = {
  o: 0x3b1a0c, // outline
  w: 0xfff6c8, // shine
  a: 0xffe07a, // light gold
  b: 0xf7b93e, // gold
  c: 0xe08a2a, // amber
  d: 0xb45f1e, // orange-brown
  e: 0x7a3a14, // brown
  f: 0x4e2410, // deep brown
};

/** screen-space shaded ellipse lit from the upper left; ramp runs light -> dark */
export function orb(cv: PixelCanvas, cx: number, cy: number, rx: number, ry: number, ramp: string[], shine = true) {
  cv.ellipse(cx, cy, rx, ry, (x, y) => {
    const u = (x + 0.5 - cx) / rx;
    const v = (y + 0.5 - cy) / ry;
    const lit = -0.55 * u - 0.65 * v + 0.35 * Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const i = Math.max(0, Math.min(ramp.length - 1, Math.floor((0.75 - lit) * ramp.length * 0.75)));
    return ramp[i];
  });
  if (shine) cv.set(Math.round(cx - rx * 0.45), Math.round(cy - ry * 0.5), 'w');
}

/** a squat screen-space cylinder (chips, cups, post bases) */
export function drum(cv: PixelCanvas, cx: number, top: number, rx: number, ry: number, h: number, lid: string, side: string[], stripe?: string) {
  for (let y = 0; y <= h; y++)
    cv.ellipse(cx, top + ry + y, rx, ry, (x) => {
      const u = (x + 0.5 - cx) / rx;
      if (stripe && y > 0 && y < h && Math.abs(u) > 0.2 && Math.abs(u) < 0.55) return stripe;
      return side[Math.min(side.length - 1, Math.floor((u + 1) * 0.5 * side.length))];
    });
  cv.ellipse(cx, top + ry, rx, ry, lid);
}

/** gold shimmer: a diagonal glint sweeping across gold pixels */
export function shimmer(cv: PixelCanvas, frame: number, keys = 'ab', period = 28) {
  const pos = (frame / 8) * period * 1.6 - 6;
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      const d = x - y * 0.5 - pos;
      if (d >= 0 && d < 2 && keys.includes(cv.get(x, y))) cv.set(x, y, d < 1 ? 'w' : 'a');
    }
}

export function shadeHex(c: number, k: number): number {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** blends two 0xRRGGBB colours: t = 0 gives a, t = 1 gives b */
export function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
