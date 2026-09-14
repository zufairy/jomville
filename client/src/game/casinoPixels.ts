import { PixelCanvas, PixelMap } from './pixelArt';

/**
 * Pixel-art frames for the casino set, built on a small iso raster so every
 * piece shares the same 2:1 edges, dark outline and 3-4 tone ramps. Frames are
 * generated on first use and cached; keys match artStateKey ('0', '-1', faces,
 * holodice buckets) plus the dicemaster's client-only lid keys.
 */

type V3 = [number, number, number];
type Pt = [number, number];
type Shader = string | ((p: V3) => string | null);

/** iso projection onto a canvas: +X runs down-right, +Y down-left, +Z up */
class Iso {
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

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** stable per-pixel noise for grain and sparkle */
function hash(a: number, b: number, c = 0): number {
  let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263 + Math.floor(c) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** draws into a fresh layer, rings it with outline, then lays it over `base` */
function layer(base: PixelCanvas, draw: (l: PixelCanvas) => void, outline = 'o', dx = 0, dy = 0) {
  const l = new PixelCanvas(base.w, base.h);
  draw(l);
  if (outline) l.outline(outline);
  base.stamp(l, dx, dy);
  return l;
}

const memo = new Map<string, PixelMap>();
function cached(key: string, build: () => PixelMap): PixelMap {
  let m = memo.get(key);
  if (!m) memo.set(key, (m = build()));
  return m;
}

// ---------------------------------------------------------------- palettes

/** warm brass & honey wood, dark brown ink */
const GOLD = {
  o: 0x3b1a0c, // outline
  w: 0xfff6c8, // shine
  a: 0xffe07a, // light gold
  b: 0xf7b93e, // gold
  c: 0xe08a2a, // amber
  d: 0xb45f1e, // orange-brown
  e: 0x7a3a14, // brown
  f: 0x4e2410, // deep brown
};

const IVORY = { i: 0xfffbea, j: 0xeae0c2, k: 0xc9b98f, p: 0x3a2320, r: 0xc8102e };

// ---------------------------------------------------------------- dicemaster

/** pip cells on a die face, [col, row] in a 3x3 grid */
export const DIE_PIPS: Record<string, Array<[number, number]>> = {
  '1': [[1, 1]],
  '2': [[0, 0], [2, 2]],
  '3': [[0, 0], [1, 1], [2, 2]],
  '4': [[0, 0], [2, 0], [0, 2], [2, 2]],
  '5': [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  '6': [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

export function dicePips(face: string): Array<[number, number]> {
  return DIE_PIPS[face] ?? [];
}

/** client-only lid swing keys, opening order */
export const LID_OPEN = ['open1', 'open2', 'open3'] as const;
export const LID_CLOSE = ['close1', 'close2', 'close3'] as const;
const LID_ANGLE: Record<string, number> = { open1: 25, open2: 55, open3: 85, close1: 85, close2: 55, close3: 25 };

const DM = { W: 32, H: 55, OX: 13, OY: 39, BX: 16, BY: 10, ZB: 13, ZT: 24 };

/** front-left face: honey wood bands running along the box, lighter up top */
function dmLeft(p: V3): string {
  const v = DM.ZT - p[2];
  const x = p[0];
  if (x < 1.2) return v < 2 ? 'b' : 'c';
  if (x < 2.6) return v < 1 ? 'w' : 'a';
  const band = ['w', 'a', 'a', 'b', 'a', 'a', 'b', 'b', 'a', 'b', 'c', 'c'][Math.floor(v)] ?? 'c';
  if (band !== 'w' && hash(x * 0.5, v, 7) < 0.12) return band === 'a' ? 'b' : 'c';
  return band;
}

function dmRight(p: V3): string {
  const v = DM.ZT - p[2];
  const band = ['b', 'c', 'c', 'd', 'c', 'c', 'd', 'd', 'c', 'd', 'e', 'e'][Math.floor(v)] ?? 'e';
  if (p[1] < 1.2) return 'd';
  return hash(p[1], v, 3) < 0.1 ? 'e' : band;
}

function dmStand(cv: PixelCanvas, iso: Iso) {
  layer(cv, (l) => {
    const li = new Iso(l, iso.ox, iso.oy);
    // central post, dark wood with a lit left edge
    li.box(6, 3, 3, 10, 7, DM.ZB + 1, 'd', (p) => (p[0] < 7 ? 'c' : p[0] > 9 ? 'e' : 'd'), (p) => (p[1] < 4 ? 'e' : 'f'));
    // two arched legs facing the camera, flaring out to the feet
    const [cx, cy] = li.p(DM.BX / 2, DM.BY / 2, 0);
    const span = 12;
    const rise = 5;
    for (let sx = -span; sx <= span; sx++) {
      const u = sx / span;
      const topY = Math.round(cy + 1 - rise * (1 - u * u));
      const thick = 3 + Math.round(2 * (1 - Math.abs(u)));
      for (let k = 0; k < thick; k++) {
        const key = k === 0 ? (u < 0.2 ? 'a' : 'b') : k === thick - 1 ? 'e' : u < 0 ? 'c' : 'd';
        l.set(cx + sx, topY + k, key);
      }
    }
    // feet pads
    l.rect(cx - span - 2, cy + 2, 4, 2, 'd').rect(cx + span - 1, cy + 2, 4, 2, 'e');
  });
}

/** body faces below the rim; `interior` also draws the dark inside */
function dmBody(cv: PixelCanvas, iso: Iso, dy: number, dx: number, interior: boolean, die?: string) {
  if (interior) {
    layer(cv, (l) => new Iso(l, iso.ox, iso.oy).face([[0, 0, DM.ZT], [DM.BX, 0, DM.ZT], [DM.BX, DM.BY, DM.ZT], [0, DM.BY, DM.ZT]], (p) => (p[1] < 1.5 || p[0] < 1.5 ? 'e' : 'f')), 'o', dx, dy);
    if (die) dmDie(cv, iso, die, dx, dy);
  }
  layer(
    cv,
    (l) => {
      const li = new Iso(l, iso.ox, iso.oy);
      li.face([[0, DM.BY, DM.ZB], [DM.BX, DM.BY, DM.ZB], [DM.BX, DM.BY, DM.ZT], [0, DM.BY, DM.ZT]], dmLeft);
      li.face([[DM.BX, 0, DM.ZB], [DM.BX, DM.BY, DM.ZB], [DM.BX, DM.BY, DM.ZT], [DM.BX, 0, DM.ZT]], dmRight);
    },
    'o',
    dx,
    dy,
  );
  if (interior) {
    // lit rim along the open top edge
    const rim = new Iso(cv, iso.ox + dx, iso.oy + dy);
    for (let x = 1; x < DM.BX; x += 0.5) rim.dot(x, DM.BY, DM.ZT - 0.5, x < 9 ? 'w' : 'a');
    for (let y = 1; y < DM.BY; y += 0.5) rim.dot(DM.BX, y, DM.ZT - 0.5, 'b');
  }
  dmHardware(cv, iso, dx, dy);
}

/** round brass latch on the front, hinge knob on the right side */
function dmHardware(cv: PixelCanvas, iso: Iso, dx: number, dy: number) {
  const [lx, ly] = iso.p(3.5, DM.BY, DM.ZT - 3);
  cv.text(['.ooo.', 'oawbo', 'oabco', 'obcdo', '.ooo.'], Math.round(lx) - 2 + dx, Math.round(ly) - 2 + dy);
  const [hx, hy] = iso.p(DM.BX, 4, DM.ZT - 5);
  cv.text(['.oo.', 'oabo', 'ocdo', 'oddo', '.oo.'], Math.round(hx) - 1 + dx, Math.round(hy) - 2 + dy);
}

/** ivory die sitting in the box, top face showing `face` */
function dmDie(cv: PixelCanvas, iso: Iso, face: string, dx: number, dy: number) {
  const [x0, y0, x1, y1] = [4, 1, 12, 9];
  const z0 = DM.ZT - 3;
  const z1 = DM.ZT + 3;
  layer(
    cv,
    (l) => {
      const li = new Iso(l, iso.ox, iso.oy);
      li.box(x0, y0, z0, x1, y1, z1, (p) => (p[0] < x0 + 1 || p[1] < y0 + 1 ? 'i' : p[0] > x1 - 1 || p[1] > y1 - 1 ? 'j' : 'i'), (p) => (p[2] > z1 - 1 ? 'i' : 'j'), (p) => (p[2] > z1 - 1 ? 'j' : 'k'));
      for (const [col, row] of dicePips(face)) li.dot(x0 + 2 + col * 2, y0 + 2 + row * 2, z1,face === '1' ? 'r' : 'p', 2);
    },
    'o',
    dx,
    dy,
  );
}

/** lid slab hinged along the back edge (y=0), swung up by `deg` */
function dmLid(cv: PixelCanvas, iso: Iso, deg: number, dx: number, dy: number) {
  const a = (deg * Math.PI) / 180;
  const T = 3;
  const L = DM.BY + 0.4;
  // along the lid (hinge -> free edge) and its outward normal
  const u: V3 = [0, Math.cos(a), Math.sin(a)];
  const n: V3 = [0, -Math.sin(a), Math.cos(a)];
  const P = (x: number, s: number, t: number): V3 => [x, u[1] * s + n[1] * t, DM.ZT + u[2] * s + n[2] * t];
  const [xa, xb] = [-0.3, DM.BX + 0.3];
  const outer = (p: V3) => {
    // distance along lid from hinge
    const s = p[1] * u[1] + (p[2] - DM.ZT) * u[2];
    if (s > L - 1.2) return 'w';
    if (p[0] < 1.5) return 'b';
    return ['a', 'b', 'a', 'a', 'b', 'a', 'b', 'b', 'c', 'c', 'c'][Math.floor(L - s)] ?? 'c';
  };
  const inner = (p: V3) => (p[0] < 1.2 || p[0] > DM.BX - 1.2 ? 'd' : hash(p[0], p[2]) < 0.15 ? 'f' : 'e');
  layer(
    cv,
    (l) => {
      new Iso(l, iso.ox, iso.oy).solid([
        { pts: [P(xa, 0, T), P(xb, 0, T), P(xb, L, T), P(xa, L, T)], shader: outer },
        { pts: [P(xa, 0, 0), P(xb, 0, 0), P(xb, L, 0), P(xa, L, 0)], shader: inner },
        { pts: [P(xa, L, 0), P(xb, L, 0), P(xb, L, T), P(xa, L, T)], shader: (p) => (p[0] < 2 ? 'a' : 'b') },
        { pts: [P(xa, 0, 0), P(xb, 0, 0), P(xb, 0, T), P(xa, 0, T)], shader: 'd' },
        { pts: [P(xb, 0, 0), P(xb, L, 0), P(xb, L, T), P(xb, 0, T)], shader: (p) => (p[2] > DM.ZT + 1 ? 'c' : 'd') },
        { pts: [P(xa, 0, 0), P(xa, L, 0), P(xa, L, T), P(xa, 0, T)], shader: 'c' },
      ]);
    },
    'o',
    dx,
    dy,
  );
}

function dmFrame(key: string, frame: number): PixelMap {
  const cv = new PixelCanvas(DM.W, DM.H);
  const iso = new Iso(cv, DM.OX, DM.OY);
  const foot = DM.H - (DM.OY + (DM.BX / 2 + DM.BY / 2) / 2);
  dmStand(cv, iso);
  const face = /^[1-6]$/.test(key) ? key : '';
  const angle = face ? 108 : (LID_ANGLE[key] ?? 0);
  if (key === '-1') {
    // shut and rattling: the box hops off its stand, dust puffs when it lands
    const hop = [0, 2, 3, 2, 0, 1, 0, 0][frame % 8];
    const jig = [0, 1, 0, -1, 0, 1, 0, -1][frame % 8];
    dmBody(cv, iso, -hop, jig, false);
    dmLid(cv, iso, 0, jig, -hop);
    if (hop === 0) {
      const puffs: Pt[] = frame % 2 ? [[1, 47], [30, 46], [4, 45]] : [[2, 46], [29, 45], [27, 47]];
      for (const [x, y] of puffs) cv.set(x, y, 'j');
    }
    if (hop >= 2) for (const [x, y] of [[3, 14 - hop], [26, 12 - hop], [22, 8 - hop]] as Pt[]) cv.set(x, y, frame % 2 ? 'a' : 'w');
  } else if (angle >= 70) {
    // lid stands behind the open box
    dmLid(cv, iso, angle, 0, 0);
    dmBody(cv, iso, 0, 0, true, face || undefined);
  } else if (angle > 0) {
    dmBody(cv, iso, 0, 0, true, undefined);
    dmLid(cv, iso, angle, 0, 0);
  } else {
    dmBody(cv, iso, 0, 0, false);
    dmLid(cv, iso, 0, 0, 0);
  }
  return cv.toMap({ ...GOLD, ...IVORY }, foot);
}

export function dicemasterMap(key: string, frame = 0): PixelMap {
  const k = key === '-1' ? key : key || '0';
  return cached(`dicemaster:${k}:${k === '-1' ? frame % 8 : 0}`, () => dmFrame(k, frame));
}

// ---------------------------------------------------------------- shared shapes

/** screen-space shaded ellipse lit from the upper left; ramp runs light -> dark */
function orb(cv: PixelCanvas, cx: number, cy: number, rx: number, ry: number, ramp: string[], shine = true) {
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
function drum(cv: PixelCanvas, cx: number, top: number, rx: number, ry: number, h: number, lid: string, side: string[], stripe?: string) {
  for (let y = 0; y <= h; y++)
    cv.ellipse(cx, top + ry + y, rx, ry, (x) => {
      const u = (x + 0.5 - cx) / rx;
      if (stripe && y > 0 && y < h && Math.abs(u) > 0.2 && Math.abs(u) < 0.55) return stripe;
      return side[Math.min(side.length - 1, Math.floor((u + 1) * 0.5 * side.length))];
    });
  cv.ellipse(cx, top + ry, rx, ry, lid);
}

/** gold shimmer: a diagonal glint sweeping across gold pixels */
function shimmer(cv: PixelCanvas, frame: number, keys = 'ab', period = 28) {
  const pos = (frame / 8) * period * 1.6 - 6;
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      const d = x - y * 0.5 - pos;
      if (d >= 0 && d < 2 && keys.includes(cv.get(x, y))) cv.set(x, y, d < 1 ? 'w' : 'a');
    }
}

// ---------------------------------------------------------------- holodice

const HOLO_TINT: Record<string, [number, number, number, number]> = {
  '0': [0xd9d4ee, 0xa9a2c8, 0x7d7497, 0x9a92b8],
  lo: [0xc9fbff, 0x5ef2ff, 0x2a9fc0, 0x5ef2ff],
  mid: [0xeadcff, 0xc49bff, 0x8a5fd0, 0xc49bff],
  hi: [0xfff1b0, 0xf7c948, 0xc98a1e, 0xffe07a],
};

function holodiceFrame(key: string, frame: number): PixelMap {
  const cv = new PixelCanvas(32, 44);
  const iso = new Iso(cv, 16, 32);
  const rolling = key === '-1';
  const tint = HOLO_TINT[rolling ? ['lo', 'mid', 'hi'][Math.floor(frame / 3) % 3] : key] ?? HOLO_TINT['0'];
  const hop = rolling ? [0, 2, 4, 5, 4, 2, 0, 0][frame % 8] : 0;
  // gold pedestal with a stepped cap
  layer(cv, (l) => {
    const li = new Iso(l, 16, 32);
    li.box(4, 4, 0, 12, 12, 7, 'b', (p) => (p[2] > 5 ? 'a' : p[0] < 5 ? 'b' : 'c'), (p) => (p[2] > 5 ? 'c' : 'd'));
    li.box(3, 3, 7, 13, 13, 9, (p) => (p[0] < 4 || p[1] < 4 ? 'w' : 'a'), 'b', 'd');
  });
  new Iso(cv, 16, 32).dot(8, 12, 3.5, 'e', 2);
  // glass cube, floating while it rolls
  const glow = rolling || key !== '0';
  const cube = new PixelCanvas(cv.w, cv.h);
  const ci = new Iso(cube, 16, 32 - hop);
  const edge = (p: V3, a: number, b: number) => a < 0.9 || b < 0.9 || a > 7.1 || b > 7.1;
  ci.box(4, 4, 11, 12, 12, 19, (p) => (edge(p, p[0] - 4, p[1] - 4) ? 'x' : 'y'), (p) => (edge(p, p[0] - 4, p[2] - 11) ? 'y' : 'z'), (p) => (edge(p, p[1] - 4, p[2] - 11) ? 'z' : 'q'));
  // glint streak across the glass
  for (let s = 0; s < 4; s++) cube.paint(13 + s, 14 - hop + s, 'x');
  if (glow) {
    const halo = cube.clone();
    halo.outline('g');
    if (frame % 2 === 0 || !rolling) halo.outline('.');
    cv.stamp(halo);
  }
  cube.outline('n');
  cv.stamp(cube);
  if (rolling) for (let i = 0; i < 4; i++) {
    const a = ((frame + i * 2) / 8) * Math.PI * 2;
    cv.set(16 + Math.round(Math.cos(a) * 12), 16 - hop + Math.round(Math.sin(a) * 5), i % 2 ? 'g' : 'x');
  }
  if (!rolling && key !== '0') iso.dot(8, 8, 27, 'x');
  return cv.toMap({ ...GOLD, x: tint[0], y: tint[1], z: tint[2], q: shadeHex(tint[2], 0.8), g: tint[3], n: shadeHex(tint[2], 0.45) }, 4);
}

function shadeHex(c: number, k: number): number {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---------------------------------------------------------------- wheel of fortune

const WHEEL_KEYS = ['R', 'K', 'Y', 'G', 'R', 'K', 'C', 'V'];
const WHEEL_PAL = { R: 0xd21a36, K: 0x2a2446, Y: 0xf7c948, G: 0x22915a, C: 0x5ee6f2, V: 0xb58cff, M: 0x8e0f24, i: 0xfffbea, j: 0xeae0c2 };

export function wheelRotation(key: string, frame: number): number {
  if (key === '-1') return -(frame / 12) * Math.PI * 2;
  const n = Number(key);
  return n >= 1 && n <= 8 ? -((n - 1) / 8) * Math.PI * 2 : 0;
}

/** which segment sits under the top pointer for a rotation */
export function wheelSegmentAtPointer(rot: number): number {
  const TAU = Math.PI * 2;
  const a = (((-rot) % TAU) + TAU) % TAU;
  return (Math.round(a / (TAU / 8)) % 8) + 1;
}

function wheelFrame(key: string, frame: number): PixelMap {
  const cv = new PixelCanvas(48, 72);
  const OY = 50;
  const iso = new Iso(cv, 16, OY);
  const groundY = OY + 12;
  const cx = 24;
  const cy = groundY - 38;
  const R = 19;
  // red lacquer base with gold trim
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    li.box(4, 4, 0, 28, 12, 7, 'M', (p) => (p[2] > 5.5 ? 'b' : p[2] < 1.2 ? 'd' : 'R'), (p) => (p[2] > 5.5 ? 'c' : 'M'));
    li.box(6, 6, 7, 26, 10, 9, 'a', 'b', 'd');
  });
  // A-frame struts
  layer(cv, (l) => {
    for (const s of [-1, 1]) for (let t = 0; t < 2; t++) l.line(cx + s * (12 + t), groundY - 8, cx + s * t, cy, t ? 'c' : 'b');
  });
  const rot = wheelRotation(key, frame);
  const TAU = Math.PI * 2;
  layer(cv, (l) => {
    l.ellipse(cx, cy, R + 0.5, R + 0.5, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      if (r > R - 2.5) return r > R - 1 ? 'd' : 'b';
      if (r < 3.2) return r < 1.8 ? 'w' : 'c';
      const a = (((Math.atan2(dy, dx) + Math.PI / 2 + TAU / 16 - rot) % TAU) + TAU) % TAU;
      const seg = Math.floor(a / (TAU / 8)) % 8;
      const edge = (a / (TAU / 8)) % 1;
      if (edge < 0.07 * (R / Math.max(r, 1)) || edge > 1 - 0.07 * (R / Math.max(r, 1))) return 'a';
      const k = WHEEL_KEYS[seg];
      return r < 7 && k === 'K' ? 'V' : k;
    });
  });
  // bulbs chase around the rim
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const on = (i + frame) % 3 === 0;
    cv.set(Math.round(cx + Math.cos(a) * (R - 1.2) - 0.5), Math.round(cy + Math.sin(a) * (R - 1.2) - 0.5), on ? 'w' : 'i');
  }
  // pointer
  layer(cv, (l) => l.text(['iiiii', 'ijjji', '.iji.', '.iji.', '..j..'], cx - 3, cy - R - 3));
  void iso;
  return cv.toMap({ ...GOLD, ...WHEEL_PAL }, 10);
}

// ---------------------------------------------------------------- dragon egg

function dragonEggFrame(frame: number): PixelMap {
  const cv = new PixelCanvas(30, 46);
  const gy = 40;
  const cx = 15;
  const pulse = [0, 1, 2, 3, 3, 2, 1, 0][frame % 8];
  // glow halo, denser at the peak of the pulse
  if (pulse > 0)
    cv.ellipse(cx, 19, 11 + pulse * 0.6, 14 + pulse * 0.6, (x, y) => (hash(x, y, frame) < 0.12 + pulse * 0.1 ? (pulse > 2 ? 'L' : 'H') : null));
  // gold cup: foot, stem, bowl
  layer(cv, (l) => {
    drum(l, cx, gy - 4, 7, 2.5, 2, 'a', ['b', 'b', 'c', 'd', 'e']);
    l.rect(cx - 2, gy - 12, 4, 8, 'c').rect(cx - 2, gy - 12, 1, 8, 'a').rect(cx + 1, gy - 12, 1, 8, 'd');
    l.ellipse(cx, gy - 15, 9, 5, (x, y) => (y < gy - 16 ? null : x < cx - 4 ? 'a' : x < cx + 2 ? 'b' : x < cx + 6 ? 'c' : 'd'));
  });
  // the egg
  layer(cv, (l) => {
    orb(l, cx, 20, 8, 12, ['X', 'L', 'E', 'D', 'N'], false);
    const spots: Pt[] = [[-4, -6], [2, -9], [4, -2], [-2, 1], [-5, 5], [3, 6], [0, -4], [5, 2]];
    spots.forEach(([dx, dy], i) => {
      l.paint(cx + dx, 20 + dy, i % 3 === 0 ? 'Y' : 'D');
      if (i % 2 === 0) l.paint(cx + dx + 1, 20 + dy, 'D');
    });
    l.paint(cx - 4, 12, 'w');
    l.paint(cx - 5, 13, 'X');
  });
  // bowl rim in front of the egg
  layer(cv, (l) => l.ellipse(cx, gy - 15, 9, 3, (x, y) => (y < gy - 15 ? null : x < cx ? 'a' : 'c')));
  if (pulse === 3) for (const [x, y] of [[4, 8], [26, 14], [6, 30]] as Pt[]) cv.set(x, y, 'X');
  return cv.toMap({ ...GOLD, X: 0xc8ffd2, L: 0x7cf29a, E: 0x3fbf6e, D: 0x2a8a4f, N: 0x165c34, Y: 0xf7c948, H: 0x4fd67f }, 46 - gy);
}

// ---------------------------------------------------------------- throne

function throneFrame(frame: number): PixelMap {
  const cv = new PixelCanvas(32, 62);
  const OY = 48;
  const red = (p: V3) => (hash(p[0], p[1] + p[2], 5) < 0.1 ? 'S' : 'R');
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    // backrest with a velvet panel and crest
    li.box(3, 2, 14, 13, 4, 40, 'a', (p) => (p[0] > 4.5 && p[0] < 11.5 && p[2] > 17 && p[2] < 37 ? red(p) : p[0] < 4.5 ? 'a' : 'b'), 'd');
  });
  layer(cv, (l) => {
    const [x, y] = new Iso(l, 16, OY).p(8, 3, 43);
    orb(l, x, y, 3.5, 3.5, ['a', 'b', 'c', 'd']);
    l.set(x, y - 1, 'R');
    l.set(x - 1, y - 1, 'R');
    l.set(x, y, 'S');
  });
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    // gilded seat block with a skirt band
    li.box(3, 4, 0, 13, 13, 14, 'b', (p) => (p[2] < 2 ? 'd' : p[2] > 12 ? 'a' : p[0] < 4.5 ? 'a' : 'b'), (p) => (p[2] < 2 ? 'e' : p[2] > 12 ? 'c' : 'd'));
    li.box(4.5, 5, 14, 11.5, 12.5, 17, red, 'S', 'M');
  });
  // armrests
  for (const x0 of [3, 11]) layer(cv, (l) => new Iso(l, 16, OY).box(x0, 4, 14, x0 + 2, 13, 22, 'a', 'b', 'd'));
  // studs on the seat front
  const iso = new Iso(cv, 16, OY);
  for (const x of [5, 8, 11]) iso.dot(x, 13, 7, 'w');
  shimmer(cv, frame);
  return cv.toMap({ ...GOLD, R: 0xc8102e, S: 0x8e0f24, M: 0x5e0a18 }, 6);
}

