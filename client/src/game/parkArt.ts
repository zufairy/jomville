import { FillGradient, Graphics } from 'pixi.js';
import { PALETTE, TILE_W, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { box, shade } from './furnitureArt';

/**
 * Wonder Dome furniture: warm walnut, woven rattan, cream linen and polished
 * brass, lit by Edison bulbs. Same contract as the other painters (origin = top
 * corner of tile 0,0; baked into the atlas per rotation/frame/on). Ride
 * platforms only paint the floor-level deck: vehicles are drawn live by rides.ts.
 */

type Painter = (g: Graphics, c: ArtCtx) => void;
type Pt = { x: number; y: number };

const TAU = Math.PI * 2;
const INK = PALETTE[0];
const WHITE = 0xffffff;

export const PARK = {
  walnut: 0x5b3a26,
  walnutL: 0x8a5a3a,
  oak: 0xb07b4f,
  oakL: 0xd6a06a,
  rattan: 0xd2a86c,
  rattanD: 0x9b7040,
  linen: 0xf3e8d2,
  linenD: 0xd8c6a6,
  brass: 0xe2b24f,
  brassD: 0xa57628,
  brassL: 0xffe6a3,
  lacquer: 0xc43d34,
  lacquerD: 0x8b2723,
  cream: 0xfff4dc,
  bulb: 0xffd98a,
  leaf: 0x5f9c4c,
  leafD: 0x3a6a33,
  leafL: 0x9bd07a,
  terra: 0xc96e43,
  terraD: 0x8f4529,
  iron: 0x2f2a27,
  teal: 0x2d8c84,
  mint: 0xa6e3d2,
  pink: 0xffb6c9,
  mustard: 0xe3a947,
  sage: 0x9fb98a,
  marble: 0xeee8de,
};
const P = PARK;

// ---- helpers

const lift = (tx: number, ty: number, z: number): Pt => {
  const p = tileToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
};

export function rnd(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Every FillGradient owns a GPU texture that is never freed on its own. The live rides repaint
 * every frame, so gradients must be shared: one per colour pair, reused forever.
 */
const GRADIENTS = new Map<string, FillGradient>();

function cached(key: string, make: () => FillGradient): FillGradient {
  let g = GRADIENTS.get(key);
  if (!g) {
    g = make();
    GRADIENTS.set(key, g);
  }
  return g;
}

export function grad(top: number, bottom: number): FillGradient {
  return cached(`v${top}:${bottom}`, () =>
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: top },
        { offset: 1, color: bottom },
      ],
      textureSpace: 'local',
    }),
  );
}

export function hgrad(left: number, right: number): FillGradient {
  return cached(`h${left}:${right}`, () =>
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0, color: left },
        { offset: 1, color: right },
      ],
      textureSpace: 'local',
    }),
  );
}

export function rad(light: number, dark: number, lx = 0.35, ly = 0.3): FillGradient {
  return cached(`r${light}:${dark}:${lx}:${ly}`, () =>
    new FillGradient({
      type: 'radial',
      center: { x: lx, y: ly },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.7,
      colorStops: [
        { offset: 0, color: light },
        { offset: 1, color: dark },
      ],
      textureSpace: 'local',
    }),
  );
}

export function glow(g: Graphics, x: number, y: number, r: number, col: number, a: number) {
  g.circle(x, y, r).fill({ color: col, alpha: a * 0.22 });
  g.circle(x, y, r * 0.62).fill({ color: col, alpha: a * 0.35 });
  g.circle(x, y, r * 0.3).fill({ color: col, alpha: a * 0.7 });
}

export function shadow(g: Graphics, x: number, y: number, rx: number, ry: number, a = 0.2) {
  g.ellipse(x, y, rx, ry).fill({ color: INK, alpha: a });
}

function diamond(g: Graphics, tx: number, ty: number, w: number, h: number, inset = 0, z = 0) {
  const i = inset / TILE_W;
  return g.poly([lift(tx + i, ty + i, z), lift(tx + w - i, ty + i, z), lift(tx + w - i, ty + h - i, z), lift(tx + i, ty + h - i, z)]);
}

/** points along the lower (front) half of an ellipse, left to right */
function frontArc(x: number, y: number, rx: number, ry: number, n = 16): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
  }
  return pts;
}

/** upright cylinder standing on (x, y): side band `h` tall, then the top ellipse */
export function cylinder(g: Graphics, x: number, y: number, rx: number, ry: number, h: number, top: number | FillGradient, side: number, outline = true) {
  const pts = [{ x: x - rx, y: y - h }, ...frontArc(x, y, rx, ry), { x: x + rx, y: y - h }];
  g.poly(pts).fill(grad(side, shade(side, 0.7)));
  if (outline) g.poly(pts).stroke({ width: 1.5, color: INK });
  g.ellipse(x, y - h, rx, ry).fill(top);
  if (outline) g.ellipse(x, y - h, rx, ry).stroke({ width: 1.5, color: INK });
}

/** Edison bulb hanging from its cap at (x, y) */
export function edison(g: Graphics, x: number, y: number, on: boolean, flicker = 1, s = 1) {
  if (on) glow(g, x, y + 6 * s, 16 * s, P.bulb, 0.75 * flicker);
  g.rect(x - 2 * s, y - 1, 4 * s, 3.5 * s).fill(P.brassD);
  g.ellipse(x, y + 7 * s, 4.2 * s, 5.5 * s).fill({ color: on ? 0xfff1c8 : 0xd9d2c3, alpha: on ? 0.95 : 0.7 }).stroke({ width: 1, color: INK, alpha: 0.7 });
  g.moveTo(x - 1.5 * s, y + 5 * s).lineTo(x - 0.5 * s, y + 8 * s).lineTo(x + 0.5 * s, y + 5 * s).lineTo(x + 1.5 * s, y + 8 * s).stroke({ width: 1, color: on ? 0xff8a2a : 0x9c8b6e });
}

/** A rot-aware frame for long pieces: u runs along the piece (0..L), v across it with the backrest at v = 0. */
function along(g: Graphics, c: ArtCtx) {
  const L = Math.max(c.w, c.h);
  const r = c.rot % 4;
  const map = (u: number, v: number): [number, number] => (r === 0 ? [u, v] : r === 1 ? [1 - v, u] : r === 2 ? [L - u, 1 - v] : [v, L - u]);
  return {
    L,
    /** true when the backrest is on the far side (drawn first) */
    farBack: r === 0 || r === 3,
    pt: (u: number, v: number, z: number) => {
      const [x, y] = map(u, v);
      return lift(x, y, z);
    },
    box: (u0: number, v0: number, u1: number, v1: number, z: number, tall: number, top: number, side: number) => {
      const [ax, ay] = map(u0, v0);
      const [bx, by] = map(u1, v1);
      box(g, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), z, tall, top, side);
    },
  };
}

/** Map (u along the wall 0..1, v up the wall 0..1) onto a wall panel between z0 and z1 px. rot 0/2 = y=0 wall, 1/3 = x=0 wall. */
function wallMap(c: ArtCtx, z0: number, z1: number) {
  const onX = c.rot % 2 === 0;
  const a = tileToScreen(0, 0);
  const b = onX ? tileToScreen(c.w, 0) : tileToScreen(0, c.h);
  return (u: number, v: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - (z0 + (z1 - z0) * v) });
}

function quad(g: Graphics, W: (u: number, v: number) => Pt, u0: number, v0: number, u1: number, v1: number) {
  return g.poly([W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)]);
}

/** a chase of marquee bulbs along a list of points */
function chase(g: Graphics, pts: Pt[], frame: number, on: boolean, r = 2, every = 3, col = P.bulb) {
  pts.forEach((p, i) => {
    const lit = on && (i + frame) % every !== 0;
    if (lit) glow(g, p.x, p.y, r * 4, col, 0.6);
    g.circle(p.x, p.y, r).fill(lit ? 0xfff6d8 : shade(col, 0.55)).stroke({ width: 0.8, color: INK, alpha: 0.6 });
  });
}

function edgePts(a: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  }
  return out;
}

/** glass cabinet faces over a footprint, brass-framed */
function glassBox(g: Graphics, tx: number, ty: number, w: number, h: number, z: number, tall: number, tint = 0xcfeaff) {
  const a = lift(tx, ty, z);
  const b = lift(tx + w, ty, z);
  const c = lift(tx + w, ty + h, z);
  const d = lift(tx, ty + h, z);
  const up = (p: Pt) => ({ x: p.x, y: p.y - tall });
  g.poly([d, c, up(c), up(d)]).fill({ color: tint, alpha: 0.2 });
  g.poly([c, b, up(b), up(c)]).fill({ color: tint, alpha: 0.14 });
  g.poly([up(a), up(b), up(c), up(d)]).fill({ color: tint, alpha: 0.12 });
  g.moveTo(d.x + 4, d.y - tall * 0.2).lineTo(d.x + 12, d.y - tall * 0.85).stroke({ width: 2, color: WHITE, alpha: 0.5 });
  for (const [p, q] of [
    [d, up(d)],
    [c, up(c)],
    [b, up(b)],
    [up(a), up(b)],
    [up(b), up(c)],
    [up(c), up(d)],
    [up(d), up(a)],
  ] as const) {
    g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1.6, color: P.brassD });
  }
}

function star(g: Graphics, x: number, y: number, r: number, col: number) {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.poly(pts).fill(col).stroke({ width: 1, color: INK });
}

