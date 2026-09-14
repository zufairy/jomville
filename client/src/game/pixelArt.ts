import type { Graphics } from 'pixi.js';

/**
 * Crisp pixel-art sprites from text maps. Each char of a row is a palette key,
 * '.' is transparent. One art pixel is a PX x PX world-px square, so a 32-wide
 * map spans one tile (64 world px) at the room's iso scale.
 */

export const PX = 2;
export const CLEAR = '.';

export interface PixelMap {
  palette: Record<string, number>;
  rows: string[];
  /** art rows between the map's bottom edge and the anchor point (default 0) */
  foot?: number;
  /** art column that sits on the anchor (default: the map's centre) */
  anchorX?: number;
}

export interface PixelRun {
  x: number;
  y: number;
  w: number;
  key: string;
}

/** Errors for a malformed map: ragged rows or keys missing from the palette. */
export function validateMap(map: PixelMap): string[] {
  const errors: string[] = [];
  if (!map.rows.length) errors.push('map has no rows');
  const width = map.rows[0]?.length ?? 0;
  map.rows.forEach((row, y) => {
    if (row.length !== width) errors.push(`row ${y} is ${row.length} wide, expected ${width}`);
    for (const ch of new Set(row)) {
      if (ch !== CLEAR && map.palette[ch] === undefined) errors.push(`row ${y} uses unknown key '${ch}'`);
    }
  });
  return errors;
}

/** Horizontal runs of one colour per row; `flip` mirrors the map left-right. */
export function pixelRuns(map: PixelMap, flip = false): PixelRun[] {
  const runs: PixelRun[] = [];
  map.rows.forEach((raw, y) => {
    const row = flip ? [...raw].reverse().join('') : raw;
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      if (key !== CLEAR) runs.push({ x, y, w: end - x, key });
      x = end;
    }
  });
  return runs;
}

/** Draws the map so its bottom-centre (lifted by `foot` rows) sits on (ax, ay). */
export function drawPixelMap(g: Graphics, map: PixelMap, ax: number, ay: number, flip = false, px = PX) {
  const w = map.rows[0]?.length ?? 0;
  const col = map.anchorX ?? w / 2;
  const left = Math.round(ax - (flip ? w - col : col) * px);
  const top = Math.round(ay + (map.foot ?? 0) * px - map.rows.length * px);
  for (const r of pixelRuns(map, flip)) g.rect(left + r.x * px, top + r.y * px, r.w * px, px).fill(map.palette[r.key]);
}

type Pt = [number, number];

/**
 * A tiny raster canvas used to build maps from shapes: polygons, lines,
 * ellipses and outline rings, all snapped to whole art pixels.
 */
export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  private px: string[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(CLEAR);
  }

  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CLEAR;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, key: string) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = key;
  }

  /** only paints where something is already drawn */
  paint(x: number, y: number, key: string) {
    if (this.get(Math.floor(x), Math.floor(y)) !== CLEAR) this.set(x, y, key);
  }

  rect(x: number, y: number, w: number, h: number, key: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, key);
    return this;
  }

  /** fills pixels whose centre lies inside the polygon; `key` may shade per pixel */
  poly(pts: Pt[], key: string | ((x: number, y: number) => string | null)) {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if (ay <= sy === by <= sy) continue;
        xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x + 0.5 <= xs[k + 1]; x++) {
          const c = typeof key === 'string' ? key : key(x, y);
          if (c) this.set(x, y, c);
        }
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, key: string) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, key);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, key: string | ((x: number, y: number) => string | null)) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        const c = typeof key === 'string' ? key : key(x, y);
        if (c) this.set(x, y, c);
      }
    return this;
  }

  /** a 1px ring of `key` around every drawn pixel (4-neighbour) */
  outline(key: string) {
    const ring: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== CLEAR) continue;
        if (this.get(x - 1, y) !== CLEAR || this.get(x + 1, y) !== CLEAR || this.get(x, y - 1) !== CLEAR || this.get(x, y + 1) !== CLEAR) ring.push(y * this.w + x);
      }
    for (const i of ring) this.px[i] = key;
    return this;
  }

  /** copies drawn pixels of `src` on top, offset by (dx, dy) */
  stamp(src: PixelCanvas, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const k = src.get(x, y);
        if (k !== CLEAR) this.set(x + dx, y + dy, k);
      }
    return this;
  }

  /** stamps rows of text (for hand-drawn details); '.' leaves the pixel alone */
  text(rows: string[], dx: number, dy: number) {
    rows.forEach((row, y) => [...row].forEach((k, x) => k !== CLEAR && this.set(x + dx, y + dy, k)));
    return this;
  }

  clone() {
    const c = new PixelCanvas(this.w, this.h);
    c.px = [...this.px];
    return c;
  }

  toMap(palette: Record<string, number>, foot = 0, anchorX?: number): PixelMap {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) rows.push(this.px.slice(y * this.w, (y + 1) * this.w).join(''));
    return anchorX === undefined ? { palette, rows, foot } : { palette, rows, foot, anchorX };
  }
}