// ---------------------------------------------------------------- felt table

function feltTableFrame(): PixelMap {
  const cv = new PixelCanvas(48, 34);
  const OY = 12;
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    li.box(4, 4, 0, 28, 12, 7, 'e', (p) => (p[2] < 1.5 ? 'f' : p[0] % 6 < 0.8 ? 'f' : 'e'), 'f');
  });
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    li.box(1, 1, 7, 31, 15, 10, (p) => {
      const inX = p[0] > 2.2 && p[0] < 29.8;
      const inY = p[1] > 2.2 && p[1] < 13.8;
      if (!inX || !inY) return p[0] < 1.8 || p[1] < 1.8 ? 'a' : 'b';
      // chalk arc and betting boxes on the felt
      const dx = (p[0] - 16) / 11;
      const dy = (p[1] - 13.8) / 8;
      const r = Math.hypot(dx, dy);
      if (Math.abs(r - 1) < 0.06) return 'P';
      if (Math.abs(p[0] - 16) < 3 && Math.abs(p[1] - 6) < 1.5) return Math.abs(p[0] - 16) > 2.4 || Math.abs(p[1] - 6) > 1 ? 'P' : 'F';
      return hash(p[0], p[1], 9) < 0.08 ? 'T' : p[1] < 4 ? 'T' : 'F';
    }, (p) => (p[2] > 9 ? 'b' : 'd'), (p) => (p[2] > 9 ? 'c' : 'e'));
  });
  // a couple of chips resting on the felt
  const iso = new Iso(cv, 16, OY);
  const [x1, y1] = iso.p(8, 9, 10);
  drum(cv, Math.round(x1), Math.round(y1) - 3, 2, 1, 1, 'R', ['R', 'M'], 'i');
  const [x2, y2] = iso.p(22, 7, 10);
  drum(cv, Math.round(x2), Math.round(y2) - 4, 2, 1, 2, 'Y', ['Y', 'd'], 'i');
  return cv.toMap({ ...GOLD, F: 0x1f7a4d, T: 0x16613c, P: 0x7fd3a4, R: 0xc8102e, M: 0x8e0f24, Y: 0xf7c948, i: 0xfffbea }, 34 - (OY + 12));
}