/** stroke-font letters for bulb marquees, unit box, y down */
const GLYPHS: Record<string, number[][][]> = {
  W: [[[0, 0], [0.22, 1], [0.5, 0.42], [0.78, 1], [1, 0]]],
  O: [Array.from({ length: 15 }, (_, i) => [0.5 + 0.5 * Math.cos((i / 14) * TAU), 0.5 + 0.5 * Math.sin((i / 14) * TAU)])],
  N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
  D: [[[0, 0], [0, 1], [0.55, 1], [0.95, 0.72], [0.95, 0.28], [0.55, 0], [0, 0]]],
  E: [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.72, 0.5]]],
  R: [[[0, 1], [0, 0], [0.72, 0], [0.97, 0.24], [0.72, 0.48], [0, 0.48]], [[0.42, 0.48], [1, 1]]],
  M: [[[0, 1], [0, 0], [0.5, 0.56], [1, 0], [1, 1]]],
};

function bulbWord(g: Graphics, W: (u: number, v: number) => Pt, word: string, u0: number, u1: number, v0: number, v1: number, frame: number, seed: number) {
  const cell = (u1 - u0) / word.length;
  let bulb = 0;
  [...word].forEach((ch, li) => {
    const lx0 = u0 + li * cell + cell * 0.14;
    const lx1 = u0 + (li + 1) * cell - cell * 0.14;
    for (const s of GLYPHS[ch] ?? []) {
      const pts = s.map(([x, y]) => W(lx0 + (lx1 - lx0) * x, v1 - (v1 - v0) * y));
      g.poly(pts, false).stroke({ width: 4.5, color: P.lacquerD, alpha: 0.8, join: 'round', cap: 'round' });
      g.poly(pts, false).stroke({ width: 2.2, color: P.brassL, join: 'round', cap: 'round' });
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 5));
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const lit = (bulb + frame + seed) % 4 !== 0;
          if (lit) g.circle(x, y, 3.4).fill({ color: P.bulb, alpha: 0.35 });
          g.circle(x, y, 1.3).fill(lit ? WHITE : 0xe9c98a);
          bulb++;
        }
      }
    }
  });
}

interface CartStyle {
  body: number;
  trim: number;
  stripeA: number;
  stripeB: number;
}

/** vintage 2-tile vendor cart: spoked brass wheels, glass case on top, striped scalloped canopy */
function cart(g: Graphics, c: ArtCtx, s: CartStyle, contents: (top: (u: number, v: number, z: number) => Pt) => void) {
  const wide = c.w >= c.h;
  const at = (u: number, v: number, z: number) => (wide ? lift(u * c.w, v * c.h, z) : lift(v * c.w, u * c.h, z));
  const rect = (u0: number, v0: number, u1: number, v1: number): [number, number, number, number] =>
    wide ? [u0 * c.w, v0 * c.h, (u1 - u0) * c.w, (v1 - v0) * c.h] : [v0 * c.w, u0 * c.h, (v1 - v0) * c.w, (u1 - u0) * c.h];
  shadow(g, c.cx, c.cy + 4, 42, 16, 0.2);
  const wheel = (u: number, v: number) => {
    const p = at(u, v, 12);
    g.circle(p.x, p.y, 11).fill({ color: P.iron, alpha: 0.15 }).stroke({ width: 3, color: s.trim });
    g.circle(p.x, p.y, 11).stroke({ width: 1, color: INK });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.moveTo(p.x, p.y).lineTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10).stroke({ width: 1, color: P.brassD });
    }
    g.circle(p.x, p.y, 2.5).fill(s.trim).stroke({ width: 0.8, color: INK });
  };
  wheel(0.22, 0.12);
  const [bx, by, bw, bh] = rect(0.08, 0.2, 0.92, 0.8);
  box(g, bx, by, bw, bh, 14, 30, s.body, shade(s.body, 0.8));
  const pa = at(0.14, 0.8, 18);
  const pb = at(0.86, 0.8, 18);
  g.poly([pa, pb, { x: pb.x, y: pb.y - 22 }, { x: pa.x, y: pa.y - 22 }]).stroke({ width: 1.2, color: s.trim });
  const mid = at(0.5, 0.8, 29);
  g.ellipse(mid.x, mid.y, 11, 6).fill(P.cream).stroke({ width: 1.2, color: s.trim });
  g.ellipse(mid.x, mid.y, 6, 3).fill(s.stripeA);
  const h0 = at(1.0, 0.5, 34);
  g.moveTo(h0.x - 8, h0.y + 6).lineTo(h0.x + 4, h0.y - 4).stroke({ width: 2, color: s.trim });
  const [gx, gy, gw, gh] = rect(0.14, 0.26, 0.86, 0.74);
  box(g, gx, gy, gw, gh, 44, 2, s.trim, P.brassD);
  if (c.on) {
    const gl = at(0.5, 0.5, 58);
    glow(g, gl.x, gl.y, 30, P.bulb, 0.45);
  }
  contents((u, v, z) => at(0.14 + u * 0.72, 0.26 + v * 0.48, 46 + z));
  glassBox(g, gx, gy, gw, gh, 46, 26);
  wheel(0.78, 0.88);
  for (const [u, v] of [
    [0.12, 0.8],
    [0.88, 0.8],
  ]) {
    const p = at(u, v, 72);
    g.moveTo(p.x, p.y).lineTo(p.x, p.y - 14).stroke({ width: 2, color: s.trim });
  }
  const T = c.def.tall;
  const corners = [at(-0.02, -0.08, T - 8), at(1.02, -0.08, T - 8), at(1.02, 1.08, T - 8), at(-0.02, 1.08, T - 8)];
  for (let i = 0; i < 8; i++) {
    const k0 = i / 8;
    const k1 = (i + 1) / 8;
    g.poly([at(-0.02 + k0 * 1.04, -0.08, T - 8), at(-0.02 + k1 * 1.04, -0.08, T - 8), at(-0.02 + k1 * 1.04, 1.08, T - 8), at(-0.02 + k0 * 1.04, 1.08, T - 8)]).fill(
      i % 2 ? s.stripeB : s.stripeA,
    );
  }
  g.poly(corners).stroke({ width: 1.5, color: INK });
  [...edgePts(corners[3], corners[2], 9), ...edgePts(corners[1], corners[2], 5)].forEach((p, i) => {
    g.circle(p.x, p.y + 3, 3.6).fill(i % 2 ? s.stripeB : s.stripeA).stroke({ width: 0.8, color: INK, alpha: 0.8 });
  });
  const fin = at(0.5, 0.5, T);
  g.circle(fin.x, fin.y, 3).fill(s.trim).stroke({ width: 1, color: INK });
}

// ---- painters