// ---------------------------------------------------------------- chip stack

function chipStackFrame(): PixelMap {
  const cv = new PixelCanvas(28, 30);
  const stacks: Array<[number, number, string[]]> = [
    [10, 23, ['R', 'K', 'Y', 'i', 'R', 'K', 'Y']],
    [18, 26, ['K', 'R', 'i', 'Y']],
  ];
  for (const [cx, base, cols] of stacks)
    layer(cv, (l) =>
      cols.forEach((k, i) => drum(l, cx, base - 3 - i * 2 + (i === cols.length - 1 ? 0 : 0), 5, 2.5, 1, k, [k, k, CHIP_DARK[k]], k === 'i' ? 'R' : 'i')),
    );
  // one chip lying flat in front
  layer(cv, (l) => {
    l.ellipse(7, 27, 4, 2, 'Y');
    l.set(6, 27, 'i');
    l.set(8, 27, 'i');
  });
  return cv.toMap({ ...GOLD, R: 0xc8102e, r: 0x8e0f24, K: 0x2a2446, k: 0x16132a, Y: 0xf7c948, y: 0xb88620, i: 0xfffbea, h: 0xc9b98f }, 4);
}
const CHIP_DARK: Record<string, string> = { R: 'r', K: 'k', Y: 'y', i: 'h' };

// ---------------------------------------------------------------- casino carpet

/** a 32x16 diamond that tiles seamlessly: rows 2r+1 half-wide */
export function carpetMap(): PixelMap {
  return cached('casino_carpet', () => {
    const cv = new PixelCanvas(32, 16);
    for (let y = 0; y < 16; y++) {
      const half = y < 8 ? 2 * y + 1 : 2 * (15 - y) + 1;
      for (let x = 16 - half; x < 16 + half; x++) {
        const d = Math.abs(x + 0.5 - 16) / 2 + Math.abs(y + 0.5 - 8);
        let k = 'R';
        if (d > 7.1) k = 'Y';
        else if (d > 6.3) k = 'M';
        else if (d > 3.4 && d < 4.3) k = 'Y';
        else if (d < 1.3) k = 'Y';
        else if (d < 2.3) k = 'M';
        else if ((x + y) % 4 === 0 && d > 4.3) k = 'S';
        cv.set(x, y, k);
      }
    }
    return cv.toMap({ R: 0xa3162f, S: 0xb8263d, M: 0x6e0a1e, Y: 0xd9a032 }, 8);
  });
}

// ---------------------------------------------------------------- neon sign

const GLYPHS: Record<string, string[]> = {
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};

function neonFrame(frame: number): PixelMap {
  const PW = 44;
  const PH = 17;
  const flat = new PixelCanvas(PW, PH);
  flat.rect(0, 0, PW, PH, 'o').rect(1, 1, PW - 2, PH - 2, 'K');
  // neon tube border
  for (let x = 2; x < PW - 2; x++) {
    flat.set(x, 2, 'P');
    flat.set(x, PH - 3, 'P');
  }
  for (let y = 2; y < PH - 2; y++) {
    flat.set(2, y, 'P');
    flat.set(PW - 3, y, 'P');
  }
  // letters with a soft red halo
  let x = 5;
  const letters = new PixelCanvas(PW, PH);
  for (const ch of 'CASINO') {
    const g = GLYPHS[ch];
    g.forEach((row, gy) => [...row].forEach((c, gx) => c === '#' && letters.set(x + gx, 5 + gy, gy < 2 ? 'i' : 'N')));
    x += g[0].length + 2;
  }
  const halo = letters.clone().outline('H');
  flat.stamp(halo).stamp(letters);
  // bulbs chasing along the top and bottom rails
  for (let bx = 1; bx < PW - 1; bx += 3) {
    const on = Math.floor(bx / 3) % 4 === frame % 4;
    flat.set(bx, 0, on ? 'i' : 'Y');
    flat.set(PW - 1 - bx, PH - 1, on ? 'i' : 'Y');
  }
  // shear onto the wall's 2:1 slope
  const cv = new PixelCanvas(PW, PH + PW / 2);
  for (let yy = 0; yy < PH; yy++) for (let xx = 0; xx < PW; xx++) cv.set(xx, yy + Math.floor(xx / 2), flat.get(xx, yy));
  return cv.toMap({ o: 0x1a0d10, K: 0x1b1838, P: 0xff3b5c, N: 0xff6f86, i: 0xfff4f0, H: 0x7a1030, Y: 0xd9a032 });
}