export const PARK_PAINTERS: Record<string, Painter> = {
  // ---- coaster footing: gravel bed with a timber sleeper (the trestle itself is drawn with the track)
  track_bed(g) {
    box(g, 0.06, 0.06, 0.88, 0.88, 0, 6, 0x6d5747, 0x4b3b31);
    for (let i = 0; i < 12; i++) {
      const p = lift(0.15 + rnd(i) * 0.7, 0.15 + rnd(i + 30) * 0.7, 6);
      g.circle(p.x, p.y, 0.8 + rnd(i + 7)).fill({ color: i % 2 ? 0x8d7765 : 0x3e3029, alpha: 0.8 });
    }
    box(g, 0.2, 0.4, 0.6, 0.2, 6, 3, P.oak, P.walnut);
    for (const k of [0.3, 0.7]) {
      const p = lift(0.2 + 0.6 * k, 0.5, 9);
      g.circle(p.x, p.y, 1.3).fill(P.brass);
    }
  },

  queue_path(g) {
    diamond(g, 0, 0, 1, 1).fill(0xc7ac86);
    diamond(g, 0, 0, 1, 1, 4).fill(0xdcc39c);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if ((i + j) % 2) continue;
        const a = lift(0.1 + i * 0.14, 0.1 + j * 0.14, 0);
        const b = lift(0.1 + i * 0.14 + 0.12, 0.1 + j * 0.14, 0);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: 0xb09470, alpha: 0.5 });
      }
    }
    const m0 = lift(0.5, 0.06, 0);
    const m1 = lift(0.5, 0.94, 0);
    const n0 = lift(0.06, 0.5, 0);
    const n1 = lift(0.94, 0.5, 0);
    g.moveTo(m0.x, m0.y).lineTo(m1.x, m1.y).stroke({ width: 1.4, color: P.brass, alpha: 0.6 });
    g.moveTo(n0.x, n0.y).lineTo(n1.x, n1.y).stroke({ width: 1.4, color: P.brass, alpha: 0.6 });
    const ctr = lift(0.5, 0.5, 0);
    g.circle(ctr.x, ctr.y, 2.2).fill(P.brass).stroke({ width: 0.8, color: P.brassD });
  },

  woven_rug(g, c) {
    diamond(g, 0, 0, c.w, c.h, 2).fill(c.top);
    diamond(g, 0, 0, c.w, c.h, 2).stroke({ width: 1.5, color: INK, alpha: 0.35 });
    diamond(g, 0, 0, c.w, c.h, 7).fill(shade(c.top, 0.86));
    diamond(g, 0, 0, c.w, c.h, 11).fill(c.top);
    for (let i = 1; i < 14; i++) {
      const k = i / 14;
      const a = lift(0.15, 0.15 + k * (c.h - 0.3), 0);
      const b = lift(c.w - 0.15, 0.15 + k * (c.h - 0.3), 0);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: shade(c.top, 0.82), alpha: 0.35 });
    }
    for (let i = 0; i < 3; i++) {
      const k = (i + 0.5) / 3;
      const cx = 0.3 + k * (c.w - 0.6);
      const cy = 0.3 + k * (c.h - 0.6);
      diamond(g, cx - 0.16, cy - 0.16, 0.32, 0.32).fill(c.side);
      diamond(g, cx - 0.08, cy - 0.08, 0.16, 0.16).fill(P.linen);
    }
    for (let i = 0; i < 12; i++) {
      const k = (i + 0.5) / 12;
      const a = lift(c.w, k * c.h, 0);
      g.moveTo(a.x, a.y).lineTo(a.x + 2.5, a.y + 3).stroke({ width: 1, color: P.linenD });
      const b = lift(k * c.w, c.h, 0);
      g.moveTo(b.x, b.y).lineTo(b.x - 2.5, b.y + 3).stroke({ width: 1, color: P.linenD });
    }
  },

  rattan_sofa(g, c) {
    const F = along(g, c);
    const L = F.L;
    shadow(g, c.cx, c.cy + 4, 46, 17, 0.2);
    const back = () => {
      F.box(0.04, 0.06, L - 0.04, 0.26, 10, 24, P.rattan, P.rattanD);
      for (let i = 1; i < 10; i++) {
        const a = F.pt((i / 10) * L, 0.26, 12);
        const b = F.pt((i / 10) * L, 0.26, 32);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: P.rattanD, alpha: 0.55 });
      }
    };
    const pillows = () => {
      F.box(0.14, 0.2, L / 2 - 0.04, 0.36, 17, 14, P.linen, P.linenD);
      F.box(L / 2 + 0.04, 0.2, L - 0.14, 0.36, 17, 14, P.linen, P.linenD);
      F.box(0.24, 0.34, 0.54, 0.44, 17, 11, P.mustard, shade(P.mustard, 0.8));
      F.box(L - 0.54, 0.34, L - 0.24, 0.44, 17, 11, P.sage, shade(P.sage, 0.8));
    };
    const seat = () => {
      F.box(0.08, 0.1, L - 0.08, 0.9, 0, 10, P.rattanD, shade(P.rattanD, 0.8));
      for (let i = 0; i < 18; i++) {
        const u = 0.1 + (i / 17) * (L - 0.2);
        const a = F.pt(u, 0.9, 2);
        const b = F.pt(u + 0.05, 0.9, 8);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: P.rattan, alpha: 0.7 });
      }
      F.box(0.14, 0.22, L / 2 - 0.02, 0.88, 10, 7, P.linen, P.linenD);
      F.box(L / 2 + 0.02, 0.22, L - 0.14, 0.88, 10, 7, P.linen, P.linenD);
    };
    const arms = () => {
      F.box(0.04, 0.08, 0.2, 0.92, 10, 13, P.rattan, P.rattanD);
      F.box(L - 0.2, 0.08, L - 0.04, 0.92, 10, 13, P.rattan, P.rattanD);
    };
    if (F.farBack) {
      back();
      seat();
      pillows();
      arms();
    } else {
      seat();
      arms();
      pillows();
      back();
    }
  },

  rattan_pouf(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 17, 7);
    cylinder(g, x, y, 15, 7.5, 14, P.rattan, P.rattan);
    for (const h of [4, 9]) g.poly(frontArc(x, y - h, 15, 7.5), false).stroke({ width: 1, color: P.rattanD, alpha: 0.7 });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI - ((i + 0.5) / 9) * Math.PI;
      const px = x + Math.cos(a) * 15;
      const py = y + Math.sin(a) * 7.5;
      g.moveTo(px, py - 1).lineTo(px, py - 13).stroke({ width: 1, color: P.rattanD, alpha: 0.4 });
    }
    g.ellipse(x, y - 16, 14, 7).fill(rad(WHITE, P.linenD, 0.4, 0.3)).stroke({ width: 1.5, color: INK });
    g.ellipse(x, y - 17, 9, 4.5).stroke({ width: 1, color: P.linenD });
    g.circle(x, y - 17, 1.6).fill(P.brass);
  },

  coffee_table(g, c) {
    const wide = c.w >= c.h;
    const at = (k: number, z: number) => (wide ? lift(0.25 + k * (c.w - 0.5), c.h / 2, z) : lift(c.w / 2, 0.25 + k * (c.h - 0.5), z));
    shadow(g, c.cx, c.cy + 3, 34, 12, 0.18);
    const [bx, by, bw, bh] = wide ? [0.12, 0.25, c.w - 0.24, c.h - 0.5] : [0.25, 0.12, c.w - 0.5, c.h - 0.24];
    for (const [lx, ly] of [
      [bx, by],
      [bx + bw - 0.08, by],
      [bx, by + bh - 0.08],
      [bx + bw - 0.08, by + bh - 0.08],
    ]) {
      box(g, lx, ly, 0.08, 0.08, 0, 15, P.walnut, shade(P.walnut, 0.8));
    }
    box(g, bx + 0.04, by + 0.04, bw - 0.08, bh - 0.08, 4, 2, P.walnutL, P.walnut);
    [P.sage, P.terra, P.linen].forEach((col, i) => {
      const p = at(0.15 + i * 0.12, 6);
      g.rect(p.x - 5, p.y - 3, 10, 3).fill(col).stroke({ width: 0.8, color: INK });
    });
    box(g, bx - 0.02, by - 0.02, bw + 0.04, bh + 0.04, 15, 5, P.walnutL, P.walnut);
    const g0 = at(0.05, 20);
    const g1 = at(0.95, 20);
    g.moveTo(g0.x, g0.y).lineTo(g1.x, g1.y).stroke({ width: 1, color: P.oakL, alpha: 0.35 });
    // porcelain teapot, steaming
    const tp = at(0.35, 20);
    g.moveTo(tp.x + 7, tp.y - 6).quadraticCurveTo(tp.x + 14, tp.y - 8, tp.x + 15, tp.y - 14).stroke({ width: 2.5, color: INK });
    g.moveTo(tp.x + 7, tp.y - 6).quadraticCurveTo(tp.x + 14, tp.y - 8, tp.x + 15, tp.y - 14).stroke({ width: 1.4, color: WHITE });
    g.moveTo(tp.x - 8, tp.y - 10).quadraticCurveTo(tp.x - 15, tp.y - 8, tp.x - 8, tp.y - 3).stroke({ width: 2, color: INK });
    g.ellipse(tp.x, tp.y - 7, 9, 7).fill(rad(WHITE, 0xd9d6cf)).stroke({ width: 1.3, color: INK });
    g.ellipse(tp.x, tp.y - 13, 5, 2).fill(0xf0eee8).stroke({ width: 1, color: INK });
    g.circle(tp.x, tp.y - 15.5, 1.8).fill(P.brass);
    for (let i = 0; i < 2; i++) {
      const k = (c.t + i / 2) % 1;
      g.moveTo(tp.x + 15, tp.y - 15 - k * 10)
        .quadraticCurveTo(tp.x + 19 + Math.sin(k * TAU) * 3, tp.y - 20 - k * 10, tp.x + 15, tp.y - 25 - k * 10)
        .stroke({ width: 1.5, color: WHITE, alpha: 0.55 * (1 - k) });
    }
    for (const k of [0.62, 0.78]) {
      const p = at(k, 20);
      g.ellipse(p.x, p.y, 5.5, 2.6).fill(WHITE).stroke({ width: 0.8, color: INK, alpha: 0.7 });
      g.rect(p.x - 3, p.y - 5, 6, 5).fill(WHITE).stroke({ width: 0.8, color: INK, alpha: 0.7 });
      g.ellipse(p.x, p.y - 5, 3, 1.3).fill(P.walnutL);
    }
    const pl = at(0.98, 20);
    g.rect(pl.x - 4, pl.y - 6, 8, 6).fill(P.terra).stroke({ width: 0.8, color: INK });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      g.ellipse(pl.x + Math.cos(a) * 4, pl.y - 9 + Math.sin(a) * 3, 2.2, 3.5).fill(i % 2 ? P.leaf : P.leafL);
    }
  },

  bulb_tree(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 1, 12, 5);
    if (c.on) g.ellipse(x, y, 34, 16).fill({ color: P.bulb, alpha: 0.12 });
    g.ellipse(x, y - 2, 9, 4.5).fill(grad(0x4a423d, P.iron)).stroke({ width: 1.2, color: INK });
    g.rect(x - 2, y - T + 10, 4, T - 12).fill(hgrad(0x5a524c, P.iron));
    g.rect(x - 3, y - 18, 6, 3).fill(P.brass);
    g.rect(x - 3, y - T + 26, 6, 3).fill(P.brass);
    const top = y - T + 12;
    const arms: Array<[number, number]> = [
      [-20, 34],
      [-9, 50],
      [7, 40],
      [19, 30],
      [0, 24],
    ];
    for (const [dx] of arms) {
      if (dx === 0) continue;
      g.moveTo(x, top + 4).quadraticCurveTo(x + dx * 0.4, top - 10, x + dx, top - 2).stroke({ width: 2.2, color: P.iron });
      g.circle(x + dx + Math.sign(dx) * 2, top, 2).stroke({ width: 1.2, color: P.iron });
    }
    g.circle(x, top - 4, 3.5).fill(P.brass).stroke({ width: 1, color: INK });
    arms.forEach(([dx, drop], i) => {
      const sway = Math.sin(c.t * TAU + i) * 1.2;
      const ax = x + dx;
      const ay = top - (dx === 0 ? 0 : 2);
      g.moveTo(ax, ay).lineTo(ax + sway, ay + drop - 20).stroke({ width: 1, color: INK, alpha: 0.8 });
      const flick = c.frame === (i * 2) % c.def.anim ? 0.7 : 1;
      edison(g, ax + sway, ay + drop - 20, c.on, flick, 0.95);
    });
  },

  potted_fern(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 15, 6);
    g.poly([
      { x: x - 12, y: y - 22 },
      { x: x + 12, y: y - 22 },
      { x: x + 8, y },
      { x: x - 8, y },
    ]).fill(hgrad(P.terra, P.terraD)).stroke({ width: 1.5, color: INK });
    g.roundRect(x - 14, y - 26, 28, 6, 2).fill(grad(0xdb8456, P.terra)).stroke({ width: 1.3, color: INK });
    g.moveTo(x - 9, y - 16).lineTo(x - 6, y - 4).stroke({ width: 1.5, color: WHITE, alpha: 0.25 });
    g.ellipse(x, y - 25, 11, 3.5).fill(0x3d2a20);
    const fronds: Array<[number, number, number]> = [];
    for (let i = 0; i < 13; i++) fronds.push([-Math.PI / 2 + (i - 6) * 0.26, 24 + rnd(i) * 10, i]);
    // upright fronds first, drooping side fronds over them
    fronds.sort((p, q) => Math.abs(p[0] + Math.PI / 2) - Math.abs(q[0] + Math.PI / 2));
    for (const [a, len, i] of fronds) {
      const sway = Math.sin(c.t * TAU + i * 0.7) * 2.2;
      const bx = x;
      const by = y - 26;
      const ex = bx + Math.cos(a) * len * 1.25 + sway;
      const ey = by + Math.sin(a) * len * 0.55 + Math.abs(Math.cos(a)) * len * 0.55;
      const mx = bx + Math.cos(a) * len * 0.6;
      const my = by + Math.sin(a) * len * 0.9;
      g.moveTo(bx, by).quadraticCurveTo(mx, my, ex, ey).stroke({ width: 5, color: P.leafD, cap: 'round' });
      g.moveTo(bx, by).quadraticCurveTo(mx, my, ex, ey).stroke({ width: 3, color: i % 3 ? P.leaf : P.leafL, cap: 'round' });
      for (let s = 1; s < 6; s++) {
        const k = s / 6;
        const u = 1 - k;
        const px = u * u * bx + 2 * u * k * mx + k * k * ex;
        const py = u * u * by + 2 * u * k * my + k * k * ey;
        const l = 5 * (1 - k * 0.6);
        g.moveTo(px, py).lineTo(px - l, py - l * 0.3).moveTo(px, py).lineTo(px + l * 0.4, py - l).stroke({ width: 1.6, color: P.leaf });
      }
    }
  },

  flower_basket(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 16, 6);
    const blooms: Array<[number, number, number]> = [
      [-9, -32, 0],
      [-3, -38, 1],
      [4, -35, 0],
      [10, -30, 1],
      [0, -28, 2],
      [-12, -24, 2],
      [12, -23, 2],
    ];
    blooms.forEach(([dx, dy, kind], i) => {
      const sway = Math.sin(c.t * TAU + i) * 1.5;
      const fx = x + dx + sway;
      const fy = y + dy;
      g.moveTo(x + dx * 0.4, y - 14).quadraticCurveTo(x + dx * 0.7, fy + 8, fx, fy + 2).stroke({ width: 1.6, color: P.leafD });
      if (kind === 0) {
        g.poly([
          { x: fx - 4, y: fy - 5 },
          { x: fx - 2, y: fy - 2 },
          { x: fx, y: fy - 6 },
          { x: fx + 2, y: fy - 2 },
          { x: fx + 4, y: fy - 5 },
          { x: fx + 3.5, y: fy + 2 },
          { x: fx - 3.5, y: fy + 2 },
        ]).fill(grad(0xffe07a, 0xf2a93a)).stroke({ width: 1, color: INK });
      } else if (kind === 1) {
        for (let p = 0; p < 6; p++) {
          const a = (p / 6) * TAU;
          g.ellipse(fx + Math.cos(a) * 3.5, fy + Math.sin(a) * 3, 2.4, 1.6).fill(WHITE);
        }
        g.circle(fx, fy, 1.8).fill(0xf2b632);
      } else {
        g.ellipse(fx, fy, 5, 2.4).fill(P.leaf).stroke({ width: 0.8, color: P.leafD });
      }
    });
    g.poly([
      { x: x - 15, y: y - 16 },
      { x: x + 15, y: y - 16 },
      { x: x + 11, y },
      { x: x - 11, y },
    ]).fill(hgrad(P.rattan, P.rattanD)).stroke({ width: 1.5, color: INK });
    for (const h of [-4, -8, -12]) g.moveTo(x - 13 + Math.abs(h) * 0.1, y + h).lineTo(x + 13 - Math.abs(h) * 0.1, y + h).stroke({ width: 1, color: P.rattanD, alpha: 0.7 });
    for (let i = -3; i <= 3; i++) g.moveTo(x + i * 4, y - 16).lineTo(x + i * 3.2, y).stroke({ width: 0.8, color: P.rattanD, alpha: 0.4 });
    g.ellipse(x, y - 16, 15, 4).stroke({ width: 2, color: P.rattanD });
    g.moveTo(x - 13, y - 16).quadraticCurveTo(x, y - 44, x + 13, y - 16).stroke({ width: 2, color: P.rattanD });
  },

  popcorn_cart(g, c) {
    cart(g, c, { body: P.lacquer, trim: P.brass, stripeA: P.lacquer, stripeB: P.cream }, (top) => {
      for (let i = 0; i < 26; i++) {
        const p = top(0.12 + rnd(i) * 0.76, 0.2 + rnd(i + 9) * 0.6, 2 + rnd(i + 3) * 10);
        g.circle(p.x, p.y, 2.2 + rnd(i + 5)).fill(i % 4 ? P.cream : 0xffe39b).stroke({ width: 0.5, color: 0xd6b36a });
      }
      if (!c.on) return;
      for (let i = 0; i < 4; i++) {
        const k = (c.t * 2 + i / 4) % 1;
        const p = top(0.25 + i * 0.17, 0.5, 12 + Math.sin(k * Math.PI) * 14);
        g.circle(p.x, p.y, 2.3).fill(WHITE).stroke({ width: 0.6, color: 0xd6b36a });
      }
    });
  },

  candy_cart(g, c) {
    cart(g, c, { body: P.mint, trim: P.brass, stripeA: P.pink, stripeB: WHITE }, (top) => {
      const m = top(0.5, 0.5, 0);
      g.ellipse(m.x, m.y - 4, 22, 9).fill(grad(0xe6e2ea, 0x9c98a8)).stroke({ width: 1.2, color: INK });
      const spin = c.t * TAU;
      for (let i = 0; i < 5; i++) {
        const a = spin + (i / 5) * TAU;
        g.ellipse(m.x + Math.cos(a) * 8, m.y - 11 + Math.sin(a) * 3, 11, 7).fill({ color: i % 2 ? P.pink : 0xffd3e0, alpha: 0.9 });
      }
      g.ellipse(m.x, m.y - 14, 12, 7).fill({ color: 0xffe3ec, alpha: 0.9 });
      if (c.on) {
        for (let i = 0; i < 6; i++) {
          const a = spin * 2 + (i / 6) * TAU;
          g.moveTo(m.x, m.y - 10).lineTo(m.x + Math.cos(a) * 20, m.y - 10 + Math.sin(a) * 8).stroke({ width: 0.8, color: WHITE, alpha: 0.7 });
        }
      }
      const r = top(0.12, 0.5, 0);
      for (let i = 0; i < 3; i++) {
        const cx = r.x + i * 6 - 6;
        g.poly([{ x: cx - 2, y: r.y - 6 }, { x: cx + 2, y: r.y - 6 }, { x: cx, y: r.y + 2 }]).fill(P.cream).stroke({ width: 0.6, color: INK });
        g.circle(cx, r.y - 10, 4.5).fill(i === 1 ? 0xa8d8ff : P.pink);
      }
    });
  },

  ticket_booth(g, c) {
    const T = c.def.tall;
    const m = lift(1, 1, 0);
    shadow(g, m.x, m.y + 4, 58, 26, 0.22);
    box(g, 0.08, 0.08, 1.84, 1.84, 0, 8, P.walnutL, P.walnut);
    box(g, 0.2, 0.2, 1.6, 1.6, 8, 62, c.side, shade(c.side, 0.82));
    const face = (ax: number, ay: number, bx: number, by: number, z0: number, z1: number) => g.poly([lift(ax, ay, z0), lift(bx, by, z0), lift(bx, by, z1), lift(ax, ay, z1)]);
    face(1.8, 0.45, 1.8, 1.55, 14, 40).fill(P.cream).stroke({ width: 1.2, color: P.brassD });
    face(0.45, 1.8, 1.55, 1.8, 44, 64).fill(grad(0xffe7b0, 0xf2b25a)).stroke({ width: 1.5, color: P.brassD });
    const w0 = lift(1, 1.8, 52);
    glow(g, w0.x, w0.y, 22, P.bulb, 0.5);
    g.circle(w0.x, w0.y - 2, 5).fill({ color: 0x6b4632, alpha: 0.8 });
    g.roundRect(w0.x - 7, w0.y + 3, 14, 8, 3).fill({ color: 0x6b4632, alpha: 0.8 });
    face(0.45, 1.8, 1.55, 1.8, 14, 40).fill(P.cream).stroke({ width: 1.2, color: P.brassD });
    box(g, 0.35, 1.78, 1.3, 0.14, 40, 3, P.brass, P.brassD);
    const tp = lift(1.8, 1, 27);
    g.poly([
      { x: tp.x - 12, y: tp.y + 3 },
      { x: tp.x + 12, y: tp.y - 9 },
      { x: tp.x + 12, y: tp.y + 1 },
      { x: tp.x - 12, y: tp.y + 13 },
    ]).fill(c.top).stroke({ width: 1, color: INK });
    for (let i = 0; i < 5; i++) {
      const k = (i + 0.5) / 5;
      g.circle(tp.x - 10 + k * 20, tp.y + 8 - k * 10, 1.6).fill(P.cream);
    }
    box(g, 0.1, 0.1, 1.8, 1.8, 70, 7, P.brass, P.brassD);
    const cn = [lift(0.1, 0.1, 74), lift(1.9, 0.1, 74), lift(1.9, 1.9, 74), lift(0.1, 1.9, 74)];
    chase(g, [...edgePts(cn[1], cn[2], 7), ...edgePts(cn[3], cn[2], 7)], c.frame, true, 1.8);
    const top = lift(1, 1, 77);
    for (let k = 0; k < 7; k++) {
      const f = k / 7;
      const rx = 46 * Math.pow(1 - f, 0.8) * (1 + 0.18 * Math.sin(f * Math.PI));
      g.ellipse(top.x, top.y - k * 6, Math.max(3, rx), Math.max(1.5, rx * 0.5)).fill(k % 2 ? P.cream : c.side).stroke({ width: 1.2, color: INK, alpha: 0.8 });
    }
    const fy = top.y - T + 72;
    glow(g, top.x, fy - 44 + 24, 14, P.brassL, 0.6 + 0.4 * Math.sin(c.t * TAU));
    star(g, top.x, fy - 44 + 24, 7, P.brass);
  },

  claw_machine(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 22, 10);
    box(g, 0.1, 0.1, 0.8, 0.8, 0, 34, c.top, shade(c.top, 0.8));
    const ch = lift(0.5, 0.9, 12);
    g.roundRect(ch.x - 7, ch.y - 6, 14, 10, 3).fill(0x2a1a1a).stroke({ width: 1.2, color: P.brass });
    box(g, 0.08, 0.62, 0.84, 0.3, 34, 4, P.brass, P.brassD);
    const js = lift(0.35, 0.8, 38);
    g.moveTo(js.x, js.y).lineTo(js.x, js.y - 8).stroke({ width: 1.5, color: INK });
    g.circle(js.x, js.y - 9, 3).fill(rad(0xff8a80, P.lacquerD));
    const bt = lift(0.7, 0.75, 38);
    g.ellipse(bt.x, bt.y - 1, 3, 1.8).fill(P.mint).stroke({ width: 0.8, color: INK });
    const plush = [P.pink, 0xa8d8ff, P.mustard, P.mint, 0xd6a3ff, P.cream];
    for (let i = 0; i < 9; i++) {
      const p = lift(0.2 + rnd(i) * 0.6, 0.2 + rnd(i + 4) * 0.6, 38 + rnd(i + 8) * 8);
      const col = plush[i % plush.length];
      g.circle(p.x - 4, p.y - 5, 2.5).fill(col).stroke({ width: 0.6, color: INK });
      g.circle(p.x + 4, p.y - 5, 2.5).fill(col).stroke({ width: 0.6, color: INK });
      g.circle(p.x, p.y, 5.5).fill(col).stroke({ width: 0.8, color: INK });
      g.circle(p.x - 1.8, p.y - 0.5, 0.7).fill(INK);
      g.circle(p.x + 1.8, p.y - 0.5, 0.7).fill(INK);
    }
    // the claw roams, dips and lifts
    const cxp = lift(0.25 + 0.5 * (0.5 + 0.5 * Math.sin(c.t * TAU)), 0.5, 0);
    const dip = Math.max(0, Math.sin((c.t - 0.25) * TAU * 2)) * 18;
    const topY = cxp.y - 72;
    if (c.on) glow(g, x, y - 56, 26, P.pink, 0.25);
    g.moveTo(cxp.x, topY).lineTo(cxp.x, topY + 6 + dip).stroke({ width: 1, color: INK });
    const hy = topY + 8 + dip;
    g.rect(cxp.x - 3, hy - 3, 6, 4).fill(P.brass).stroke({ width: 0.8, color: INK });
    for (const s of [-1, 0, 1]) {
      g.moveTo(cxp.x + s * 2, hy + 1)
        .quadraticCurveTo(cxp.x + s * 7, hy + 5, cxp.x + s * 4, hy + 10)
        .stroke({ width: 1.6, color: P.brassD });
    }
    glassBox(g, 0.12, 0.12, 0.76, 0.76, 38, 36, c.on ? 0xffd6e4 : 0xcfeaff);
    box(g, 0.08, 0.08, 0.84, 0.84, 74, 12, P.cream, c.top);
    const crown = [lift(0.92, 0.08, 80), lift(0.92, 0.92, 80), lift(0.08, 0.92, 80)];
    chase(g, [...edgePts(crown[0], crown[1], 4), ...edgePts(crown[2], crown[1], 4)], c.frame, c.on, 1.6);
    const hs = lift(0.5, 0.5, T);
    star(g, hs.x, hs.y + 2, 5, P.brass);
  },

  balloon_cart(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 20, 8);
    box(g, 0.18, 0.2, 0.64, 0.6, 8, 18, P.oak, P.walnutL);
    for (let i = 0; i < 6; i++) {
      const a = lift(0.18 + (i / 6) * 0.64 + 0.05, 0.8, 8);
      g.poly([a, { x: a.x + 3, y: a.y - 1.5 }, { x: a.x + 3, y: a.y - 13.5 }, { x: a.x, y: a.y - 12 }]).fill(i % 2 ? P.lacquer : P.cream);
    }
    for (const [tx, ty] of [
      [0.25, 0.8],
      [0.8, 0.25],
    ]) {
      const w = lift(tx, ty, 8);
      g.circle(w.x, w.y, 7).fill(P.iron).stroke({ width: 1, color: INK });
      g.circle(w.x, w.y, 4).stroke({ width: 1.5, color: P.brass });
    }
    const hub = lift(0.5, 0.5, 28);
    const cols = [P.lacquer, 0x7ecbff, P.mustard, 0xd6a3ff, P.mint, P.pink, 0xff8a5b];
    const balloons: Array<[number, number]> = [
      [-18, 76],
      [-6, 96],
      [8, 88],
      [20, 72],
      [-12, 60],
      [14, 104],
      [2, 66],
    ];
    balloons.forEach(([dx, h], i) => {
      const bob = Math.sin(c.t * TAU + i * 0.9) * 3;
      const bx = x + dx + Math.sin(c.t * TAU + i) * 1.5;
      const by = y - h - bob;
      g.moveTo(hub.x, hub.y).quadraticCurveTo(hub.x + dx * 0.3, (hub.y + by) / 2, bx, by + 9).stroke({ width: 0.8, color: INK, alpha: 0.7 });
      if (i === 5) {
        star(g, bx, by, 10, P.brass);
        star(g, bx - 2, by - 2, 4, P.brassL);
        return;
      }
      g.ellipse(bx, by, 8, 9.5).fill(rad(shade(cols[i], 1.3), shade(cols[i], 0.8))).stroke({ width: 1, color: INK });
      g.ellipse(bx - 3, by - 4, 2, 3).fill({ color: WHITE, alpha: 0.6 });
      g.poly([{ x: bx - 2, y: by + 10 }, { x: bx + 2, y: by + 10 }, { x: bx, y: by + 8 }]).fill(shade(cols[i], 0.8));
    });
  },

  dancing_fountain(g, c) {
    const m = lift(1.5, 1.5, 0);
    const rx = 64;
    const ry = 32;
    shadow(g, m.x, m.y + 4, rx + 4, ry + 3, 0.2);
    cylinder(g, m.x, m.y, rx, ry, 13, grad(0xf1ebe1, 0xd4c9b7), 0xd9cfbf);
    g.ellipse(m.x, m.y - 13, rx - 7, ry - 4).fill(grad(0x7fd0ee, 0x2f86b8)).stroke({ width: 1.2, color: 0x2d6f94 });
    g.poly(frontArc(m.x, m.y - 6, rx, ry, 24), false).stroke({ width: 1.5, color: P.brass });
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      g.ellipse(m.x, m.y - 13, 12 + k * 40, 6 + k * 20).stroke({ width: 1.2, color: WHITE, alpha: 0.45 * (1 - k) });
    }
    const lights = [P.bulb, 0x7ecbff, P.pink, P.mint, 0xd6a3ff, P.bulb];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      glow(g, m.x + Math.cos(a) * 38, m.y - 13 + Math.sin(a) * 19, 10, lights[(i + c.frame) % lights.length], 0.35);
    }
    const jet = (i: number) => {
      const a = (i / 8) * TAU + 0.2;
      const nx = m.x + Math.cos(a) * 46;
      const ny = m.y - 13 + Math.sin(a) * 23;
      const h = 18 + 30 * Math.abs(Math.sin(c.t * TAU + i * 0.8));
      const ex = m.x + Math.cos(a) * 14;
      const ey = m.y - 13 + Math.sin(a) * 7;
      g.moveTo(nx, ny).quadraticCurveTo((nx + ex) / 2, Math.min(ny, ey) - h * 1.6, ex, ey).stroke({ width: 3.5, color: 0xbfe9ff, alpha: 0.35 });
      g.moveTo(nx, ny).quadraticCurveTo((nx + ex) / 2, Math.min(ny, ey) - h * 1.6, ex, ey).stroke({ width: 1.4, color: WHITE, alpha: 0.9 });
      g.circle(nx, ny, 2.2).fill(P.brass);
    };
    const back = [...Array(8).keys()].filter((i) => Math.sin((i / 8) * TAU + 0.2) < 0);
    const front = [...Array(8).keys()].filter((i) => Math.sin((i / 8) * TAU + 0.2) >= 0);
    back.forEach(jet);
    cylinder(g, m.x, m.y - 13, 7, 3.5, 20, P.brassL, P.brass);
    g.ellipse(m.x, m.y - 34, 17, 6).fill(grad(P.brassL, P.brassD)).stroke({ width: 1.2, color: INK });
    g.ellipse(m.x, m.y - 35, 13, 4).fill(0x7fd0ee);
    const plume = 22 + 14 * Math.sin(c.t * TAU * 2);
    g.moveTo(m.x, m.y - 36).lineTo(m.x, m.y - 36 - plume).stroke({ width: 6, color: 0xbfe9ff, alpha: 0.45, cap: 'round' });
    g.moveTo(m.x, m.y - 36).lineTo(m.x, m.y - 36 - plume).stroke({ width: 2.5, color: WHITE, cap: 'round' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + c.t * TAU;
      const k = (c.t * 2 + i / 6) % 1;
      g.circle(m.x + Math.cos(a) * 14 * k, m.y - 36 - plume + k * (plume + 2), 1.6).fill({ color: WHITE, alpha: 1 - k });
    }
    front.forEach(jet);
  },

  park_lamp(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 1, 10, 4);
    if (c.on) g.ellipse(x, y, 40, 18).fill({ color: P.bulb, alpha: 0.12 });
    cylinder(g, x, y, 7, 3.5, 7, P.iron, P.iron);
    g.poly([{ x: x - 3, y: y - 7 }, { x: x + 3, y: y - 7 }, { x: x + 2, y: y - T + 20 }, { x: x - 2, y: y - T + 20 }]).fill(hgrad(0x5a524c, P.iron));
    for (const h of [12, T * 0.55, T - 22]) g.rect(x - 3.5, y - h, 7, 2.5).fill(P.brass);
    const armY = y - T + 22;
    g.moveTo(x - 15, armY).quadraticCurveTo(x, armY - 8, x + 15, armY).stroke({ width: 2.5, color: P.iron });
    for (const s of [-1, 1]) {
      const lx = x + s * 15;
      const ly = armY + 2;
      const flick = c.on ? 0.85 + 0.15 * Math.sin(c.t * TAU * 3 + s) : 0;
      if (c.on) glow(g, lx, ly + 8, 18, P.bulb, flick);
      g.poly([{ x: lx - 6, y: ly }, { x: lx + 6, y: ly }, { x: lx, y: ly - 6 }]).fill(P.brass).stroke({ width: 1, color: INK });
      g.rect(lx - 5, ly, 10, 14).fill({ color: c.on ? 0xfff1c8 : 0xcfd6dc, alpha: c.on ? 0.95 : 0.6 }).stroke({ width: 1.2, color: P.brassD });
      g.moveTo(lx, ly).lineTo(lx, ly + 14).stroke({ width: 0.8, color: P.brassD });
      g.rect(lx - 6, ly + 14, 12, 2.5).fill(P.brass);
    }
    g.circle(x, y - T + 8, 3).fill(P.brass).stroke({ width: 1, color: INK });
  },

  high_striker(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 20, 9);
    box(g, 0.15, 0.15, 0.7, 0.7, 0, 10, P.walnutL, P.walnut);
    const pad = lift(0.5, 0.8, 10);
    g.ellipse(pad.x, pad.y, 7, 3.5).fill(rad(0xff8a80, P.lacquerD)).stroke({ width: 1, color: INK });
    const ml = lift(0.85, 0.3, 10);
    g.moveTo(ml.x, ml.y).lineTo(ml.x + 10, ml.y - 24).stroke({ width: 2.5, color: P.oak });
    g.roundRect(ml.x + 5, ml.y - 30, 12, 7, 2).fill(P.lacquer).stroke({ width: 1, color: INK });
    const top = y - T + 12;
    const bottom = y - 12;
    g.roundRect(x - 10, top, 20, bottom - top, 5).fill(grad(P.cream, P.linenD)).stroke({ width: 1.8, color: INK });
    const bands = [0x63b04a, 0xb8e986, 0xf9d66b, 0xf0a35e, 0xe0553d, P.lacquerD];
    bands.forEach((col, i) => {
      const yy = bottom - 6 - (i / bands.length) * (bottom - top - 22);
      g.rect(x - 7, yy - 10, 14, 8).fill({ color: col, alpha: 0.85 });
    });
    g.moveTo(x, top + 12).lineTo(x, bottom - 4).stroke({ width: 1, color: P.brassD });
    const k = Math.abs(Math.sin(c.t * Math.PI));
    const py = bottom - 8 - k * (bottom - top - 26);
    const ring = k > 0.94;
    if (ring) glow(g, x, top + 5, 22, P.brassL, 0.9);
    g.circle(x, top + 5, 7).fill(rad(P.brassL, P.brassD)).stroke({ width: 1.2, color: INK });
    if (ring) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        g.moveTo(x + Math.cos(a) * 10, top + 5 + Math.sin(a) * 10).lineTo(x + Math.cos(a) * 15, top + 5 + Math.sin(a) * 15).stroke({ width: 1.5, color: P.brass });
      }
    }
    g.roundRect(x - 5, py - 3, 10, 6, 2).fill(P.lacquer).stroke({ width: 1, color: INK });
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i < 9; i++) {
      const yy = bottom - 4 - (i / 8) * (bottom - top - 12);
      left.push({ x: x - 12, y: yy });
      right.push({ x: x + 12, y: yy });
    }
    chase(g, [...left, ...right.reverse()], c.frame, c.on, 1.6);
  },

  snack_bar(g, c) {
    const wide = c.w >= c.h;
    const at = (k: number, z: number) => (wide ? lift(0.18 + k * (c.w - 0.36), c.h / 2, z) : lift(c.w / 2, 0.18 + k * (c.h - 0.36), z));
    shadow(g, c.cx, c.cy + 3, 40, 15, 0.2);
    const [bx, by, bw, bh] = wide ? [0.06, 0.18, c.w - 0.12, c.h - 0.36] : [0.18, 0.06, c.w - 0.36, c.h - 0.12];
    box(g, bx, by, bw, bh, 0, 36, P.walnutL, P.walnut);
    for (let i = 1; i < 8; i++) {
      const a = wide ? lift(bx + (i / 8) * bw, by + bh, 4) : lift(bx + bw, by + (i / 8) * bh, 4);
      g.moveTo(a.x, a.y).lineTo(a.x, a.y - 28).stroke({ width: 1, color: P.walnut, alpha: 0.6 });
    }
    const r0 = wide ? lift(bx, by + bh + 0.08, 6) : lift(bx + bw + 0.08, by, 6);
    const r1 = wide ? lift(bx + bw, by + bh + 0.08, 6) : lift(bx + bw + 0.08, by + bh, 6);
    g.moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).stroke({ width: 2, color: P.brass });
    box(g, bx - 0.03, by - 0.03, bw + 0.06, bh + 0.06, 36, 4, P.marble, 0xcfc6b8);
    const donut = [P.pink, 0x9c6242, P.cream];
    for (let i = 0; i < 3; i++) {
      const p = at(0.08 + i * 0.12, 42);
      g.ellipse(p.x, p.y, 5, 2.8).fill(donut[i]).stroke({ width: 0.8, color: INK });
      g.ellipse(p.x, p.y - 0.5, 1.6, 0.9).fill(P.marble);
      for (let s = 0; s < 3; s++) g.rect(p.x - 3 + s * 2.5, p.y - 1.5 + (s % 2), 1.2, 0.6).fill([0x7ecbff, P.mustard, P.mint][s]);
    }
    const cr = at(0.18, 50);
    g.moveTo(cr.x - 7, cr.y).quadraticCurveTo(cr.x, cr.y - 8, cr.x + 7, cr.y).quadraticCurveTo(cr.x, cr.y - 2, cr.x - 7, cr.y).fill(0xe8a25a).stroke({ width: 0.8, color: INK });
    const [cx0, cy0, cw, chh] = wide ? [0.1, by + 0.05, 0.45 * c.w, bh - 0.1] : [bx + 0.05, 0.1, bw - 0.1, 0.45 * c.h];
    glassBox(g, cx0, cy0, cw, chh, 40, 16);
    const em = at(0.78, 40);
    g.roundRect(em.x - 11, em.y - 20, 22, 20, 3).fill(hgrad(P.brassL, P.brassD)).stroke({ width: 1.2, color: INK });
    g.ellipse(em.x, em.y - 21, 9, 3.5).fill(P.brass).stroke({ width: 1, color: INK });
    g.circle(em.x, em.y - 27, 3).fill(P.brassL).stroke({ width: 0.8, color: INK });
    g.rect(em.x - 3, em.y - 8, 6, 3).fill(P.iron);
    g.rect(em.x - 2, em.y - 3, 4, 3).fill(WHITE).stroke({ width: 0.6, color: INK });
    g.circle(em.x + 6, em.y - 14, 2).fill(c.on ? 0x9be36b : 0x777777);
    if (c.on) {
      for (let i = 0; i < 2; i++) {
        const k = (c.t + i / 2) % 1;
        g.moveTo(em.x - 6, em.y - 24 - k * 12)
          .quadraticCurveTo(em.x - 10 + Math.sin(k * TAU) * 3, em.y - 30 - k * 12, em.x - 5, em.y - 36 - k * 12)
          .stroke({ width: 2, color: WHITE, alpha: 0.5 * (1 - k) });
      }
    }
    const mn = at(0.52, 40);
    g.roundRect(mn.x - 7, mn.y - 22, 14, 18, 2).fill(0x2f3a33).stroke({ width: 1.2, color: P.oak });
    for (let i = 0; i < 3; i++) g.rect(mn.x - 4, mn.y - 18 + i * 5, 8 - i * 2, 1).fill({ color: WHITE, alpha: 0.7 });
  },

  park_bench(g, c) {
    const F = along(g, c);
    const L = F.L;
    shadow(g, c.cx, c.cy + 3, 38, 13, 0.18);
    const ends = () => {
      for (const u of [0.14, L - 0.14]) {
        const f = F.pt(u, 0.85, 0);
        const b = F.pt(u, 0.18, 0);
        const bt = F.pt(u, 0.12, 34);
        const s = F.pt(u, 0.5, 14);
        g.moveTo(f.x, f.y).quadraticCurveTo(s.x, s.y + 2, b.x, b.y).stroke({ width: 2.5, color: P.iron });
        g.moveTo(b.x, b.y).lineTo(bt.x, bt.y).stroke({ width: 2.5, color: P.iron });
        g.circle(s.x, s.y - 4, 3).stroke({ width: 1.5, color: P.iron });
        const arm = F.pt(u, 0.7, 22);
        g.moveTo(bt.x, bt.y + 12).quadraticCurveTo(arm.x, arm.y - 6, arm.x, arm.y + 4).stroke({ width: 2, color: P.iron });
      }
    };
    const back = () => {
      F.box(0.04, 0.08, L - 0.04, 0.16, 20, 5, P.oak, P.walnutL);
      F.box(0.04, 0.08, L - 0.04, 0.16, 29, 5, P.oak, P.walnutL);
    };
    const seat = () => {
      for (const [v0, v1] of [
        [0.28, 0.46],
        [0.5, 0.68],
        [0.72, 0.9],
      ]) {
        F.box(0.04, v0, L - 0.04, v1, 13, 3, P.oakL, P.oak);
      }
    };
    if (F.farBack) {
      back();
      ends();
      seat();
    } else {
      seat();
      ends();
      back();
    }
  },

  brass_stanchion(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 1, 9, 4);
    // velvet rope swags toward the neighbouring posts in the queue line
    for (const [tx, ty] of [
      [0.5, 0],
      [0.5, 1],
    ]) {
      const e = lift(tx, ty, 24);
      const mx = (x + e.x) / 2;
      const my = (y - 28 + e.y) / 2 + 7;
      g.moveTo(x, y - 28).quadraticCurveTo(mx, my, e.x, e.y).stroke({ width: 3.5, color: P.lacquerD, cap: 'round' });
      g.moveTo(x, y - 28).quadraticCurveTo(mx, my, e.x, e.y).stroke({ width: 2, color: P.lacquer, cap: 'round' });
    }
    g.ellipse(x, y - 1, 8, 4).fill(grad(P.brassL, P.brassD)).stroke({ width: 1, color: INK });
    g.rect(x - 1.8, y - 30, 3.6, 29).fill(hgrad(P.brassL, P.brassD));
    g.circle(x, y - 32, 3.5).fill(rad(WHITE, P.brass)).stroke({ width: 1, color: INK });
  },

  // ---- ride platforms (vehicles, riders and canopies are live, see rides.ts)

  carousel(g, c) {
    const m = lift(1.5, 1.5, 0);
    const rx = 66;
    const ry = 33;
    shadow(g, m.x, m.y + 5, rx + 6, ry + 4, 0.22);
    cylinder(g, m.x, m.y, rx, ry, 14, rad(P.oakL, P.oak, 0.5, 0.4), c.side);
    g.poly(frontArc(m.x, m.y - 7, rx, ry, 30), false).stroke({ width: 1.5, color: P.brass });
    chase(g, frontArc(m.x, m.y - 7, rx, ry, 22).slice(1, -1), c.frame, true, 1.8);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      g.moveTo(m.x, m.y - 14).lineTo(m.x + Math.cos(a) * rx, m.y - 14 + Math.sin(a) * ry).stroke({ width: 1, color: P.walnut, alpha: 0.22 });
    }
    for (const k of [0.45, 0.75]) g.ellipse(m.x, m.y - 14, rx * k, ry * k).stroke({ width: 1, color: P.walnut, alpha: 0.3 });
    g.ellipse(m.x, m.y - 14, rx, ry).stroke({ width: 3, color: P.brass });
    g.ellipse(m.x, m.y - 14, rx, ry).stroke({ width: 1, color: INK });
  },

  swing_ride(g, c) {
    const m = lift(1.5, 1.5, 0);
    const rx = 66;
    const ry = 33;
    shadow(g, m.x, m.y + 3, rx + 4, ry + 3, 0.18);
    cylinder(g, m.x, m.y, rx, ry, 6, P.cream, 0xcfc6b8);
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU;
      const a1 = ((i + 1) / 16) * TAU;
      g.poly([
        { x: m.x, y: m.y - 6 },
        { x: m.x + Math.cos(a0) * rx * 0.9, y: m.y - 6 + Math.sin(a0) * ry * 0.9 },
        { x: m.x + Math.cos(a1) * rx * 0.9, y: m.y - 6 + Math.sin(a1) * ry * 0.9 },
      ]).fill(i % 2 ? c.side : P.cream);
    }
    g.ellipse(m.x, m.y - 6, rx * 0.9, ry * 0.9).stroke({ width: 2, color: P.brass });
    star(g, m.x, m.y - 6, 12, P.brass);
    const posts: Pt[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      posts.push({ x: m.x + Math.cos(a) * rx, y: m.y - 6 + Math.sin(a) * ry });
    }
    posts.sort((p, q) => p.y - q.y);
    for (const p of posts) g.rect(p.x - 1, p.y - 12, 2, 12).fill(P.brass);
    chase(g, posts.map((p) => ({ x: p.x, y: p.y - 13 })), c.frame, true, 1.8, 2);
  },

  teacup_ride(g, c) {
    const m = lift(1, 1, 0);
    const rx = 44;
    const ry = 22;
    shadow(g, m.x, m.y + 3, rx + 4, ry + 3, 0.18);
    cylinder(g, m.x, m.y, rx, ry, 8, rad(0xfff0f5, c.top, 0.5, 0.4), shade(c.top, 0.9));
    for (let i = 0; i < 6; i++) {
      const a = c.t * TAU + (i / 6) * TAU;
      g.moveTo(m.x, m.y - 8)
        .quadraticCurveTo(m.x + Math.cos(a + 0.6) * rx * 0.6, m.y - 8 + Math.sin(a + 0.6) * ry * 0.6, m.x + Math.cos(a + 1.2) * rx * 0.92, m.y - 8 + Math.sin(a + 1.2) * ry * 0.92)
        .stroke({ width: 3, color: i % 2 ? P.mint : 0xd6a3ff, alpha: 0.45 });
    }
    chase(g, frontArc(m.x, m.y - 4, rx, ry, 14).slice(1, -1), c.frame, true, 1.5, 2);
  },

  drop_tower(g, c) {
    const T = c.def.tall;
    box(g, 0.06, 0.06, 1.88, 1.88, 0, T, P.marble, 0xcbc2b4);
    const cn = [lift(0.06, 0.06, T), lift(1.94, 0.06, T), lift(1.94, 1.94, T), lift(0.06, 1.94, T)];
    diamond(g, 0.06, 0.06, 1.88, 1.88, 10, T).stroke({ width: 1.5, color: P.brass });
    const ctr = lift(1, 1, T);
    for (const q of cn) g.moveTo(ctr.x, ctr.y).lineTo(ctr.x + (q.x - ctr.x) * 0.55, ctr.y + (q.y - ctr.y) * 0.55).stroke({ width: 1.2, color: P.brass, alpha: 0.8 });
    const sideA = lift(1.94, 0.06, 7);
    const sideB = lift(1.94, 1.94, 7);
    const sideC = lift(0.06, 1.94, 7);
    chase(g, [...edgePts(sideA, sideB, 8), ...edgePts(sideC, sideB, 8)], c.frame, true, 1.5);
  },

  coaster_gate(g, c) {
    const T = c.def.tall;
    const W = c.w;
    box(g, 0, 0.04, W, 0.9, 0, 10, P.oak, P.walnutL);
    for (let i = 1; i < 12; i++) {
      const a = lift((i / 12) * W, 0.04, 10);
      const b = lift((i / 12) * W, 0.94, 10);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: P.walnut, alpha: 0.35 });
    }
    const e0 = lift(0, 0.1, 10);
    const e1 = lift(W, 0.1, 10);
    g.moveTo(e0.x, e0.y).lineTo(e1.x, e1.y).stroke({ width: 2.5, color: P.mustard });
    // boarding gates swing open and shut
    for (let i = 0; i < W; i++) {
      const open = Math.max(0, Math.sin(c.t * TAU + i * 0.4));
      const hinge = lift(i + 0.12, 0.3, 10);
      const tip = lift(i + 0.12 + 0.7 * (1 - open), 0.3 + 0.35 * open, 10);
      g.moveTo(hinge.x, hinge.y).lineTo(hinge.x, hinge.y - 20).stroke({ width: 2, color: P.brassD });
      g.poly([hinge, tip, { x: tip.x, y: tip.y - 14 }, { x: hinge.x, y: hinge.y - 14 }]).fill({ color: P.brass, alpha: 0.35 }).stroke({ width: 1.2, color: P.brassD });
    }
    for (let i = 0; i <= W * 2; i++) {
      const p = lift((i / (W * 2)) * W, 0.9, 10);
      g.moveTo(p.x, p.y).lineTo(p.x, p.y - 20).stroke({ width: 1.8, color: P.brassD });
    }
    const r0 = lift(0, 0.9, 30);
    const r1 = lift(W, 0.9, 30);
    g.moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).stroke({ width: 3, color: P.brass });
    for (const u of [0.05, W - 0.05]) {
      const b = lift(u, 0.5, 10);
      g.rect(b.x - 2, b.y - T + 4, 4, T - 4).fill(hgrad(0x5a524c, P.iron));
      edison(g, b.x, b.y - T + 8, true, c.frame % 3 === 0 ? 0.8 : 1, 1.1);
    }
    const s = lift(0.05, 0.5, T - 14);
    g.roundRect(s.x + 4, s.y - 12, 34, 16, 4).fill(P.cream).stroke({ width: 1.5, color: P.lacquer });
    g.poly([{ x: s.x + 30, y: s.y - 9 }, { x: s.x + 36, y: s.y - 4 }, { x: s.x + 30, y: s.y + 1 }]).fill(P.lacquer);
    for (let i = 0; i < 4; i++) g.rect(s.x + 9 + i * 5, s.y - 7, 3, 6).fill(P.lacquer);
  },

  // ---- wall pieces

  wall_park(g, c) {
    const id = c.def.id;
    if (id === 'marquee_sign') {
      const W = wallMap(c, 24, 94);
      quad(g, W, 0.02, -0.04, 0.98, 1.02).fill({ color: INK, alpha: 0.3 });
      quad(g, W, 0.03, 0, 0.97, 1).fill(grad(0x3a2416, 0x24160d)).stroke({ width: 3, color: P.brass });
      quad(g, W, 0.05, 0.05, 0.95, 0.95).stroke({ width: 1, color: P.brassD });
      const edge: Pt[] = [];
      for (let i = 0; i <= 20; i++) edge.push(W(0.04 + (i / 20) * 0.92, 0.96));
      for (let i = 1; i < 6; i++) edge.push(W(0.96, 0.96 - (i / 6) * 0.92));
      for (let i = 0; i <= 20; i++) edge.push(W(0.96 - (i / 20) * 0.92, 0.04));
      for (let i = 1; i < 6; i++) edge.push(W(0.04, 0.04 + (i / 6) * 0.92));
      chase(g, edge, c.frame, true, 1.5, 3);
      bulbWord(g, W, 'WONDER', 0.1, 0.9, 0.52, 0.88, c.frame, 0);
      bulbWord(g, W, 'DOME', 0.27, 0.73, 0.12, 0.44, c.frame, 2);
      for (const u of [0.1, 0.9]) {
        const p = W(u, 0.28);
        star(g, p.x, p.y, 6, P.brass);
      }
      return;
    }
    if (id === 'arched_window') {
      const W = wallMap(c, 6, 94);
      const arch = (inset: number) => {
        const pts: Pt[] = [W(0.1 + inset, 0.02 + inset * 0.5), W(0.9 - inset, 0.02 + inset * 0.5)];
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * Math.PI;
          pts.push(W(0.5 + (0.4 - inset) * Math.cos(a), 0.7 + (0.28 - inset * 0.6) * Math.sin(a)));
        }
        return pts;
      };
      g.poly(arch(-0.03)).fill(P.walnut).stroke({ width: 2, color: INK });
      g.poly(arch(0.04)).fill(grad(0xcfe7d4, 0x6f9f6a));
      quad(g, W, 0.16, 0.04, 0.84, 0.18).fill({ color: 0x5ab8e0, alpha: 0.7 });
      for (let i = 0; i < 14; i++) {
        const sway = Math.sin(c.t * TAU + i) * 0.012;
        const p = W(0.18 + rnd(i) * 0.64 + sway, 0.14 + rnd(i + 20) * 0.62);
        const r = 5 + rnd(i + 3) * 7;
        g.circle(p.x, p.y, r).fill(i % 3 === 0 ? P.leafD : i % 3 === 1 ? P.leaf : P.leafL);
      }
      for (let i = 0; i < 3; i++) {
        const p = W(0.25 + i * 0.25, 0.18);
        g.circle(p.x, p.y, 2.2).fill(i === 1 ? P.pink : 0xfff1a8);
      }
      const v0 = W(0.5, 0.04);
      const v1 = W(0.5, 0.97);
      g.moveTo(v0.x, v0.y).lineTo(v1.x, v1.y).stroke({ width: 3, color: P.walnut });
      for (const v of [0.3, 0.58]) {
        const a = W(0.14, v);
        const b = W(0.86, v);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5, color: P.walnut });
      }
      const s0 = W(0.2, 0.2);
      const s1 = W(0.38, 0.8);
      g.moveTo(s0.x, s0.y).lineTo(s1.x, s1.y).stroke({ width: 3, color: WHITE, alpha: 0.25 });
      quad(g, W, 0.06, -0.03, 0.94, 0.02).fill(P.brass).stroke({ width: 1, color: INK });
      return;
    }
    if (id === 'framed_posters') {
      const W = wallMap(c, 28, 86);
      [0, 1, 2].forEach((i) => {
        const u0 = 0.04 + i * 0.32;
        const u1 = u0 + 0.28;
        const lp = W((u0 + u1) / 2, 1.08);
        g.poly([lp, W(u0, 0.55), W(u1, 0.55)]).fill({ color: P.bulb, alpha: 0.12 });
        quad(g, W, u0 - 0.01, -0.02, u1 + 0.01, 1.02).fill({ color: INK, alpha: 0.25 });
        quad(g, W, u0, 0, u1, 1).fill(P.walnut).stroke({ width: 1.5, color: INK });
        quad(g, W, u0 + 0.02, 0.05, u1 - 0.02, 0.95).fill(P.cream);
        quad(g, W, u0 + 0.04, 0.12, u1 - 0.04, 0.88).fill(i === 0 ? 0xf6c27a : i === 1 ? 0xbfe3d6 : 0xf3c6d4);
        const mid = W((u0 + u1) / 2, 0.5);
        if (i === 0) {
          // coaster over a sunset
          g.circle(mid.x, mid.y + 2, 9).fill(0xf08a4b);
          const pts = [0.06, 0.3, 0.12, 0.8, 0.35, 0.22, 0.6].map((v, k) => W(u0 + 0.05 + (k / 6) * 0.18, 0.2 + v * 0.55));
          g.poly(pts, false).stroke({ width: 2, color: P.lacquerD });
        } else if (i === 1) {
          // carousel tent
          g.poly([W(u0 + 0.06, 0.4), W(u1 - 0.06, 0.4), W((u0 + u1) / 2, 0.8)]).fill(P.lacquer).stroke({ width: 1, color: INK });
          quad(g, W, u0 + 0.08, 0.2, u1 - 0.08, 0.4).fill(P.cream).stroke({ width: 1, color: INK });
        } else {
          // ferris wheel turning
          g.circle(mid.x, mid.y, 11).stroke({ width: 1.8, color: P.lacquerD });
          for (let k = 0; k < 8; k++) {
            const a = c.t * TAU * 0.25 + (k / 8) * TAU;
            g.moveTo(mid.x, mid.y).lineTo(mid.x + Math.cos(a) * 11, mid.y + Math.sin(a) * 11).stroke({ width: 0.8, color: P.lacquerD });
            g.circle(mid.x + Math.cos(a) * 11, mid.y + Math.sin(a) * 11, 1.8).fill(k % 2 ? P.mustard : P.teal);
          }
        }
        const lamp = W((u0 + u1) / 2, 1.06);
        g.roundRect(lamp.x - 6, lamp.y - 2, 12, 3, 1.5).fill(P.brass).stroke({ width: 0.8, color: INK });
      });
      return;
    }
    // wall_clock: an octagonal station clock with a swinging pendulum
    const W = wallMap(c, 30, 90);
    const cu = 0.5;
    const cv = 0.6;
    const oct = (r: number) =>
      Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI / 8 + (i / 8) * TAU;
        return W(cu + Math.cos(a) * r * 0.9, cv + Math.sin(a) * r);
      });
    const sw = Math.sin(c.t * TAU) * 0.12;
    const pv = W(cu, cv - 0.2);
    const pb = W(cu + sw, -0.05);
    g.moveTo(pv.x, pv.y).lineTo(pb.x, pb.y).stroke({ width: 1.5, color: P.brassD });
    g.circle(pb.x, pb.y, 4).fill(rad(P.brassL, P.brassD)).stroke({ width: 0.8, color: INK });
    g.poly(oct(0.42)).fill(P.walnut).stroke({ width: 2, color: INK });
    g.poly(oct(0.33)).fill(rad(WHITE, P.linen)).stroke({ width: 1, color: P.brassD });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const p0 = W(cu + Math.cos(a) * 0.26 * 0.9, cv + Math.sin(a) * 0.26);
      const p1 = W(cu + Math.cos(a) * 0.3 * 0.9, cv + Math.sin(a) * 0.3);
      g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: i % 3 ? 0.8 : 1.6, color: INK });
    }
    const ctr = W(cu, cv);
    const hand = (a: number, r: number, wdt: number) => {
      const e = W(cu + Math.cos(a) * r * 0.9, cv + Math.sin(a) * r);
      g.moveTo(ctr.x, ctr.y).lineTo(e.x, e.y).stroke({ width: wdt, color: INK, cap: 'round' });
    };
    hand(Math.PI * 0.2, 0.16, 2);
    hand(Math.PI / 2 - c.t * TAU, 0.25, 1.4);
    g.circle(ctr.x, ctr.y, 1.8).fill(P.brass);
  },
};