// ---------------------------------------------------------------- slot machine

const REEL = ['R', 'Y', 'K', 'G', 'Y', 'R'];

function slotFrame(frame: number, on: boolean): PixelMap {
  const cv = new PixelCanvas(32, 54);
  const OY = 40;
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    li.box(3, 4, 0, 13, 12, 30, (p) => (p[0] < 4 || p[1] < 5 ? 'a' : 'b'), (p) => {
      if (p[2] < 3) return 'd';
      if (p[2] > 27) return 'b';
      // reel window
      if (p[2] > 15 && p[2] < 25 && p[0] > 4.5 && p[0] < 11.5) {
        if (p[2] < 15.9 || p[2] > 24.1 || p[0] < 5.2 || p[0] > 10.8) return 'b';
        const reel = Math.floor((p[0] - 5.2) / 1.87);
        if ((p[0] - 5.2) % 1.87 < 0.35) return 'j';
        const scroll = on ? frame * (reel + 1) * 0.9 : 0;
        const row = Math.floor((p[2] + scroll) / 3);
        const inner = (p[2] + scroll) % 3;
        return inner > 0.6 && inner < 2.4 && Math.abs(p[2] - 20) < 3.5 ? REEL[(row + reel * 2) % REEL.length] : 'i';
      }
      if (p[2] > 7 && p[2] < 11 && p[0] > 5 && p[0] < 11) return p[2] > 10 ? 'e' : 'f';
      return p[0] < 4.5 ? 'S' : 'C';
    }, (p) => (p[2] < 3 ? 'e' : p[2] > 27 ? 'c' : p[1] > 10.5 ? 'M' : 'D'));
  });
  // crown light on top
  layer(cv, (l) => {
    const [x, y] = new Iso(l, 16, OY).p(8, 8, 33);
    orb(l, x, y, 3.5, 2.5, on && frame % 2 ? ['w', 'a', 'b'] : ['a', 'b', 'c', 'd']);
  });
  // lever on the right side
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    const [x0, y0] = li.p(13, 8, 18);
    const pull = on ? [0, 0, 2, 4, 2, 0, 0, 0][frame % 8] : 0;
    l.rect(x0 + 1, y0 - 12 + pull, 1, 12 - pull, 'c').rect(x0 + 2, y0 - 12 + pull, 1, 12 - pull, 'd');
    orb(l, x0 + 1.5, y0 - 13 + pull, 2.2, 2.2, ['X', 'R', 'M']);
  });
  const iso = new Iso(cv, 16, OY);
  for (let i = 0; i < 4; i++) iso.dot(4.5 + i * 2, 12, 28.5, on && (i + frame) % 2 ? 'w' : 'Y');
  return cv.toMap({ ...GOLD, C: 0xc8102e, S: 0xe23a52, D: 0x8e0f24, M: 0x5e0a18, R: 0xe0203c, X: 0xff8a9a, Y: 0xf7c948, K: 0x2a2446, G: 0x22915a, i: 0xfffbea, j: 0xc9b98f }, 6);
}

// ---------------------------------------------------------------- velvet rope

function ropeFrame(): PixelMap {
  const cv = new PixelCanvas(36, 36);
  const px = 9;
  const gy = 32;
  // rope sagging off toward the next post
  layer(cv, (l) => {
    for (let x = px + 1; x < 36; x++) {
      const t = (x - px) / (36 - px);
      const y = Math.round(gy - 25 + t * 12 + Math.sin(t * Math.PI) * 5);
      l.set(x, y, 'S');
      l.set(x, y + 1, 'R');
      l.set(x, y + 2, 'M');
    }
  });
  layer(cv, (l) => {
    drum(l, px, gy - 4, 5, 2.5, 2, 'a', ['b', 'c', 'd', 'e']);
    l.rect(px - 1, gy - 26, 3, 24, 'c').rect(px - 1, gy - 26, 1, 24, 'a').rect(px + 1, gy - 26, 1, 24, 'd');
    orb(l, px + 0.5, gy - 28, 2.8, 2.8, ['a', 'b', 'c', 'd']);
  });
  return cv.toMap({ ...GOLD, S: 0xe23a52, R: 0xc8102e, M: 0x6e0a1e }, 36 - gy, px + 0.5);
}

// ---------------------------------------------------------------- registry

export interface CasinoPaintCtx {
  kind: string;
  state: string;
  frame: number;
  on: boolean;
}

/** the pixel map for a casino kind in a given state/frame, or null for unknown kinds */
export function casinoMap(c: CasinoPaintCtx): PixelMap | null {
  const f8 = c.frame % 8;
  switch (c.kind) {
    case 'dicemaster':
      return dicemasterMap(c.state, c.frame);
    case 'holodice': {
      const k = c.state === '-1' ? '-1' : HOLO_TINT[c.state] ? c.state : '0';
      return cached(`holodice:${k}:${k === '-1' ? f8 : 0}`, () => holodiceFrame(k, f8));
    }
    case 'wheel_fortune': {
      const k = c.state === '-1' || /^[1-8]$/.test(c.state) ? c.state : '0';
      const f = k === '-1' ? c.frame % 12 : 0;
      return cached(`wheel:${k}:${f}`, () => wheelFrame(k, f));
    }
    case 'dragon_egg':
      return cached(`egg:${f8}`, () => dragonEggFrame(f8));
    case 'throne':
      return cached(`throne:${f8}`, () => throneFrame(f8));
    case 'felt_table':
      return cached('felt_table', feltTableFrame);
    case 'chip_stack':
      return cached('chip_stack', chipStackFrame);
    case 'casino_carpet':
      return carpetMap();
    case 'neon_casino':
      return cached(`neon:${f8}`, () => neonFrame(f8));
    case 'slot_prop':
      return cached(`slot:${c.on ? 1 : 0}:${c.on ? f8 : 0}`, () => slotFrame(f8, c.on));
    case 'velvet_rope_gold':
      return cached('rope', ropeFrame);
    default:
      return null;
  }
}

/** every frame this module can draw, for tests and previews */
export function allCasinoFrames(): Array<{ name: string; map: PixelMap }> {
  const out: Array<{ name: string; map: PixelMap }> = [];
  const add = (kind: string, state: string, frames: number, on = true) => {
    for (let frame = 0; frame < frames; frame++) out.push({ name: `${kind}:${state}:${on ? 'on' : 'off'}:${frame}`, map: casinoMap({ kind, state, frame, on })! });
  };
  for (const k of ['0', '1', '2', '3', '4', '5', '6', ...LID_OPEN, ...LID_CLOSE]) add('dicemaster', k, 1);
  add('dicemaster', '-1', 8);
  for (const k of ['0', 'lo', 'mid', 'hi']) add('holodice', k, 1);
  add('holodice', '-1', 8);
  for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8']) add('wheel_fortune', k, 1);
  add('wheel_fortune', '-1', 12);
  add('dragon_egg', '', 8);
  add('throne', '', 8);
  add('felt_table', '', 1);
  add('chip_stack', '', 1);
  add('casino_carpet', '', 1);
  add('neon_casino', '', 8);
  add('slot_prop', '', 8);
  add('slot_prop', '', 1, false);
  add('velvet_rope_gold', '', 1);
  return out;
}

// ---------------------------------------------------------------- lid tween

/** client-only lid swing between two dicemaster states, or null when none plays */
export function lidSequence(from: string, to: string): readonly string[] | null {
  const face = (s: string) => /^[1-6]$/.test(s);
  if (from === '-1' && face(to)) return LID_OPEN;
  if (face(from) && (to === '0' || to === '')) return LID_CLOSE;
  return null;
}
