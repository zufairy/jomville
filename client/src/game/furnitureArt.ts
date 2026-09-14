import { FillGradient, Graphics } from 'pixi.js';
import { FurnitureDef, PALETTE, TILE_W, footprint, tileToScreen } from '@dovey/shared';
import { LAB_PAINTERS } from './labArt';
import { BEACH_PAINTERS } from './beachArt';
import { DREAM_PAINTERS } from './dreamArt';
import { PARK_PAINTERS, cylinder, grad, hgrad, rad } from './parkArt';
import { DEN_PAINTERS } from './denArt';
import { CASINO_PAINTERS } from './casinoArt';

/**
 * Vector art for every furniture kind. Each item is drawn as a function of
 * (rotation, animation frame, on/off) so the atlas can bake a sprite sheet
 * from it. Origin = top corner of tile (0,0) of the footprint.
 */

export const INK = PALETTE[0];
const OUTLINE = 2;
const TAU = Math.PI * 2;

export function shade(colour: number, k: number): number {
  const r = Math.min(255, Math.round(((colour >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((colour >> 8) & 255) * k));
  const b = Math.min(255, Math.round((colour & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/**
 * Isometric box: footprint `w`x`h` tiles at tile offset (tx,ty), lifted `z` px,
 * `tall` px high. Three faces + ink outline.
 */
export function box(g: Graphics, tx: number, ty: number, w: number, h: number, z: number, tall: number, top: number, side: number, outline = true) {
  const a = tileToScreen(tx, ty);
  const b = tileToScreen(tx + w, ty);
  const c = tileToScreen(tx + w, ty + h);
  const d = tileToScreen(tx, ty + h);
  const lift = (p: { x: number; y: number }, k: number) => ({ x: p.x, y: p.y - k });
  const [b0, c0, d0] = [lift(b, z), lift(c, z), lift(d, z)];
  const [A, B, C, D] = [lift(a, z + tall), lift(b, z + tall), lift(c, z + tall), lift(d, z + tall)];
  // light comes from the upper right: faces darken toward the floor, the top glows toward its back corner
  if (tall > 0) {
    g.poly([d0, c0, C, D]).fill(grad(shade(side, 0.9), shade(side, 0.66)));
    g.poly([c0, b0, B, C]).fill(grad(shade(side, 1.06), shade(side, 0.82)));
  }
  g.poly([A, B, C, D]).fill(grad(shade(top, 1.13), shade(top, 0.94)));
  // rounded front edges: a soft highlight hugging the two near edges of the top face
  if (tall >= 2 && C.y - A.y > 6) {
    g.moveTo(D.x + 2, D.y - 1).lineTo(C.x, C.y - 1.8).lineTo(B.x - 2, B.y - 1).stroke({ width: 1.3, color: 0xffffff, alpha: 0.4, cap: 'round', join: 'round' });
    if (tall >= 8) g.moveTo(C.x + 1.4, C.y + 2).lineTo(c0.x + 1.4, c0.y - 2).stroke({ width: 1, color: 0xffffff, alpha: 0.16 });
  }
  if (!outline) return;
  const ink = { width: OUTLINE, color: INK, join: 'round', cap: 'round' } as const;
  g.moveTo(A.x, A.y).lineTo(B.x, B.y).lineTo(C.x, C.y).lineTo(D.x, D.y).closePath().stroke(ink);
  if (tall > 0) {
    g.moveTo(D.x, D.y).lineTo(d0.x, d0.y).lineTo(c0.x, c0.y).lineTo(b0.x, b0.y).lineTo(B.x, B.y).stroke(ink);
    g.moveTo(C.x, C.y).lineTo(c0.x, c0.y).stroke(ink);
  }
}

/** soft contact shadow under a footprint, spread a little so the piece sits on the floor */
function floorShadow(g: Graphics, tx: number, ty: number, w: number, h: number, alpha = 0.15) {
  const s = 0.07;
  const pts = [tileToScreen(tx - s, ty - s), tileToScreen(tx + w + s, ty - s), tileToScreen(tx + w + s, ty + h + s), tileToScreen(tx - s, ty + h + s)];
  g.poly(pts.map((p) => ({ x: p.x, y: p.y + 2 }))).fill({ color: INK, alpha });
}

/** plump cushion: a box with a puffed lighter centre, stitched seam and a button tuft */
function cushion(g: Graphics, tx: number, ty: number, w: number, h: number, z: number, tall: number, col: number, tuft = true) {
  box(g, tx, ty, w, h, z, tall, col, shade(col, 0.94));
  const top = z + tall;
  const seam = Math.min(w, h) * 0.16 * TILE_W;
  diamondStroke(g, tx, ty, w, h, shade(col, 0.8), 1, seam, top);
  const m = tileToScreen(tx + w / 2, ty + h / 2);
  g.ellipse(m.x - 2, m.y - top - 1.5, Math.max(4, w * 12), Math.max(2, h * 5)).fill({ color: 0xffffff, alpha: 0.18 });
  if (tuft) g.circle(m.x, m.y - top, 1.3).fill(shade(col, 0.66));
}

/** rectangle of a backrest strip `t` tiles thick, opposite the seat facing (see seatFacing) */
function backRect(rot: number, w: number, h: number, t: number, i = 0.05): [number, number, number, number] {
  const r = rot % 4;
  if (r === 0) return [i, i, w - 2 * i, t];
  if (r === 1) return [w - i - t, i, t, h - 2 * i];
  if (r === 2) return [i, h - i - t, w - 2 * i, t];
  return [i, i, t, h - 2 * i];
}

/** the two armrests of a seat, farther one first */
function armRects(rot: number, w: number, h: number, t: number, i = 0.05): Array<[number, number, number, number]> {
  return rot % 2 === 0
    ? [[i, i, t, h - 2 * i], [w - i - t, i, t, h - 2 * i]]
    : [[i, i, w - 2 * i, t], [i, h - i - t, w - 2 * i, t]];
}

/** a point on a vertical front face of a footprint: `u` 0..1 left to right on screen, `z` px up */
function facePoint(tx: number, ty: number, w: number, h: number, alongX: boolean, u: number, z: number) {
  const p = alongX ? tileToScreen(tx + w * u, ty + h) : tileToScreen(tx + w, ty + h - h * u);
  return { x: p.x, y: p.y - z };
}

/** wooden crate: box with plank seams, corner battens and a diagonal brace on both near faces */
function crate(g: Graphics, tx: number, ty: number, w: number, h: number, z: number, tall: number, top: number, side: number) {
  box(g, tx, ty, w, h, z, tall, top, side);
  for (const alongX of [true, false]) {
    const P = (u: number, k: number) => facePoint(tx, ty, w, h, alongX, u, z + k);
    const dark = shade(side, alongX ? 0.55 : 0.62);
    g.moveTo(P(0.04, tall / 2).x, P(0.04, tall / 2).y).lineTo(P(0.96, tall / 2).x, P(0.96, tall / 2).y).stroke({ width: 1.2, color: dark });
    g.moveTo(P(0.16, tall * 0.18).x, P(0.16, tall * 0.18).y).lineTo(P(0.84, tall * 0.82).x, P(0.84, tall * 0.82).y).stroke({ width: 3.2, color: dark });
    g.moveTo(P(0.16, tall * 0.18).x, P(0.16, tall * 0.18).y - 1).lineTo(P(0.84, tall * 0.82).x, P(0.84, tall * 0.82).y - 1).stroke({ width: 1, color: shade(side, 1.25), alpha: 0.5 });
    for (const u of [0.1, 0.9]) {
      g.moveTo(P(u, 2).x, P(u, 2).y).lineTo(P(u, tall - 2).x, P(u, tall - 2).y).stroke({ width: 2.4, color: dark, alpha: 0.7 });
      for (const k of [0.2, 0.8]) g.circle(P(u, tall * k).x, P(u, tall * k).y, 0.9).fill(shade(side, 1.4));
    }
  }
  for (const k of [0.33, 0.66]) {
    const p0 = tileToScreen(tx + w * k, ty);
    const p1 = tileToScreen(tx + w * k, ty + h);
    g.moveTo(p0.x, p0.y - z - tall).lineTo(p1.x, p1.y - z - tall).stroke({ width: 1.2, color: shade(top, 0.72) });
  }
}

/** flat diamond on the floor (rugs, paths), optionally lifted by z px */
function diamond(g: Graphics, tx: number, ty: number, w: number, h: number, colour: number, inset = 0, z = 0) {
  const i = inset / TILE_W;
  const p0 = tileToScreen(tx + i, ty + i);
  const p1 = tileToScreen(tx + w - i, ty + i);
  const p2 = tileToScreen(tx + w - i, ty + h - i);
  const p3 = tileToScreen(tx + i, ty + h - i);
  g.moveTo(p0.x, p0.y - z).lineTo(p1.x, p1.y - z).lineTo(p2.x, p2.y - z).lineTo(p3.x, p3.y - z).closePath().fill(colour);
}

function diamondStroke(g: Graphics, tx: number, ty: number, w: number, h: number, colour: number, width: number, inset = 0, z = 0) {
  const i = inset / TILE_W;
  const p0 = tileToScreen(tx + i, ty + i);
  const p1 = tileToScreen(tx + w - i, ty + i);
  const p2 = tileToScreen(tx + w - i, ty + h - i);
  const p3 = tileToScreen(tx + i, ty + h - i);
  g.moveTo(p0.x, p0.y - z).lineTo(p1.x, p1.y - z).lineTo(p2.x, p2.y - z).lineTo(p3.x, p3.y - z).closePath().stroke({ width, color: colour });
}

function shadow(g: Graphics, cx: number, cy: number, rx: number, ry: number, alpha = 0.14) {
  g.ellipse(cx, cy, rx, ry).fill({ color: INK, alpha });
}

function glow(g: Graphics, cx: number, cy: number, r: number, colour: number, alpha: number) {
  g.circle(cx, cy, r).fill({ color: colour, alpha: alpha * 0.35 });
  g.circle(cx, cy, r * 0.62).fill({ color: colour, alpha: alpha * 0.45 });
  g.circle(cx, cy, r * 0.3).fill({ color: colour, alpha });
}

function star(g: Graphics, cx: number, cy: number, r: number, colour: number) {
  g.moveTo(cx, cy - r).lineTo(cx + r * 0.3, cy - r * 0.3).lineTo(cx + r, cy).lineTo(cx + r * 0.3, cy + r * 0.3).lineTo(cx, cy + r)
    .lineTo(cx - r * 0.3, cy + r * 0.3).lineTo(cx - r, cy).lineTo(cx - r * 0.3, cy - r * 0.3).closePath().fill(colour);
}

/** radial gradient in the shape's own bounds: light spot at (lx,ly) fading to `dark` */
function radial(light: number, dark: number, lx = 0.35, ly = 0.3): FillGradient {
  return rad(light, dark, lx, ly);
}

function vertical(top: number, bottom: number): FillGradient {
  return grad(top, bottom);
}

/** leafy blob: gradient ball, rim light, a few leaf ticks */
function foliage(g: Graphics, cx: number, cy: number, r: number, colour: number, seed = 0) {
  g.circle(cx, cy, r).fill(radial(shade(colour, 1.25), shade(colour, 0.72))).stroke({ width: OUTLINE, color: INK });
  g.circle(cx - r * 0.28, cy - r * 0.32, r * 0.28).fill({ color: 0xffffff, alpha: 0.28 });
  for (let i = 0; i < 4; i++) {
    const a = seed + i * 1.7;
    const lx = cx + Math.cos(a) * r * 0.55;
    const ly = cy + Math.sin(a) * r * 0.45;
    g.ellipse(lx, ly, 3.2, 1.6).fill({ color: shade(colour, 1.35), alpha: 0.7 });
  }
}

function trunk(g: Graphics, cx: number, baseY: number, h: number, w: number, colour: number) {
  g.moveTo(cx - w / 2, baseY)
    .quadraticCurveTo(cx - w * 0.35, baseY - h * 0.5, cx - w * 0.3, baseY - h)
    .lineTo(cx + w * 0.3, baseY - h)
    .quadraticCurveTo(cx + w * 0.35, baseY - h * 0.5, cx + w / 2, baseY)
    .closePath()
    .fill(vertical(shade(colour, 1.1), shade(colour, 0.75)))
    .stroke({ width: OUTLINE, color: INK });
  // bark lines
  g.moveTo(cx - 1, baseY - h * 0.2).lineTo(cx - 2, baseY - h * 0.6).stroke({ width: 1.2, color: shade(colour, 0.6), alpha: 0.7 });
  g.moveTo(cx + 2, baseY - h * 0.35).lineTo(cx + 1, baseY - h * 0.8).stroke({ width: 1.2, color: shade(colour, 0.6), alpha: 0.5 });
  // roots
  g.ellipse(cx, baseY, w * 0.9, 3).fill(shade(colour, 0.85)).stroke({ width: 1.5, color: INK });
}

export interface ArtCtx {
  def: FurnitureDef;
  rot: number;
  /** 0..anim-1 */
  frame: number;
  /** 0..1 progress through the loop */
  t: number;
  on: boolean;
  /** chance furni face key from artStateKey ('' for everything else) */
  state: string;
  w: number;
  h: number;
  top: number;
  side: number;
  /** screen centre of the footprint */
  cx: number;
  cy: number;
}

type Painter = (g: Graphics, c: ArtCtx) => void;

const PAINTERS: Record<string, Painter> = {
  block(g, c) {
    if (c.def.id.startsWith('crate')) {
      floorShadow(g, 0.05, 0.05, 0.9, 0.9);
      crate(g, 0.05, 0.05, 0.9, 0.9, 0, c.def.tall, c.top, c.side);
      return;
    }
    box(g, 0, 0, c.w, c.h, 0, c.def.tall, c.top, c.side);
    const a = tileToScreen(0, c.h);
    const b = tileToScreen(c.w, c.h);
    for (const k of [0.35, 0.65]) {
      g.moveTo(a.x, a.y - c.def.tall * k).lineTo(b.x, b.y - c.def.tall * k).stroke({ width: 1.5, color: shade(c.side, 0.7) });
    }
  },

  crate_stack(g, c) {
    floorShadow(g, 0.05, 0.05, 0.9, 0.9);
    crate(g, 0.05, 0.05, 0.9, 0.9, 0, 22, c.top, c.side);
    crate(g, 0.2, 0.15, 0.65, 0.65, 22, 18, shade(c.top, 1.05), shade(c.side, 1.04));
  },

  rug(g, c) {
    // plush pile: a darker edge under a raised top, woven border, medallion and tassels on the near edges
    const Z = 1.5;
    diamond(g, 0, 0, c.w, c.h, shade(c.top, 0.72));
    diamond(g, 0, 0, c.w, c.h, c.top, 0, Z);
    diamondStroke(g, 0, 0, c.w, c.h, c.side, 4, 8, Z);
    diamondStroke(g, 0, 0, c.w, c.h, shade(c.top, 1.18), 1.2, 13, Z);
    for (let i = 0.25; i < c.w; i += 0.5)
      for (let j = 0.25; j < c.h; j += 0.5) {
        const p = tileToScreen(i, j);
        g.circle(p.x, p.y - Z, 1.4).fill({ color: shade(c.top, 1.2), alpha: 0.7 });
      }
    diamond(g, c.w * 0.32, c.h * 0.32, c.w * 0.36, c.h * 0.36, c.side, 0, Z);
    diamond(g, c.w * 0.32, c.h * 0.32, c.w * 0.36, c.h * 0.36, shade(c.top, 1.1), 4, Z);
    heart(g, c.cx, c.cy - Z - 0.5, c.w > 1 ? 5 : 3.2, c.side);
    const TASSEL = PALETTE[1];
    for (let u = 0.1; u < Math.max(c.w, c.h); u += 0.13) {
      if (u < c.w - 0.04) {
        const p = tileToScreen(u, c.h);
        g.moveTo(p.x, p.y).lineTo(p.x - 3, p.y + 2.4).stroke({ width: 1.4, color: TASSEL, cap: 'round' });
      }
      if (u < c.h - 0.04) {
        const p = tileToScreen(c.w, u);
        g.moveTo(p.x, p.y).lineTo(p.x + 3, p.y + 2.4).stroke({ width: 1.4, color: TASSEL, cap: 'round' });
      }
    }
    diamondStroke(g, 0, 0, c.w, c.h, shade(c.top, 0.6), 1, 0, Z);
  },

  path(g, c) {
    diamond(g, 0, 0, c.w, c.h, c.top, 2.5);
    diamondStroke(g, 0, 0, c.w, c.h, c.side, 1.5, 2.5);
    g.circle(c.cx - 8, c.cy + 2, 1.5).fill({ color: c.side, alpha: 0.6 });
    g.circle(c.cx + 9, c.cy - 3, 1.5).fill({ color: c.side, alpha: 0.6 });
    g.circle(c.cx + 2, c.cy + 6, 1.2).fill({ color: c.side, alpha: 0.45 });
  },

  deck(g, c) {
    diamond(g, 0, 0, c.w, c.h, c.top, 1);
    for (const k of [0.33, 0.66]) {
      const a = tileToScreen(0, k);
      const b = tileToScreen(c.w, k);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.5, color: shade(c.top, 0.78) });
    }
    diamondStroke(g, 0, 0, c.w, c.h, shade(c.top, 0.7), 1.5, 1);
    g.circle(c.cx - 12, c.cy - 4, 1).fill(shade(c.top, 0.6));
    g.circle(c.cx + 12, c.cy + 4, 1).fill(shade(c.top, 0.6));
  },

  flowers(g, c) {
    diamond(g, 0, 0, c.w, c.h, c.top);
    diamondStroke(g, 0, 0, c.w, c.h, shade(c.top, 0.8), 1.5);
    const sway = Math.sin(c.t * TAU) * 1.5;
    const dots = [
      [-14, 0],
      [0, -7],
      [14, 0],
      [0, 7],
      [-7, -4],
      [7, 4],
    ];
    dots.forEach(([dx, dy], i) => {
      const col = i % 3 === 0 ? c.side : i % 3 === 1 ? PALETTE[16] : PALETTE[27];
      const x = c.cx + dx + (i % 2 ? sway : -sway) * 0.6;
      const y = c.cy + dy - 3;
      g.moveTo(x, y + 4).lineTo(x, y + 1).stroke({ width: 1.5, color: PALETTE[15] });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.circle(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.8).fill(col);
      }
      g.circle(x, y, 1.5).fill(PALETTE[17]);
    });
  },

  chair(g, c) {
    // turned wooden legs, a padded seat, spindles and a padded top rail; backrest opposite the facing (seatFacing)
    const wood = c.side;
    const T = c.def.tall;
    floorShadow(g, 0.08, 0.08, 0.84, 0.84);
    for (const [lx, ly] of [[0.12, 0.12], [0.76, 0.12], [0.12, 0.76], [0.76, 0.76]]) box(g, lx, ly, 0.12, 0.12, 0, 10, shade(wood, 1.1), wood);
    box(g, 0.06, 0.06, 0.88, 0.88, 9, 3, shade(wood, 1.15), wood);
    cushion(g, 0.13, 0.13, 0.74, 0.74, 11, 3, c.top);
    const [bx, by, bw, bh] = backRect(c.rot, 1, 1, 0.16, 0.06);
    const along = c.rot % 2 === 0;
    const posts = along ? [[bx, by], [bx + bw - 0.16, by]] : [[bx, by], [bx, by + bh - 0.16]];
    for (const [px, py] of posts) box(g, px, py, 0.16, 0.16, 12, T - 5, shade(wood, 1.1), wood);
    const mid = along ? [bx + bw / 2 - 0.05, by + 0.03, 0.1, 0.1] : [bx + 0.03, by + bh / 2 - 0.05, 0.1, 0.1];
    box(g, mid[0], mid[1], mid[2], mid[3], 12, T - 5, shade(wood, 1.1), wood);
    cushion(g, bx, by, bw, bh, T + 2, 8, c.top, false);
    const m = tileToScreen(bx + bw / 2, by + bh / 2);
    heart(g, m.x, m.y - T - 10, 3.2, shade(c.top, 1.3));
  },

  stool(g, c) {
    // round cushioned top on four splayed legs with a footrest ring
    const x = c.cx;
    const sy = c.cy - 11;
    shadow(g, x, c.cy + 2, 18, 8, 0.15);
    const legs = [-2.4, -0.75, 0.75, 2.4].map((a) => ({ a, back: Math.sin(a) < 0 }));
    const leg = (a: number) => {
      const top = { x: x + Math.cos(a) * 9, y: sy + Math.sin(a) * 4 };
      const foot = { x: x + Math.cos(a) * 14, y: c.cy + Math.sin(a) * 7 };
      g.moveTo(top.x, top.y).lineTo(foot.x, foot.y).stroke({ width: 5, color: INK, cap: 'round' });
      g.moveTo(top.x, top.y).lineTo(foot.x, foot.y).stroke({ width: 3, color: c.side, cap: 'round' });
      g.moveTo(top.x - 0.8, top.y + 1).lineTo(foot.x - 0.8, foot.y - 1).stroke({ width: 1, color: 0xffffff, alpha: 0.3 });
    };
    for (const l of legs) if (l.back) leg(l.a);
    g.ellipse(x, c.cy - 4, 12, 6).stroke({ width: 4, color: INK });
    g.ellipse(x, c.cy - 4, 12, 6).stroke({ width: 2, color: shade(c.side, 1.15) });
    for (const l of legs) if (!l.back) leg(l.a);
    cylinder(g, x, sy, 16, 8, 5, rad(shade(c.top, 1.28), shade(c.top, 0.86)), shade(c.top, 0.9));
    g.ellipse(x, sy - 5, 11, 5.5).stroke({ width: 1, color: shade(c.top, 0.72), alpha: 0.8 });
    g.ellipse(x - 5, sy - 7, 5, 2).fill({ color: 0xffffff, alpha: 0.45 });
  },

  armchair(g, c) {
    upholstered(g, c, 1);
  },

  sofa(g, c) {
    upholstered(g, c, 2);
  },

  bench(g, c) {
    // cast iron frames under three wooden seat slats and two back slats
    const T = c.def.tall;
    const along = c.w >= c.h;
    const iron = PALETTE[28];
    const ironL = shade(iron, 1.5);
    const L = along ? c.w : c.h;
    const D = along ? c.h : c.w;
    const R = (u: number, v: number, du: number, dv: number): [number, number, number, number] => (along ? [u, v, du, dv] : [v, u, dv, du]);
    floorShadow(g, 0.06, 0.06, c.w - 0.12, c.h - 0.12, 0.13);
    for (const u of [0.2, L - 0.32]) {
      for (const v of [0.14, D - 0.26]) box(g, ...R(u, v, 0.12, 0.12), 0, 7, ironL, iron);
      box(g, ...R(u, 0.1, 0.12, D - 0.2), 6, 4, ironL, iron);
    }
    const gap = 0.05;
    const sw = (D - 0.1 - gap * 2) / 3;
    for (let i = 0; i < 3; i++) box(g, ...R(0.02, 0.05 + i * (sw + gap), L - 0.04, sw), 10, 4, c.top, c.side);
    const [bx, by, bw, bh] = backRect(c.rot, c.w, c.h, 0.14, 0.02);
    const posts = along ? [[bx + 0.2, by], [bx + bw - 0.32, by]] : [[bx, by + 0.2], [bx, by + bh - 0.32]];
    for (const [px, py] of posts) box(g, px, py, along ? 0.12 : bw, along ? bh : 0.12, 14, T + 2, ironL, iron);
    box(g, bx, by, bw, bh, 17, 4, c.top, c.side);
    box(g, bx, by, bw, bh, 24, 4, c.top, c.side);
  },

  bed(g, c) {
    // wooden frame with a heart headboard, cream mattress, pillows, a patterned duvet and turned-down sheet
    const long0 = c.rot % 2 === 0;
    const wood = c.side;
    const R = (u: number, v: number, du: number, dv: number): [number, number, number, number] => (long0 ? [u, v, du, dv] : [v, u, dv, du]);
    floorShadow(g, 0, 0, c.w, c.h, 0.14);
    box(g, ...R(0, 0, 1, 0.14), 0, 30, shade(wood, 1.12), wood);
    const hb = long0 ? tileToScreen(0.5, 0.07) : tileToScreen(0.07, 0.5);
    heart(g, hb.x, hb.y - 36, 7.5, c.top);
    heartStroke(g, hb.x, hb.y - 36, 7.5);
    heart(g, hb.x - 2.4, hb.y - 38.5, 1.8, 0xffffff, 0.7);
    for (const u of [0.02, 0.86]) for (const v of [0.14, 1.84]) box(g, ...R(u, v, 0.12, 0.12), 0, 4, shade(wood, 1.1), wood);
    box(g, ...R(0.02, 0.12, 0.96, 1.84), 3, 6, shade(wood, 1.08), wood);
    box(g, ...R(0.07, 0.15, 0.86, 1.76), 9, 4, PALETTE[1], PALETTE[22]);
    for (const u of [0.12, 0.52]) cushion(g, ...R(u, 0.2, 0.36, 0.3), 13, 4, PALETTE[27], false);
    box(g, ...R(0.04, 0.68, 0.92, 1.26), 11, 5, c.top, shade(c.top, 0.92));
    box(g, ...R(0.04, 0.64, 0.92, 0.18), 12, 5, PALETTE[1], PALETTE[22]);
    for (let v = 0.98; v < 1.85; v += 0.3)
      for (const u of [0.26, 0.5, 0.74]) {
        const [x, y] = long0 ? [u, v + (u === 0.5 ? 0.15 : 0)] : [v + (u === 0.5 ? 0.15 : 0), u];
        if ((long0 ? y : x) > 1.85) continue;
        const p = tileToScreen(x, y);
        heart(g, p.x, p.y - 16, 2.2, shade(c.top, 1.3), 0.85);
      }
    box(g, ...R(0, 1.86, 1, 0.14), 0, 17, shade(wood, 1.12), wood);
  },

  table(g, c) {
    const T = c.def.tall;
    if (c.def.id === 'table_round') {
      // pedestal café table with a latte on a saucer
      const p = tileToScreen(0.5, 0.5);
      shadow(g, p.x, p.y + 2, 20, 9, 0.15);
      cylinder(g, p.x, p.y, 11, 5.5, 3, rad(shade(c.side, 1.25), c.side), shade(c.side, 0.85));
      g.roundRect(p.x - 2.5, p.y - T + 3, 5, T - 5, 2).fill(hgrad(shade(c.side, 1.2), shade(c.side, 0.7))).stroke({ width: 1.5, color: INK });
      cylinder(g, p.x, p.y - T + 4, 25, 12.5, 4, rad(shade(c.top, 1.1), shade(c.top, 0.9)), shade(c.top, 0.82));
      g.ellipse(p.x, p.y - T, 20, 10).stroke({ width: 1, color: shade(c.top, 0.78), alpha: 0.7 });
      g.ellipse(p.x - 9, p.y - T - 3, 7, 2.6).fill({ color: 0xffffff, alpha: 0.55 });
      const cx = p.x + 5;
      const cy = p.y - T + 1;
      g.ellipse(cx, cy, 7, 3.4).fill(PALETTE[27]).stroke({ width: 1.2, color: INK });
      g.ellipse(cx + 4.5, cy - 3.5, 2.2, 2).stroke({ width: 1.4, color: INK });
      cylinder(g, cx, cy - 0.5, 3.8, 1.9, 5, PALETTE[20], PALETTE[27]);
      g.ellipse(cx, cy - 5.5, 1.6, 0.7).fill(PALETTE[1]);
      return;
    }
    // trestle table: tapered legs, apron, thick overhanging top with grain, a runner and a posy
    floorShadow(g, 0.06, 0.06, c.w - 0.12, c.h - 0.12, 0.13);
    for (const [lx, ly] of [[0.12, 0.12], [c.w - 0.26, 0.12], [0.12, c.h - 0.26], [c.w - 0.26, c.h - 0.26]]) box(g, lx, ly, 0.14, 0.14, 0, T - 5, shade(c.side, 1.1), c.side);
    box(g, 0.1, 0.1, c.w - 0.2, c.h - 0.2, T - 9, 4, c.side, c.side);
    box(g, -0.03, -0.03, c.w + 0.06, c.h + 0.06, T - 5, 5, c.top, shade(c.top, 0.9));
    const along = c.w >= c.h;
    for (const k of [0.3, 0.55, 0.8]) {
      const a = along ? tileToScreen(0.1 + k * 0.3, k) : tileToScreen(k, 0.1 + k * 0.3);
      const b = along ? tileToScreen(c.w - 0.2 - k * 0.2, k) : tileToScreen(k, c.h - 0.2 - k * 0.2);
      g.moveTo(a.x, a.y - T).lineTo(b.x, b.y - T).stroke({ width: 1, color: shade(c.top, 0.8), alpha: 0.7 });
    }
    const run: [number, number, number, number] = along ? [c.w / 2 - 0.2, -0.03, 0.4, c.h + 0.06] : [-0.03, c.h / 2 - 0.2, c.w + 0.06, 0.4];
    diamond(g, run[0], run[1], run[2], run[3], PALETTE[1], 0, T);
    diamondStroke(g, run[0], run[1], run[2], run[3], PALETTE[7], 1.2, 2.5, T);
    const m = tileToScreen(c.w / 2, c.h / 2);
    cylinder(g, m.x, m.y - T + 1, 4, 2, 7, shade(PALETTE[10], 0.8), PALETTE[10]);
    for (const [dx, dy, col] of [[-3, -12, PALETTE[7]], [3, -13, PALETTE[16]], [0, -16, PALETTE[6]]] as const) {
      g.moveTo(m.x, m.y - T - 6).lineTo(m.x + dx, m.y - T + dy + 2).stroke({ width: 1.2, color: PALETTE[15] });
      g.circle(m.x + dx, m.y - T + dy, 2.6).fill(col).stroke({ width: 1, color: INK });
      g.circle(m.x + dx, m.y - T + dy, 0.9).fill(PALETTE[16]);
    }
  },

  picnic(g, c) {
    // plank table with a gingham cloth and a fruit basket, a bench along each long side
    const T = c.def.tall;
    const long = c.w >= c.h;
    const L = long ? c.w : c.h;
    const D = long ? c.h : c.w;
    const R = (u: number, v: number, du: number, dv: number): [number, number, number, number] => (long ? [u, v, du, dv] : [v, u, dv, du]);
    floorShadow(g, 0.04, 0.04, c.w - 0.08, c.h - 0.08, 0.13);
    const bench = (v: number) => {
      for (const u of [0.25, L - 0.37]) box(g, ...R(u, v + 0.08, 0.12, 0.12), 0, 6, shade(c.side, 1.1), c.side);
      box(g, ...R(0.1, v, L - 0.2, 0.28), 6, 4, c.top, c.side);
    };
    bench(0.08);
    for (const u of [0.3, L - 0.44]) box(g, ...R(u, D / 2 - 0.08, 0.14, 0.16), 0, T - 5, shade(c.side, 1.1), c.side);
    const pw = (D - 1 - 0.1) / 3;
    for (let i = 0; i < 3; i++) box(g, ...R(0.06, 0.5 + i * (pw + 0.05), L - 0.12, pw), T - 5, 5, c.top, c.side);
    const [cx0, cy0, cw, ch] = R(L / 2 - 0.5, 0.52, 1, D - 1.04);
    diamond(g, cx0, cy0, cw, ch, PALETTE[27], 0, T);
    const n = 5;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i + j) % 2) continue;
        diamond(g, cx0 + (i * cw) / n, cy0 + (j * ch) / n, cw / n, ch / n, PALETTE[5], 0, T);
      }
    diamondStroke(g, cx0, cy0, cw, ch, shade(PALETTE[5], 0.7), 1, 0, T);
    const m = tileToScreen(c.w / 2, c.h / 2);
    const by = m.y - T;
    g.moveTo(m.x - 9, by - 5).bezierCurveTo(m.x - 9, by - 20, m.x + 9, by - 20, m.x + 9, by - 5).stroke({ width: 4, color: INK });
    g.moveTo(m.x - 9, by - 5).bezierCurveTo(m.x - 9, by - 20, m.x + 9, by - 20, m.x + 9, by - 5).stroke({ width: 2, color: PALETTE[18] });
    for (const [dx, dy, col] of [[-5, -8, PALETTE[5]], [2, -10, PALETTE[14]], [6, -7, PALETTE[16]]] as const) g.circle(m.x + dx, by + dy, 3.6).fill(rad(shade(col, 1.3), col)).stroke({ width: 1, color: INK });
    cylinder(g, m.x, by, 11, 5.5, 7, shade(PALETTE[18], 0.8), PALETTE[18]);
    for (let i = -2; i <= 2; i++) g.moveTo(m.x + i * 4, by - 6 + Math.abs(i) * 0.6).lineTo(m.x + i * 4.4, by + 4.5 - Math.abs(i) * 0.9).stroke({ width: 1, color: shade(PALETTE[18], 0.65) });
    bench(D - 0.36);
  },

  shelf(g, c) {
    // open bookcase: the long face shows three cubbies of books, a globe and a tiny plant on top
    const T = c.def.tall;
    const alongX = c.w >= c.h;
    floorShadow(g, 0, 0, c.w, c.h, 0.14);
    box(g, 0, 0, c.w, c.h, 0, T, c.top, c.side);
    const P = (u: number, z: number) => facePoint(0, 0, c.w, c.h, alongX, u, z);
    const quad = (u0: number, u1: number, z0: number, z1: number) => [P(u0, z0), P(u1, z0), P(u1, z1), P(u0, z1)];
    g.poly(quad(0.06, 0.94, 3, T - 3)).fill(grad(shade(c.side, 0.42), shade(c.side, 0.58)));
    const shelves = [3, 3 + (T - 6) / 3, 3 + ((T - 6) * 2) / 3];
    const cols = [PALETTE[7], PALETTE[11], PALETTE[16], PALETTE[13], PALETTE[9], PALETTE[5], PALETTE[1]];
    shelves.forEach((zb, s) => {
      let u = 0.09;
      let i = 0;
      while (u < 0.9) {
        const seed = (s * 7 + i * 13) % 11;
        if (s === 1 && i === 3) {
          // globe
          const q = P(u + 0.07, zb + 5);
          g.circle(q.x, q.y, 4.5).fill(rad(PALETTE[31], PALETTE[11])).stroke({ width: 1, color: INK });
          g.circle(q.x + 1, q.y - 1, 1.6).fill(PALETTE[14]);
          u += 0.16;
          i++;
          continue;
        }
        const bw = 0.045 + (seed % 3) * 0.012;
        const bh = Math.min((T - 6) / 3 - 2, 7 + (seed % 4));
        if (u + bw > 0.92) break;
        const col = cols[(i + s * 3) % cols.length];
        g.poly(quad(u, u + bw, zb, zb + bh)).fill(col).stroke({ width: 0.8, color: INK });
        const band = quad(u, u + bw, zb + bh - 3, zb + bh - 2);
        g.poly(band).fill({ color: 0xffffff, alpha: 0.45 });
        u += bw + 0.008;
        i++;
      }
      if (s > 0) {
        const a = P(0.06, zb);
        const b = P(0.94, zb);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5, color: shade(c.side, 1.15) });
      }
    });
    g.poly(quad(0.06, 0.94, 3, T - 3)).stroke({ width: 1.2, color: INK });
    // tiny potted plant on top toward the back
    const tp = tileToScreen(c.w * 0.72, c.h * 0.4);
    cylinder(g, tp.x, tp.y - T, 4.5, 2.2, 6, PALETTE[21], PALETTE[4]);
    foliage(g, tp.x, tp.y - T - 11, 6, PALETTE[15], 2);
  },

  plant(g, c) {
    // glazed pot with a little face, pointed gradient leaves swaying out of the soil
    const x = c.cx;
    const y = c.cy + 2;
    const sway = Math.sin(c.t * TAU) * 1.4;
    const potH = 13;
    shadow(g, x, y + 1, 14, 6, 0.16);
    const leaf = (a: number, len: number, col: number) => {
      const bx = x;
      const by = y - potH;
      const tip = { x: bx + Math.sin(a) * len + sway * (len / 24), y: by - Math.cos(a) * len * 0.95 };
      const nx = Math.cos(a) * len * 0.3;
      const ny = Math.sin(a) * len * 0.3;
      const mx = (bx + tip.x) / 2;
      const my = (by + tip.y) / 2;
      g.moveTo(bx, by).quadraticCurveTo(mx - nx, my - ny, tip.x, tip.y).quadraticCurveTo(mx + nx, my + ny, bx, by).closePath()
        .fill(grad(shade(col, 1.28), shade(col, 0.74))).stroke({ width: 1.5, color: INK, join: 'round' });
      g.moveTo(bx, by).quadraticCurveTo(mx + nx * 0.15, my + ny * 0.15, tip.x, tip.y).stroke({ width: 1, color: shade(col, 0.6), alpha: 0.8 });
    };
    for (const [a, len] of [[-1.05, 21], [1.0, 22], [-0.42, 27], [0.4, 26]]) leaf(a, len, shade(c.top, 0.86));
    cylinder(g, x, y, 10, 5, potH - 3, PALETTE[21], c.side);
    cylinder(g, x, y - potH + 3, 12.5, 6.2, 3, rad(shade(PALETTE[21], 1.2), shade(PALETTE[21], 0.7)), shade(c.side, 1.15));
    for (const [a, len] of [[-0.7, 19], [0.72, 18], [0.05, 24]]) leaf(a, len, c.top);
    // face
    const fy = y - 4;
    g.circle(x - 3.6, fy - 1, 1.1).fill(INK);
    g.circle(x + 3.6, fy - 1, 1.1).fill(INK);
    g.moveTo(x - 1.6, fy + 1).quadraticCurveTo(x, fy + 2.6, x + 1.6, fy + 1).stroke({ width: 1, color: INK, cap: 'round' });
    g.ellipse(x - 6.2, fy + 1.2, 1.9, 1.1).fill({ color: PALETTE[7], alpha: 0.6 });
    g.ellipse(x + 6.2, fy + 1.2, 1.9, 1.1).fill({ color: PALETTE[7], alpha: 0.6 });
    g.moveTo(x - 7.5, y - potH + 1).lineTo(x - 7.5, y - 4).stroke({ width: 1.4, color: 0xffffff, alpha: 0.35, cap: 'round' });
  },

  tree(g, c) {
    const sway = Math.sin(c.t * TAU) * 2;
    shadow(g, c.cx + 4, c.cy + 2, 24, 11, 0.16);
    const pink = c.def.id === 'tree_pink';
    const pine = c.def.id === 'tree_pine';
    const palm = c.def.id === 'tree_palm';
    if (pine) {
      trunk(g, c.cx, c.cy + 2, 26, 9, c.side);
      // three gradient tiers, each swaying a little more than the one below
      for (let i = 0; i < 3; i++) {
        const w = 30 - i * 7;
        const yb = c.cy - 18 - i * 17;
        const dx = sway * (0.4 + i * 0.4);
        g.moveTo(c.cx - w + dx * 0.3, yb).lineTo(c.cx + dx, yb - 26).lineTo(c.cx + w + dx * 0.3, yb).closePath()
          .fill(vertical(shade(c.top, 1.25), shade(c.top, 0.7))).stroke({ width: OUTLINE, color: INK });
        g.moveTo(c.cx - w * 0.6 + dx * 0.3, yb - 3).lineTo(c.cx + dx * 0.9, yb - 20).stroke({ width: 2.5, color: 0xffffff, alpha: 0.25 });
        // snow-ish tips
        g.circle(c.cx + dx, yb - 26, 2.5).fill({ color: 0xffffff, alpha: 0.5 });
      }
      return;
    }
    if (palm) {
      // curved trunk
      const top = { x: c.cx + 8 + sway, y: c.cy - 62 };
      g.moveTo(c.cx - 5, c.cy + 2).quadraticCurveTo(c.cx + 8, c.cy - 30, top.x - 3, top.y).lineTo(top.x + 3, top.y)
        .quadraticCurveTo(c.cx + 14, c.cy - 30, c.cx + 5, c.cy + 2).closePath()
        .fill(vertical(shade(c.side, 1.15), shade(c.side, 0.7))).stroke({ width: OUTLINE, color: INK });
      for (let i = 0; i < 6; i++) {
        const y = c.cy - 8 - i * 9;
        const x = c.cx + 1 + i * 1.3;
        g.moveTo(x - 4, y).lineTo(x + 5, y - 2).stroke({ width: 1.5, color: shade(c.side, 0.55), alpha: 0.6 });
      }
      // fronds
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.9 + sway * 0.02;
        const len = 34 + (i % 2) * 6;
        const ex = top.x + Math.cos(a) * len;
        const ey = top.y + Math.sin(a) * len * 0.55 + 10;
        const mx = top.x + Math.cos(a) * len * 0.5;
        const my = top.y + Math.sin(a) * len * 0.5 - 8;
        g.moveTo(top.x, top.y).quadraticCurveTo(mx, my, ex, ey).quadraticCurveTo(mx + 2, my + 9, top.x, top.y + 2).closePath()
          .fill(vertical(shade(c.top, 1.2), shade(c.top, 0.75))).stroke({ width: OUTLINE, color: INK });
        g.moveTo(top.x, top.y).quadraticCurveTo(mx, my + 2, ex, ey).stroke({ width: 1.2, color: shade(c.top, 0.55), alpha: 0.8 });
      }
      // coconuts
      g.circle(top.x - 4, top.y + 6, 4).fill(PALETTE[20]).stroke({ width: 1.5, color: INK });
      g.circle(top.x + 4, top.y + 7, 4).fill(PALETTE[20]).stroke({ width: 1.5, color: INK });
      return;
    }
    trunk(g, c.cx, c.cy + 2, 28, 12, c.side);
    const cy = c.cy - 32;
    foliage(g, c.cx - 14 + sway * 0.6, cy - 1, 15, c.top, 1);
    foliage(g, c.cx + 14 + sway * 0.8, cy - 1, 15, c.top, 2);
    foliage(g, c.cx + sway, cy - 17, 19, c.top, 3);
    foliage(g, c.cx + sway * 0.9, cy - 4, 14, c.top, 4);
    if (pink) {
      // blossom clusters + a few petals drifting down each loop
      for (const [dx, dy] of [[-9, -12], [7, -22], [14, 0], [-16, 2], [2, -5], [-3, -26], [11, -10]]) {
        g.circle(c.cx + dx + sway * 0.8, cy + dy, 2.6).fill(PALETTE[7]);
        g.circle(c.cx + dx + sway * 0.8 - 0.8, cy + dy - 0.8, 1).fill({ color: 0xffffff, alpha: 0.7 });
      }
      for (let i = 0; i < 4; i++) {
        const k = (c.t + i / 4) % 1;
        const px = c.cx - 14 + i * 9 + Math.sin(k * 7 + i) * 6;
        const py = cy - 6 + k * 46;
        g.ellipse(px, py, 2.4, 1.3).fill({ color: PALETTE[7], alpha: 1 - k * 0.7 });
      }
    }
  },

  bush(g, c) {
    const sway = Math.sin(c.t * TAU) * 1;
    shadow(g, c.cx, c.cy + 2, 21, 9, 0.12);
    foliage(g, c.cx - 10, c.cy - 6, 11, c.top, 5);
    foliage(g, c.cx + 10, c.cy - 6, 11, c.top, 6);
    foliage(g, c.cx + sway, c.cy - 12, 13, c.top, 7);
    g.circle(c.cx + 7, c.cy - 4, 2.2).fill(PALETTE[5]).stroke({ width: 1, color: INK });
    g.circle(c.cx - 9, c.cy - 2, 2.2).fill(PALETTE[5]).stroke({ width: 1, color: INK });
    g.circle(c.cx + 2, c.cy - 18, 2).fill(PALETTE[5]).stroke({ width: 1, color: INK });
  },

  hedge(g, c) {
    // clipped hedge block: leafy gradient faces so mazes read as solid green walls
    const T = c.def.tall;
    box(g, 0, 0, c.w, c.h, 0, T, c.top, c.side, false);
    const a = tileToScreen(0, 0);
    const b = tileToScreen(c.w, 0);
    const cc = tileToScreen(c.w, c.h);
    const d = tileToScreen(0, c.h);
    g.moveTo(a.x, a.y - T).lineTo(b.x, b.y - T).lineTo(cc.x, cc.y - T).lineTo(d.x, d.y - T).closePath().fill(radial(shade(c.top, 1.3), shade(c.top, 0.85), 0.4, 0.3));
    g.moveTo(d.x, d.y - T).lineTo(cc.x, cc.y - T).lineTo(cc.x, cc.y).lineTo(d.x, d.y).closePath().fill(vertical(shade(c.side, 1.0), shade(c.side, 0.6)));
    g.moveTo(cc.x, cc.y - T).lineTo(b.x, b.y - T).lineTo(b.x, b.y).lineTo(cc.x, cc.y).closePath().fill(vertical(shade(c.side, 1.15), shade(c.side, 0.7)));
    // leaf speckle
    for (let i = 0; i < 14; i++) {
      const u = (i * 37) % 100 / 100;
      const v = (i * 61) % 100 / 100;
      const face = i % 3;
      let x: number, y: number;
      if (face === 0) {
        const p0 = tileToScreen(u * c.w, v * c.h);
        x = p0.x;
        y = p0.y - T;
      } else if (face === 1) {
        x = d.x + (cc.x - d.x) * u;
        y = d.y + (cc.y - d.y) * u - T * v;
      } else {
        x = cc.x + (b.x - cc.x) * u;
        y = cc.y + (b.y - cc.y) * u - T * v;
      }
      g.ellipse(x, y, 2.6, 1.4).fill({ color: shade(c.top, face === 0 ? 1.45 : 1.2), alpha: 0.55 });
    }
    // bumpy top outline
    g.moveTo(a.x, a.y - T).lineTo(b.x, b.y - T).lineTo(cc.x, cc.y - T).lineTo(d.x, d.y - T).closePath().stroke({ width: OUTLINE, color: INK });
    g.moveTo(d.x, d.y - T).lineTo(d.x, d.y).lineTo(cc.x, cc.y).lineTo(b.x, b.y).lineTo(b.x, b.y - T).stroke({ width: OUTLINE, color: INK });
    g.moveTo(cc.x, cc.y - T).lineTo(cc.x, cc.y).stroke({ width: OUTLINE, color: INK });
  },

  arch(g, c) {
    // two pillars + a vine-covered arch spanning the long side
    const along = c.w >= c.h;
    const [p0, p1] = along ? [tileToScreen(0.3, 0.5), tileToScreen(c.w - 0.3, 0.5)] : [tileToScreen(0.5, 0.3), tileToScreen(0.5, c.h - 0.3)];
    const T = c.def.tall;
    for (const p of [p0, p1]) {
      g.roundRect(p.x - 4, p.y - T + 18, 8, T - 18, 3).fill(vertical(shade(c.top, 1), shade(c.top, 0.75))).stroke({ width: OUTLINE, color: INK });
      g.ellipse(p.x, p.y, 7, 3.5).fill(shade(c.top, 0.8)).stroke({ width: 1.5, color: INK });
    }
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2 - T + 18;
    const span = Math.abs(p1.x - p0.x) / 2 + 4;
    g.moveTo(p0.x - 4, cy).quadraticCurveTo(cx, cy - 34, p1.x + 4, cy).lineTo(p1.x - 4, cy).quadraticCurveTo(cx, cy - 22, p0.x + 4, cy).closePath()
      .fill(vertical(shade(c.top, 1), shade(c.top, 0.8))).stroke({ width: OUTLINE, color: INK });
    // vines + flowers over the arch
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const x = p0.x - 4 + (p1.x + 8 - p0.x) * u;
      const y = cy - 30 * Math.sin(u * Math.PI) + 3;
      g.circle(x, y, 5).fill(radial(shade(c.side, 1.3), shade(c.side, 0.8)));
      if (i % 2) g.circle(x + 2, y - 2, 2).fill(PALETTE[7]);
    }
    void span;
  },

  torch(g, c) {
    const T = c.def.tall;
    g.moveTo(c.cx - 4, c.cy + 2).lineTo(c.cx - 2.5, c.cy - T + 16).lineTo(c.cx + 2.5, c.cy - T + 16).lineTo(c.cx + 4, c.cy + 2).closePath()
      .fill(vertical(shade(c.side, 1.1), shade(c.side, 0.7))).stroke({ width: OUTLINE, color: INK });
    for (let i = 0; i < 3; i++) g.moveTo(c.cx - 3, c.cy - 10 - i * 12).lineTo(c.cx + 3, c.cy - 12 - i * 12).stroke({ width: 1.5, color: shade(c.side, 0.55) });
    // bowl
    g.moveTo(c.cx - 8, c.cy - T + 16).lineTo(c.cx + 8, c.cy - T + 16).lineTo(c.cx + 5, c.cy - T + 24).lineTo(c.cx - 5, c.cy - T + 24).closePath()
      .fill(shade(c.top, 0.8)).stroke({ width: OUTLINE, color: INK });
    if (!c.on) {
      for (let i = 0; i < 2; i++) {
        const k = (c.t + i / 2) % 1;
        g.circle(c.cx + Math.sin(k * 6) * 3, c.cy - T + 10 - k * 18, 2.5 + k * 2).fill({ color: PALETTE[25], alpha: (1 - k) * 0.5 });
      }
      return;
    }
    const fy = c.cy - T + 14;
    glow(g, c.cx, fy, 26 + Math.sin(c.t * TAU) * 2, PALETTE[18], 0.5);
    g.ellipse(c.cx, c.cy + 2, 26, 11).fill({ color: PALETTE[18], alpha: 0.12 });
    for (const [dx, sc, col] of [[0, 1, PALETTE[5]], [-3, 0.7, PALETTE[18]], [3, 0.6, PALETTE[16]]] as const) {
      const w = Math.sin(c.t * TAU + dx) * 2;
      const h = 18 * sc + Math.sin(c.t * TAU * 2 + dx) * 2;
      g.moveTo(c.cx + dx - 5 * sc, fy).quadraticCurveTo(c.cx + dx - 5 * sc + w, fy - h * 0.5, c.cx + dx + w, fy - h)
        .quadraticCurveTo(c.cx + dx + 5 * sc + w, fy - h * 0.5, c.cx + dx + 5 * sc, fy).closePath().fill(col);
    }
  },

  pad(g, c) {
    // glowing floor pad: pulsing ring + icon (star for prizes, crossed swords for duels)
    const duel = c.def.id === 'pad_duel';
    const pulse = 0.5 + 0.5 * Math.sin(c.t * TAU);
    diamond(g, 0, 0, c.w, c.h, shade(c.top, 0.9), 2);
    diamondStroke(g, 0, 0, c.w, c.h, c.side, 2, 2);
    diamondStroke(g, 0, 0, c.w, c.h, 0xffffff, 2 + pulse * 2, 8 + pulse * 6);
    g.ellipse(c.cx, c.cy, 14 + pulse * 6, 7 + pulse * 3).fill({ color: 0xffffff, alpha: 0.18 + pulse * 0.2 });
    if (duel) {
      for (const sgn of [-1, 1]) {
        g.moveTo(c.cx - sgn * 14, c.cy + 8).lineTo(c.cx + sgn * 10, c.cy - 10).stroke({ width: 3.5, color: 0xffffff });
        g.moveTo(c.cx - sgn * 14, c.cy + 8).lineTo(c.cx + sgn * 10, c.cy - 10).stroke({ width: 1.5, color: c.side });
        g.circle(c.cx - sgn * 14, c.cy + 8, 3).fill(c.side).stroke({ width: 1, color: INK });
      }
    } else {
      star(g, c.cx, c.cy - 1 - pulse, 9 + pulse * 2, 0xffffff);
      star(g, c.cx, c.cy - 1 - pulse, 6 + pulse * 1.5, c.side);
      for (let i = 0; i < 3; i++) {
        const k = (c.t + i / 3) % 1;
        const a = i * 2.1 + c.t * TAU;
        g.circle(c.cx + Math.cos(a) * 18, c.cy + Math.sin(a) * 8 - k * 10, 1.8).fill({ color: 0xffffff, alpha: 1 - k });
      }
    }
  },

  glowtile(g, c) {
    // dance floor tile cycling through colours; neighbours desync via their own start frame
    const cols = [PALETTE[7], PALETTE[9], PALETTE[11], PALETTE[13], PALETTE[16], PALETTE[4]];
    const col = cols[c.frame % cols.length];
    diamond(g, 0, 0, c.w, c.h, shade(col, 0.85), 1.5);
    diamond(g, 0, 0, c.w, c.h, col, 7);
    diamondStroke(g, 0, 0, c.w, c.h, 0xffffff, 1.5, 7);
    g.ellipse(c.cx - 6, c.cy - 3, 8, 3).fill({ color: 0xffffff, alpha: 0.35 });
  },

  fountain(g, c) {
    box(g, 0, 0, c.w, c.h, 0, 10, PALETTE[25], PALETTE[26]);
    diamondStroke(g, 0, 0, c.w, c.h, shade(PALETTE[25], 0.8), 1.5, 4, 10);
    const z = 10;
    diamond(g, 0, 0, c.w, c.h, c.side, 18, z);
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      g.ellipse(c.cx, c.cy - z, 8 + k * 34, 4 + k * 17).stroke({ width: 2, color: 0xffffff, alpha: (1 - k) * 0.6 });
    }
    box(g, c.w / 2 - 0.2, c.h / 2 - 0.2, 0.4, 0.4, z + 2, 22, PALETTE[24], PALETTE[25]);
    box(g, c.w / 2 - 0.55, c.h / 2 - 0.55, 1.1, 1.1, z + 24, 6, c.side, PALETTE[25]);
    g.ellipse(c.cx, c.cy - z - 30, 22, 9).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
    const sy = c.cy - z - 34;
    g.moveTo(c.cx, sy).lineTo(c.cx, sy - 22).stroke({ width: 4, color: 0xffffff, alpha: 0.8 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + c.t * TAU;
      const k = (c.t * 3 + i) % 1;
      g.circle(c.cx + Math.cos(a) * (6 + k * 14), sy - 22 + k * 24, 2.2).fill({ color: 0xffffff, alpha: 0.85 });
    }
    g.circle(c.cx, sy - 24, 5).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ width: OUTLINE, color: PALETTE[11] });
  },

  pond(g, c) {
    diamond(g, 0, 0, c.w, c.h, PALETTE[22]);
    diamondStroke(g, 0, 0, c.w, c.h, PALETTE[23], 2);
    diamond(g, 0, 0, c.w, c.h, c.top, 10);
    diamondStroke(g, 0, 0, c.w, c.h, c.side, 2, 10);
    for (let i = 0; i < 2; i++) {
      const k = (c.t + i / 2) % 1;
      g.ellipse(c.cx - 10 + i * 24, c.cy - 4 + i * 8, 4 + k * 14, 2 + k * 6).stroke({ width: 1.5, color: 0xffffff, alpha: (1 - k) * 0.55 });
    }
    const bob = Math.sin(c.t * TAU);
    g.circle(c.cx + 12, c.cy - 8 + bob, 5).fill(PALETTE[15]).stroke({ width: 1, color: INK });
    g.circle(c.cx - 16, c.cy + 8 - bob, 4).fill(PALETTE[15]).stroke({ width: 1, color: INK });
    g.circle(c.cx + 12, c.cy - 9 + bob, 1.8).fill(PALETTE[6]);
  },

  lamp(g, c) {
    // floor lamp: domed base, brass stem, pleated fabric shade that glows from inside, pull chain
    const T = c.def.tall;
    const x = c.cx;
    const base = c.cy;
    const pulse = Math.sin(c.t * TAU);
    if (c.on) g.ellipse(x, base + 2, 30, 14).fill({ color: c.top, alpha: 0.16 });
    shadow(g, x, base + 2, 12, 5, 0.16);
    cylinder(g, x, base, 10, 5, 4, rad(shade(c.side, 1.35), c.side), shade(c.side, 0.8));
    g.ellipse(x, base - 5.5, 4, 2).fill(shade(c.side, 1.2)).stroke({ width: 1, color: INK });
    g.roundRect(x - 2, base - T + 12, 4, T - 17, 2).fill(hgrad(shade(PALETTE[17], 1.2), shade(PALETTE[17], 0.7))).stroke({ width: 1.5, color: INK });
    const ty = base - T + 12;
    const topY = ty - 17;
    if (c.on) glow(g, x, ty - 6, 32 + pulse * 2, c.top, 0.45);
    const body = [{ x: x - 9, y: topY }, { x: x - 15, y: ty }];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      body.push({ x: x + Math.cos(a) * 15, y: ty + Math.sin(a) * 5.5 });
    }
    body.push({ x: x + 9, y: topY });
    const lit = c.on ? grad(shade(c.top, 1.22), shade(c.top, 0.92)) : grad(shade(c.top, 0.78), shade(c.top, 0.56));
    g.poly(body).fill(lit);
    for (let k = -2; k <= 2; k++) {
      const s = k / 2.5;
      g.moveTo(x + k * 3.6, topY + 2.5).lineTo(x + k * 6, ty + (1 - s * s) * 5.5 - 1).stroke({ width: 1, color: shade(c.top, 0.72), alpha: 0.45 });
    }
    g.poly(body).stroke({ width: OUTLINE, color: INK, join: 'round' });
    g.ellipse(x, topY, 9, 3.2).fill(shade(c.top, c.on ? 0.82 : 0.5)).stroke({ width: 1.5, color: INK });
    g.moveTo(x - 11.5, ty - 2).lineTo(x - 7.5, topY + 3).stroke({ width: 1.6, color: 0xffffff, alpha: c.on ? 0.55 : 0.25, cap: 'round' });
    if (c.on) g.ellipse(x, ty + 2.5, 11, 2.6).fill({ color: 0xffffff, alpha: 0.75 });
    g.moveTo(x + 9, ty + 3).lineTo(x + 9, ty + 11 + pulse).stroke({ width: 1, color: PALETTE[17] });
    g.circle(x + 9, ty + 12 + pulse, 1.8).fill(PALETTE[17]).stroke({ width: 1, color: INK });
  },

  lamppost(g, c) {
    // victorian street lamp: plinth, fluted pole with collars, glass lantern with a glowing bulb and finial cap
    const T = c.def.tall;
    const x = c.cx;
    const base = c.cy;
    const flick = 0.85 + 0.15 * Math.sin(c.t * TAU * 2);
    if (c.on) g.ellipse(x, base + 2, 32, 15).fill({ color: c.top, alpha: 0.18 * flick });
    shadow(g, x, base + 2, 11, 5, 0.18);
    cylinder(g, x, base, 9, 4.5, 6, rad(shade(c.side, 1.6), c.side), c.side);
    cylinder(g, x, base - 6, 5.5, 2.7, 5, rad(shade(c.side, 1.6), c.side), shade(c.side, 1.2));
    const ly0 = base - T - 2;
    const ly1 = base - T + 16;
    g.roundRect(x - 2.5, ly1 + 2, 5, base - 11 - ly1 - 2, 2).fill(hgrad(shade(c.side, 1.9), c.side)).stroke({ width: 1.5, color: INK });
    for (const k of [0.35, 0.7]) g.roundRect(x - 4, ly1 + (base - ly1) * k, 8, 3, 1.5).fill(shade(c.side, 1.7)).stroke({ width: 1, color: INK });
    if (c.on) glow(g, x, ly0 + 10, 30 * flick, c.top, 0.55);
    const glass = [{ x: x - 8, y: ly0 + 3 }, { x: x + 8, y: ly0 + 3 }, { x: x + 5.5, y: ly1 }, { x: x - 5.5, y: ly1 }];
    g.poly(glass).fill(c.on ? grad(shade(c.top, 1.2), c.top) : grad(shade(c.top, 0.6), shade(c.top, 0.45)));
    if (c.on) g.ellipse(x, ly0 + 10, 3, 4).fill({ color: 0xffffff, alpha: 0.9 });
    g.moveTo(x - 5, ly0 + 5).lineTo(x - 3.8, ly1 - 2).stroke({ width: 1.3, color: 0xffffff, alpha: 0.5 });
    g.moveTo(x, ly0 + 3).lineTo(x, ly1).stroke({ width: 1, color: INK, alpha: 0.6 });
    g.poly(glass).stroke({ width: 1.5, color: INK, join: 'round' });
    g.roundRect(x - 7, ly1 - 0.5, 14, 3.5, 1.5).fill(c.side).stroke({ width: 1.2, color: INK });
    g.moveTo(x - 11, ly0 + 3.5).lineTo(x, ly0 - 7).lineTo(x + 11, ly0 + 3.5).closePath().fill(grad(shade(c.side, 1.8), c.side)).stroke({ width: 1.5, color: INK, join: 'round' });
    g.circle(x, ly0 - 8.5, 2.2).fill(shade(c.side, 1.8)).stroke({ width: 1, color: INK });
  },

  sign(g, c) {
    // wooden arrow signpost with a painted heart, nails and a grass tuft at its foot
    const T = c.def.tall;
    const x = c.cx;
    const by = c.cy - T;
    shadow(g, x, c.cy + 1, 10, 4, 0.16);
    g.roundRect(x - 2.5, by + 12, 5, T - 11, 2).fill(hgrad(shade(c.side, 1.2), shade(c.side, 0.75))).stroke({ width: 1.5, color: INK });
    const board = [{ x: x - 20, y: by - 2 }, { x: x + 13, y: by - 2 }, { x: x + 22, y: by + 7 }, { x: x + 13, y: by + 16 }, { x: x - 20, y: by + 16 }];
    g.poly(board.map((p) => ({ x: p.x + 1.5, y: p.y + 2.5 }))).fill(shade(c.top, 0.62));
    g.poly(board).fill(grad(shade(c.top, 1.12), shade(c.top, 0.88))).stroke({ width: OUTLINE, color: INK, join: 'round' });
    g.moveTo(x - 19, by + 7).lineTo(x + 20, by + 7).stroke({ width: 1, color: shade(c.top, 0.75) });
    heart(g, x - 13, by + 7, 4, PALETTE[7]);
    heartStroke(g, x - 13, by + 7, 4);
    g.roundRect(x - 6, by + 2, 18, 2.2, 1).fill(c.side);
    g.roundRect(x - 6, by + 10, 12, 2.2, 1).fill(c.side);
    for (const [nx, ny] of [[-17, by + 1], [-17, by + 13], [10, by + 1], [10, by + 13]]) g.circle(x + nx, ny, 0.9).fill(shade(c.top, 0.5));
    for (const [dx, h] of [[-5, 6], [-2, 8], [3, 7], [6, 5]]) g.moveTo(x + dx, c.cy + 1).quadraticCurveTo(x + dx * 1.3, c.cy - h * 0.5, x + dx * 1.6, c.cy - h).stroke({ width: 1.6, color: PALETTE[15], cap: 'round' });
  },

  umbrella(g, c) {
    shadow(g, c.cx + 6, c.cy + 4, 26, 12, 0.12);
    g.rect(c.cx - 1.5, c.cy - c.def.tall + 14, 3, c.def.tall - 16).fill(PALETTE[22]).stroke({ width: 1.5, color: INK });
    const uy = c.cy - c.def.tall + 12;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU;
      const a1 = ((i + 1) / 6) * TAU;
      const am = (a0 + a1) / 2;
      g.moveTo(c.cx, uy - 6)
        .lineTo(c.cx + Math.cos(a0) * 28, uy + Math.sin(a0) * 13)
        .lineTo(c.cx + Math.cos(am) * 30, uy + Math.sin(am) * 14)
        .lineTo(c.cx + Math.cos(a1) * 28, uy + Math.sin(a1) * 13)
        .closePath()
        .fill(i % 2 ? c.top : c.side);
    }
    g.ellipse(c.cx, uy, 28, 13).stroke({ width: OUTLINE, color: INK });
    g.circle(c.cx, uy - 7, 2.5).fill(INK);
  },

  stall(g, c) {
    box(g, 0.1, c.h - 0.8, c.w - 0.2, 0.7, 0, 18, PALETTE[19], PALETTE[20]);
    for (let i = 0; i < 4; i++) {
      const p = tileToScreen(0.3 + i * 0.4, c.h - 0.45);
      g.circle(p.x, p.y - 22, 4).fill([PALETTE[5], PALETTE[17], PALETTE[15], PALETTE[9]][i]).stroke({ width: 1, color: INK });
    }
    for (const [px, py] of [[0.1, 0.1], [c.w - 0.25, 0.1], [0.1, c.h - 0.25], [c.w - 0.25, c.h - 0.25]]) box(g, px, py, 0.15, 0.15, 0, c.def.tall - 10, PALETTE[22], PALETTE[23]);
    const z = c.def.tall - 10;
    const a = tileToScreen(-0.1, -0.1);
    const b = tileToScreen(c.w + 0.1, -0.1);
    const cc = tileToScreen(c.w + 0.1, c.h + 0.1);
    const d = tileToScreen(-0.1, c.h + 0.1);
    g.moveTo(a.x, a.y - z - 8).lineTo(b.x, b.y - z - 8).lineTo(cc.x, cc.y - z).lineTo(d.x, d.y - z).closePath().fill(c.top).stroke({ width: OUTLINE, color: INK });
    for (let i = 0; i < 6; i += 2) {
      const u0 = (i / 6) * (c.w + 0.2) - 0.1;
      const u1 = ((i + 1) / 6) * (c.w + 0.2) - 0.1;
      const q0 = tileToScreen(u0, -0.1);
      const q1 = tileToScreen(u1, -0.1);
      const q2 = tileToScreen(u1, c.h + 0.1);
      const q3 = tileToScreen(u0, c.h + 0.1);
      g.moveTo(q0.x, q0.y - z - 8).lineTo(q1.x, q1.y - z - 8).lineTo(q2.x, q2.y - z).lineTo(q3.x, q3.y - z).closePath().fill(c.side);
    }
    for (let i = 0; i < 8; i++) {
      const u = ((i + 0.5) / 8) * (c.w + 0.2) - 0.1;
      const q = tileToScreen(u, c.h + 0.1);
      g.circle(q.x, q.y - z + 3, 4).fill(i % 2 ? c.top : c.side).stroke({ width: 1, color: INK });
    }
  },

  campfire(g, c) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.ellipse(c.cx + Math.cos(a) * 20, c.cy + Math.sin(a) * 10, 5, 3.5).fill(PALETTE[25]).stroke({ width: 1.5, color: INK });
    }
    g.moveTo(c.cx - 12, c.cy + 2).lineTo(c.cx + 12, c.cy - 6).stroke({ width: 6, color: c.side });
    g.moveTo(c.cx - 12, c.cy - 6).lineTo(c.cx + 12, c.cy + 2).stroke({ width: 6, color: shade(c.side, 0.85) });
    if (!c.on) {
      for (let i = 0; i < 3; i++) {
        const k = (c.t + i / 3) % 1;
        g.circle(c.cx + Math.sin(k * 6) * 4, c.cy - 8 - k * 26, 3 + k * 3).fill({ color: PALETTE[25], alpha: (1 - k) * 0.5 });
      }
      return;
    }
    g.ellipse(c.cx, c.cy + 2, 34, 15).fill({ color: c.top, alpha: 0.12 });
    glow(g, c.cx, c.cy - 6, 34 + Math.sin(c.t * TAU) * 3, c.top, 0.45);
    const tongues = [
      [0, 1, PALETTE[5]],
      [-6, 0.7, PALETTE[18]],
      [7, 0.75, PALETTE[18]],
      [0, 0.5, PALETTE[16]],
    ] as const;
    for (const [dx, sc, col] of tongues) {
      const w = Math.sin(c.t * TAU + dx) * 3;
      const h = 24 * sc + Math.sin(c.t * TAU * 2 + dx) * 3;
      g.moveTo(c.cx + dx - 7 * sc, c.cy - 2)
        .quadraticCurveTo(c.cx + dx - 8 * sc + w, c.cy - h * 0.5, c.cx + dx + w * 1.5, c.cy - 2 - h)
        .quadraticCurveTo(c.cx + dx + 8 * sc + w, c.cy - h * 0.5, c.cx + dx + 7 * sc, c.cy - 2)
        .closePath()
        .fill(col);
    }
    for (let i = 0; i < 4; i++) {
      const k = (c.t + i / 4) % 1;
      g.circle(c.cx + Math.sin(i * 2.3 + k * 4) * 8, c.cy - 20 - k * 22, 1.5).fill({ color: PALETTE[16], alpha: 1 - k });
    }
  },

  tv(g, c) {
    box(g, 0.1, 0.2, c.w - 0.2, c.h - 0.4, 0, 8, PALETTE[26], PALETTE[28]);
    const facing = c.rot % 2 === 0;
    const s = facing ? { x: 0.1, y: 0.25, w: c.w - 0.2, h: 0.18 } : { x: 0.25, y: 0.1, w: 0.18, h: c.h - 0.2 };
    box(g, s.x, s.y, s.w, s.h, 8, c.def.tall - 8, c.top, PALETTE[28]);
    // the picture sits on the face toward the viewer: front-left (x=const) or front-right (y=const)
    const p = facing ? tileToScreen(s.x, s.y + s.h) : tileToScreen(s.x + s.w, s.y);
    const q = tileToScreen(s.x + s.w, s.y + s.h);
    const z0 = 12;
    const z1 = c.def.tall - 2;
    const ax = p.x + 3;
    const bx = q.x - 3;
    const ay = p.y + (facing ? -1.5 : 1.5);
    const by = q.y + (facing ? 1.5 : -1.5);
    const face = (col: number, alpha = 1) =>
      g.moveTo(ax, ay - z0 - 2).lineTo(bx, by - z0 - 2).lineTo(bx, by - z1 + 2).lineTo(ax, ay - z1 + 2).closePath().fill({ color: col, alpha });
    if (!c.on) {
      face(0x1c1c1c);
      g.circle((ax + bx) / 2, (ay + by) / 2 - (z0 + z1) / 2, 2).fill({ color: 0xffffff, alpha: 0.15 });
      return;
    }
    const cols = [PALETTE[10], PALETTE[7], PALETTE[16], PALETTE[13], PALETTE[9], PALETTE[4]];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * u0;
      const x1 = ax + (bx - ax) * u1;
      const y0 = ay + (by - ay) * u0;
      const y1 = ay + (by - ay) * u1;
      g.moveTo(x0, y0 - z0 - 2).lineTo(x1, y1 - z0 - 2).lineTo(x1, y1 - z1 + 2).lineTo(x0, y0 - z1 + 2).closePath().fill(cols[(i + c.frame) % cols.length]);
    }
    face(0xffffff, 0.08);
    glow(g, (ax + bx) / 2, (ay + by) / 2 - (z0 + z1) / 2 + 12, 34, PALETTE[31], 0.25);
  },

  jukebox(g, c) {
    const T = c.def.tall;
    box(g, 0.12, 0.12, 0.76, 0.76, 0, T - 14, c.top, shade(c.top, 0.85));
    g.ellipse(c.cx, c.cy - T + 12, 22, 11).fill(c.top).stroke({ width: OUTLINE, color: INK });
    g.roundRect(c.cx - 22, c.cy - T + 12, 44, 14, 4).fill(c.top);
    g.roundRect(c.cx - 16, c.cy - T + 30, 32, 14, 3).fill(PALETTE[28]).stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 4; i++) g.rect(c.cx - 13, c.cy - T + 33 + i * 3, 26, 1.2).fill({ color: 0xffffff, alpha: 0.35 });
    g.roundRect(c.cx - 14, c.cy - T + 6, 28, 14, 5).fill(PALETTE[24]).stroke({ width: 1.5, color: INK });
    const spin = c.on ? c.t * TAU : 0;
    g.circle(c.cx, c.cy - T + 13, 6).fill(PALETTE[29]);
    g.circle(c.cx, c.cy - T + 13, 2).fill(c.side);
    g.moveTo(c.cx, c.cy - T + 13).lineTo(c.cx + Math.cos(spin) * 6, c.cy - T + 13 + Math.sin(spin) * 6).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    const lights = [PALETTE[7], PALETTE[16], PALETTE[13], PALETTE[10], PALETTE[9]];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      const lx = c.cx + Math.cos(a) * 19;
      const ly = c.cy - T + 12 + Math.sin(a) * 9;
      const lit = c.on && (i + c.frame) % 3 === 0;
      const col = lights[i % lights.length];
      g.circle(lx, ly, 2.2).fill(lit ? col : shade(col, 0.5));
      if (lit) g.circle(lx, ly, 4.5).fill({ color: col, alpha: 0.35 });
    }
    if (c.on) {
      glow(g, c.cx, c.cy - T + 20, 30, c.side, 0.25);
      for (let i = 0; i < 3; i++) {
        const k = (c.t + i / 3) % 1;
        const nx = c.cx + 18 + Math.sin(k * 5 + i) * 6;
        const ny = c.cy - T - 4 - k * 26;
        g.circle(nx, ny, 2.5).fill({ color: INK, alpha: 1 - k });
        g.moveTo(nx + 2.5, ny).lineTo(nx + 2.5, ny - 9).stroke({ width: 1.5, color: INK, alpha: 1 - k });
      }
    }
  },

  arcade(g, c) {
    const T = c.def.tall;
    box(g, 0.15, 0.15, 0.7, 0.7, 0, T - 20, c.side, shade(c.side, 0.85));
    box(g, 0.15, 0.15, 0.7, 0.7, T - 20, 20, c.top, shade(c.top, 0.85));
    g.roundRect(c.cx - 17, c.cy - T + 38, 34, 8, 2).fill(PALETTE[29]).stroke({ width: 1.5, color: INK });
    g.circle(c.cx - 8, c.cy - T + 42, 2.5).fill(PALETTE[5]);
    g.circle(c.cx + 2, c.cy - T + 42, 2.5).fill(PALETTE[16]);
    g.circle(c.cx + 9, c.cy - T + 42, 2.5).fill(PALETTE[13]);
    g.roundRect(c.cx - 15, c.cy - T + 10, 30, 24, 3).fill(0x101018).stroke({ width: 1.5, color: INK });
    if (c.on) {
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < 4; i++) {
          const x = c.cx - 11 + i * 7 + ((c.frame + r) % 2) * 2;
          const y = c.cy - T + 14 + r * 6;
          g.rect(x, y, 4, 3).fill([PALETTE[13], PALETTE[7], PALETTE[16]][r]);
        }
      g.rect(c.cx - 2 + Math.sin(c.t * TAU) * 8, c.cy - T + 30, 4, 2).fill(PALETTE[27]);
      glow(g, c.cx, c.cy - T + 22, 26, PALETTE[31], 0.3);
      g.roundRect(c.cx - 17, c.cy - T - 2, 34, 8, 2).fill({ color: PALETTE[16], alpha: 0.6 + 0.3 * Math.sin(c.t * TAU) });
    } else {
      g.roundRect(c.cx - 17, c.cy - T - 2, 34, 8, 2).fill({ color: PALETTE[16], alpha: 0.25 });
    }
  },

  vending(g, c) {
    const T = c.def.tall;
    box(g, 0.15, 0.15, 0.7, 0.7, 0, T, c.top, shade(c.top, 0.85));
    g.roundRect(c.cx - 14, c.cy - T + 8, 20, 34, 2).fill({ color: PALETTE[31], alpha: 0.85 }).stroke({ width: 1.5, color: INK });
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 3; i++) {
        g.roundRect(c.cx - 12 + i * 6, c.cy - T + 11 + r * 8, 4, 6, 1).fill([PALETTE[5], PALETTE[11], PALETTE[16], PALETTE[13]][(r + i) % 4]);
      }
    g.rect(c.cx + 8, c.cy - T + 10, 6, 30).fill(PALETTE[28]);
    const blink = c.frame % 2 === 0;
    g.circle(c.cx + 11, c.cy - T + 14, 1.8).fill(blink ? PALETTE[13] : shade(PALETTE[13], 0.5));
    g.rect(c.cx - 14, c.cy - T + 46, 20, 6).fill(PALETTE[29]);
  },

  neon(g, c) {
    const along = c.w >= c.h;
    const [p0, p1] = along ? [tileToScreen(0.2, 0.5), tileToScreen(c.w - 0.2, 0.5)] : [tileToScreen(0.5, 0.2), tileToScreen(0.5, c.h - 0.2)];
    const z = c.def.tall;
    for (const p of [p0, p1]) g.rect(p.x - 1.5, p.y - z + 10, 3, z - 10).fill(PALETTE[26]).stroke({ width: 1, color: INK });
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2 - z + 6;
    const pulse = 0.7 + 0.3 * Math.sin(c.t * TAU);
    if (c.on) glow(g, cx, cy, 44, c.top, 0.45 * pulse);
    g.roundRect(cx - 30, cy - 12, 60, 24, 6).fill(0x1c1c1c).stroke({ width: OUTLINE, color: INK });
    if (c.on) g.roundRect(cx - 27, cy - 9, 54, 18, 5).stroke({ width: 2.5, color: c.top, alpha: pulse });
    const tube = c.on ? c.side : shade(c.side, 0.45);
    const heart = c.on ? c.top : shade(c.top, 0.45);
    g.moveTo(cx - 22, cy + 4).quadraticCurveTo(cx - 16, cy - 10, cx - 10, cy + 2).quadraticCurveTo(cx - 4, cy + 10, cx + 2, cy - 4).stroke({ width: 3, color: tube });
    g.circle(cx + 13, cy - 3, 4).fill(heart);
    g.circle(cx + 21, cy - 3, 4).fill(heart);
    g.moveTo(cx + 9, cy - 1).lineTo(cx + 17, cy + 8).lineTo(cx + 25, cy - 1).closePath().fill(heart);
    if (c.on) g.circle(cx + 15, cy - 5, 1.5).fill({ color: 0xffffff, alpha: 0.8 });
  },

  disco(g, c) {
    const T = c.def.tall;
    box(g, 0.35, 0.35, 0.3, 0.3, 0, 5, PALETTE[26], PALETTE[28]);
    const by = c.cy - T + 30;
    if (c.on) {
      for (let i = 0; i < 6; i++) {
        const a = c.t * TAU + (i / 6) * TAU;
        const col = [PALETTE[7], PALETTE[10], PALETTE[16], PALETTE[13], PALETTE[9], PALETTE[4]][i];
        g.ellipse(c.cx + Math.cos(a) * 26, c.cy + Math.sin(a) * 12, 7, 3.5).fill({ color: col, alpha: 0.4 });
        g.moveTo(c.cx, by).lineTo(c.cx + Math.cos(a) * 26, c.cy + Math.sin(a) * 12).stroke({ width: 2, color: col, alpha: 0.18 });
      }
    }
    g.rect(c.cx - 1.5, c.cy - T + 14, 3, T - 16).fill(PALETTE[26]).stroke({ width: 1, color: INK });
    g.moveTo(c.cx - 14, c.cy - T + 14).lineTo(c.cx + 14, c.cy - T + 14).stroke({ width: 3, color: PALETTE[26] });
    g.moveTo(c.cx, c.cy - T + 14).lineTo(c.cx, by - 14).stroke({ width: 1.5, color: PALETTE[26] });
    if (c.on) glow(g, c.cx, by, 24, PALETTE[27], 0.3);
    g.circle(c.cx, by, 13).fill(c.top).stroke({ width: OUTLINE, color: INK });
    const off = c.on ? c.t * 6 : 0;
    for (let r = -2; r <= 2; r++)
      for (let k = 0; k < 6; k++) {
        const ang = ((k + off) / 6) * TAU;
        const px = c.cx + Math.cos(ang) * 10 * Math.cos((r / 5) * Math.PI);
        const py = by + r * 4.5;
        if (Math.sin(ang) > 0) g.rect(px - 1.5, py - 1.5, 3, 3).fill({ color: (k + r) % 2 ? 0xffffff : c.side, alpha: 0.85 });
      }
    g.circle(c.cx - 5, by - 6, 3).fill({ color: 0xffffff, alpha: 0.7 });
    if (c.on) star(g, c.cx + 6 + Math.sin(c.t * TAU) * 2, by - 8, 4, 0xffffff);
  },

  aquarium(g, c) {
    const T = c.def.tall;
    box(g, 0.05, 0.1, c.w - 0.1, c.h - 0.2, 0, 12, c.side, shade(c.side, 0.85));
    const a = tileToScreen(0.1, c.h - 0.15);
    const b = tileToScreen(c.w - 0.1, c.h - 0.15);
    const z0 = 12;
    const z1 = T;
    g.moveTo(a.x, a.y - z0).lineTo(b.x, b.y - z0).lineTo(b.x, b.y - z1).lineTo(a.x, a.y - z1).closePath().fill({ color: c.top, alpha: 0.9 });
    for (let i = 0; i < 9; i++) {
      const p = tileToScreen(0.12 + i * 0.1, c.h - 0.15);
      g.circle(p.x + ((i * 7) % 5), p.y - z0 - 3, 2).fill([PALETTE[22], PALETTE[23], PALETTE[25]][i % 3]);
    }
    for (const u of [0.25, 0.75, 1.5]) {
      const p = tileToScreen(u, c.h - 0.15);
      const sway = Math.sin(c.t * TAU + u * 4) * 2;
      g.moveTo(p.x, p.y - z0 - 4).quadraticCurveTo(p.x + sway, p.y - z0 - 12, p.x + sway * 1.5, p.y - z0 - 20).stroke({ width: 2.5, color: PALETTE[15] });
    }
    const fish = [
      [0, PALETTE[4], 0.25],
      [0.4, PALETTE[16], 0.55],
      [0.7, PALETTE[7], 0.4],
    ] as const;
    for (const [ph, col, depth] of fish) {
      const k = (c.t + ph) % 1;
      const dir = k < 0.5 ? 1 : -1;
      const u = k < 0.5 ? k * 2 : (1 - k) * 2;
      const p0 = tileToScreen(0.2 + u * (c.w - 0.5), c.h - 0.15);
      const fy = p0.y - z0 - 8 - depth * (z1 - z0 - 12) + Math.sin(k * TAU * 2) * 2;
      g.ellipse(p0.x, fy, 5, 3).fill(col);
      g.moveTo(p0.x - dir * 4, fy).lineTo(p0.x - dir * 8, fy - 3).lineTo(p0.x - dir * 8, fy + 3).closePath().fill(col);
      g.circle(p0.x + dir * 2.5, fy - 0.5, 0.8).fill(INK);
    }
    for (let i = 0; i < 4; i++) {
      const k = (c.t * 1.5 + i / 4) % 1;
      const p = tileToScreen(c.w - 0.35, c.h - 0.15);
      g.circle(p.x + Math.sin(k * 8) * 2, p.y - z0 - 4 - k * (z1 - z0 - 8), 1.5).stroke({ width: 1, color: 0xffffff, alpha: 1 - k });
    }
    g.moveTo(a.x, a.y - z0).lineTo(b.x, b.y - z0).lineTo(b.x, b.y - z1).lineTo(a.x, a.y - z1).closePath().stroke({ width: OUTLINE, color: INK });
    box(g, 0.05, 0.1, c.w - 0.1, c.h - 0.2, T, 4, PALETTE[28], PALETTE[29]);
    g.moveTo(a.x + 3, a.y - z1 + 4).lineTo(a.x + 3, a.y - z0 - 4).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
  },

  hottub(g, c) {
    box(g, 0, 0, c.w, c.h, 0, 16, PALETTE[19], PALETTE[21]);
    const z = 16;
    diamondStroke(g, 0, 0, c.w, c.h, shade(PALETTE[19], 0.75), 1.5, 4, z);
    diamond(g, 0, 0, c.w, c.h, c.side, 9, z);
    const p = tileToScreen(c.w / 2, c.h / 2);
    for (let i = 0; i < 2; i++) {
      const k = (c.t + i / 2) % 1;
      g.ellipse(p.x, p.y - z, 6 + k * 26, 3 + k * 13).stroke({ width: 1.5, color: 0xffffff, alpha: (1 - k) * 0.5 });
    }
    for (let i = 0; i < 7; i++) {
      const k = (c.t * 2 + i / 7) % 1;
      const bx = p.x + Math.cos(i * 1.9) * 18;
      const by = p.y - z + Math.sin(i * 1.9) * 8;
      g.circle(bx, by, 1.2 + k * 1.5).fill({ color: 0xffffff, alpha: 0.6 * (1 - k) });
    }
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      g.circle(p.x - 10 + i * 10 + Math.sin(k * 5) * 4, p.y - z - 6 - k * 22, 4 + k * 3).fill({ color: 0xffffff, alpha: (1 - k) * 0.35 });
    }
  },

  // ---- love meter set

  loveseat(g, c) {
    // backrest sits opposite the facing: rot0 -y edge, rot1 +x, rot2 +y, rot3 -x
    const r = c.rot % 4;
    const back = () => {
      const t = 0.26;
      const [bx, by, bw, bh] = r === 0 ? [0, 0, c.w, t] : r === 1 ? [c.w - t, 0, t, c.h] : r === 2 ? [0, c.h - t, c.w, t] : [0, 0, t, c.h];
      box(g, bx, by, bw, bh, 0, c.def.tall, shade(c.top, 1.06), c.side);
      // heart crest over the middle of the backrest
      const m = tileToScreen(bx + bw / 2, by + bh / 2);
      heart(g, m.x, m.y - c.def.tall - 6, 11, c.top);
      heartStroke(g, m.x, m.y - c.def.tall - 6, 11);
    };
    shadow(g, c.cx, c.cy + 2, 40, 16);
    const behind = r === 0 || r === 3;
    if (behind) back();
    box(g, 0.05, 0.05, c.w - 0.1, c.h - 0.1, 0, 14, c.top, c.side);
    diamondStroke(g, 0.05, 0.05, c.w - 0.1, c.h - 0.1, shade(c.top, 0.8), 1.5, 8, 14);
    for (const k of [0.25, 0.75]) {
      const p = r % 2 === 0 ? tileToScreen(c.w * k, c.h / 2) : tileToScreen(c.w / 2, c.h * k);
      g.circle(p.x, p.y - 14, 2).fill({ color: 0xffffff, alpha: 0.5 });
    }
    if (!behind) back();
    const k = c.t;
    heart(g, c.cx + Math.sin(k * TAU) * 6, c.cy - c.def.tall - 22 - k * 18, 4 + k * 2, PALETTE[7], 1 - k);
  },

  love_meter(g, c) {
    const T = c.def.tall;
    const base = c.cy - 18;
    shadow(g, c.cx, c.cy + 4, 50, 18, 0.18);
    box(g, 0.1, 0.1, c.w - 0.2, c.h - 0.2, 0, 18, PALETTE[28], PALETTE[29]);
    // tower
    g.roundRect(c.cx - 20, base - T + 60, 40, T - 60, 8).fill(shade(PALETTE[28], 1.2)).stroke({ width: OUTLINE, color: INK });
    // thermometer tube with liquid bobbing
    const tubeTop = base - T + 64;
    const tubeH = T - 72;
    g.roundRect(c.cx - 8, tubeTop, 16, tubeH, 8).fill(PALETTE[1]).stroke({ width: 1.5, color: INK });
    const level = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(c.t * TAU));
    g.roundRect(c.cx - 5, tubeTop + tubeH * (1 - level), 10, tubeH * level - 3, 5).fill(c.top);
    for (let i = 1; i < 10; i++) g.rect(c.cx + 9, tubeTop + (tubeH * i) / 10, i % 5 ? 4 : 7, 1.5).fill(PALETTE[24]);
    // side bulbs chase upward
    for (let i = 0; i < 6; i++) {
      const lit = (c.frame + i * 2) % 12 < 4;
      const y = base - 8 - i * ((T - 70) / 6);
      for (const sx of [-16, 16]) {
        g.circle(c.cx + sx, y, 2.6).fill(lit ? PALETTE[16] : shade(PALETTE[16], 0.45));
        if (lit) g.circle(c.cx + sx, y, 5).fill({ color: PALETTE[16], alpha: 0.3 });
      }
    }
    // big heart gauge on top, filling and pulsing
    const hy = base - T + 34;
    const beat = 1 + 0.06 * Math.max(0, Math.sin(c.t * TAU * 2));
    const R = 34 * beat;
    glow(g, c.cx, hy, 60, c.top, 0.35);
    heart(g, c.cx, hy, R + 4, INK);
    heart(g, c.cx, hy, R, PALETTE[1]);
    heart(g, c.cx, hy + R * 0.28, R * 0.72, c.top, 0.9);
    heart(g, c.cx - R * 0.35, hy - R * 0.35, R * 0.18, 0xffffff, 0.6);
    // marquee dots round the heart
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const lit = (i + c.frame) % 3 === 0;
      g.circle(c.cx + Math.cos(a) * (R + 14), hy + Math.sin(a) * (R + 10), 2).fill(lit ? PALETTE[30] : shade(PALETTE[30], 0.5));
    }
    // "%" plate
    g.roundRect(c.cx - 22, base - 2, 44, 14, 4).fill(PALETTE[29]).stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 3; i++) g.rect(c.cx - 14 + i * 10, base + 2, 7, 6).fill(i === (c.frame >> 2) % 3 ? PALETTE[7] : shade(PALETTE[7], 0.4));
  },

  pulley(g, c) {
    const T = c.def.tall;
    const topY = c.cy - T + 16;
    shadow(g, c.cx, c.cy + 2, 26, 11);
    box(g, 0.15, 0.2, 0.7, 0.6, 0, 8, PALETTE[26], PALETTE[28]);
    // A-frame
    g.moveTo(c.cx - 20, c.cy - 4).lineTo(c.cx - 3, topY).stroke({ width: 5, color: INK });
    g.moveTo(c.cx + 20, c.cy - 4).lineTo(c.cx + 3, topY).stroke({ width: 5, color: INK });
    g.moveTo(c.cx - 20, c.cy - 4).lineTo(c.cx - 3, topY).stroke({ width: 3, color: c.top });
    g.moveTo(c.cx + 20, c.cy - 4).lineTo(c.cx + 3, topY).stroke({ width: 3, color: c.top });
    // rope loop between the big wheel and the floor drum, gondolas ride it
    const drumY = c.cy - 14;
    const W = 16;
    g.moveTo(c.cx - W, topY).lineTo(c.cx - 7, drumY).stroke({ width: 1.5, color: PALETTE[19] });
    g.moveTo(c.cx + W, topY).lineTo(c.cx + 7, drumY).stroke({ width: 1.5, color: PALETTE[19] });
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      // down the right side, up the left: the queue "pulls" forward
      const right = k < 0.5;
      const u = right ? k * 2 : (k - 0.5) * 2;
      const x = right ? c.cx + W + (7 - W) * u : c.cx - 7 + (7 - W) * u;
      const y = right ? topY + (drumY - topY) * u : drumY + (topY - drumY) * u;
      heart(g, x, y + 5, 5, right ? c.side : PALETTE[6]);
      heartStroke(g, x, y + 5, 5);
    }
    // wheel
    const spin = c.t * TAU;
    g.circle(c.cx, topY, W + 3).fill(PALETTE[24]).stroke({ width: OUTLINE, color: INK });
    g.circle(c.cx, topY, W - 3).stroke({ width: 2, color: PALETTE[26] });
    for (let i = 0; i < 5; i++) {
      const a = spin + (i / 5) * TAU;
      g.moveTo(c.cx, topY).lineTo(c.cx + Math.cos(a) * (W - 3), topY + Math.sin(a) * (W - 3)).stroke({ width: 2, color: PALETTE[26] });
    }
    heart(g, c.cx, topY, 6, c.side);
    // drum + crank gear
    g.circle(c.cx, drumY, 8).fill(PALETTE[17]).stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 6; i++) {
      const a = -spin * 2 + (i / 6) * TAU;
      g.circle(c.cx + Math.cos(a) * 8, drumY + Math.sin(a) * 8, 2).fill(PALETTE[19]);
    }
    g.circle(c.cx, drumY, 2.5).fill(INK);
  },

  conveyor(g, c) {
    diamond(g, 0, 0, c.w, c.h, c.top, 1.5);
    diamondStroke(g, 0, 0, c.w, c.h, INK, 1.5, 1.5);
    // travel param u (0 back -> 1 front), v across; front edge depends on rotation
    const r = c.rot % 4;
    const at = (u: number, v: number) =>
      r === 0 ? tileToScreen(v, 1 - u) : r === 1 ? tileToScreen(u, v) : r === 2 ? tileToScreen(1 - v, u) : tileToScreen(1 - u, 1 - v);
    for (const v of [0.1, 0.9]) {
      const a = at(0.02, v);
      const b = at(0.98, v);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5, color: c.side });
    }
    for (let i = 0; i < 3; i++) {
      const u = (i + c.t) / 3 + 0.12;
      if (u > 0.95) continue;
      const tip = at(u, 0.5);
      const l = at(u - 0.2, 0.22);
      const rr = at(u - 0.2, 0.78);
      g.moveTo(l.x, l.y).lineTo(tip.x, tip.y).lineTo(rr.x, rr.y).stroke({ width: 3, color: PALETTE[7], alpha: 0.35 + 0.6 * u });
    }
  },

  rope_post(g, c) {
    const P = tileToScreen(0.5, 0.5);
    const T = c.def.tall;
    const along = c.rot % 2 === 0; // rope runs along y at rot 0/2
    const a = along ? tileToScreen(0.5, 0) : tileToScreen(0, 0.5);
    const b = along ? tileToScreen(0.5, 1) : tileToScreen(1, 0.5);
    const swag = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2 - T + 14;
      g.moveTo(from.x, from.y - T + 6).quadraticCurveTo(mx, my + 8, to.x, to.y - T + 6).stroke({ width: 4, color: INK });
      g.moveTo(from.x, from.y - T + 6).quadraticCurveTo(mx, my + 8, to.x, to.y - T + 6).stroke({ width: 2.5, color: c.side });
    };
    swag(a, P);
    g.ellipse(P.x, P.y, 9, 4.5).fill(shade(c.top, 0.8)).stroke({ width: 1.5, color: INK });
    g.rect(P.x - 2.5, P.y - T + 4, 5, T - 4).fill(c.top).stroke({ width: 1.2, color: INK });
    g.rect(P.x - 1, P.y - T + 6, 1.5, T - 8).fill({ color: 0xffffff, alpha: 0.5 });
    g.circle(P.x, P.y - T + 3, 4.5).fill(c.top).stroke({ width: 1.5, color: INK });
    swag(P, b);
  },

  candle(g, c) {
    shadow(g, c.cx, c.cy, 16, 7);
    g.ellipse(c.cx, c.cy - 2, 16, 8).fill(PALETTE[22]).stroke({ width: 1.5, color: INK });
    const sticks = [
      [-7, 2, 16],
      [6, 0, 22],
      [0, 5, 12],
    ];
    for (const [dx, dy, hgt] of sticks) {
      const x = c.cx + dx;
      const y = c.cy + dy - 3;
      g.rect(x - 3, y - hgt, 6, hgt).fill(c.top).stroke({ width: 1.2, color: INK });
      g.ellipse(x, y - hgt, 3, 1.5).fill(shade(c.top, 0.9));
      if (c.on) {
        const f = 1 + 0.25 * Math.sin((c.t + dx * 0.05) * TAU);
        glow(g, x, y - hgt - 5, 10 * f, c.side, 0.45);
        g.ellipse(x, y - hgt - 5, 2.4, 4.5 * f).fill(c.side);
        g.ellipse(x, y - hgt - 4, 1.2, 2.2).fill(0xffffff);
      }
    }
  },

  balloons(g, c) {
    const T = c.def.tall;
    shadow(g, c.cx, c.cy, 12, 5);
    g.roundRect(c.cx - 5, c.cy - 8, 10, 8, 2).fill(PALETTE[17]).stroke({ width: 1.2, color: INK });
    const cols = [c.top, c.side, PALETTE[1]];
    for (let i = 0; i < 3; i++) {
      const bob = Math.sin((c.t + i / 3) * TAU) * 3;
      const bx = c.cx + (i - 1) * 13;
      const by = c.cy - T + 16 + (i === 1 ? -10 : 0) + bob;
      g.moveTo(c.cx, c.cy - 8).quadraticCurveTo(bx + 4, (by + c.cy) / 2, bx, by + 12).stroke({ width: 1, color: INK, alpha: 0.7 });
      heart(g, bx, by, 12, INK);
      heart(g, bx, by, 10, cols[i]);
      g.ellipse(bx - 4, by - 4, 2, 3).fill({ color: 0xffffff, alpha: 0.6 });
    }
  },

  rose_bush(g, c) {
    shadow(g, c.cx, c.cy + 2, 22, 9);
    const blobs = [
      [-9, -10, 12],
      [9, -10, 12],
      [0, -18, 13],
      [0, -6, 13],
    ];
    for (const [dx, dy, r] of blobs) g.circle(c.cx + dx, c.cy + dy, r + 2).fill(INK);
    for (const [dx, dy, r] of blobs) g.circle(c.cx + dx, c.cy + dy, r).fill(c.top);
    g.circle(c.cx - 5, c.cy - 20, 5).fill({ color: 0xffffff, alpha: 0.15 });
    const roses = [
      [-10, -12],
      [8, -16],
      [0, -4],
      [2, -24],
      [11, -5],
    ];
    for (const [dx, dy] of roses) {
      g.circle(c.cx + dx, c.cy + dy, 3.6).fill(c.side).stroke({ width: 1, color: INK });
      g.circle(c.cx + dx, c.cy + dy, 1.4).fill(shade(c.side, 0.7));
    }
  },

  love_carpet(g, c) {
    diamond(g, 0, 0, c.w, c.h, c.top, 1);
    diamondStroke(g, 0, 0, c.w, c.h, shade(c.top, 0.9), 1.5, 5);
    heart(g, c.cx, c.cy, 6, c.side, 0.55);
  },

  lane_sign(g, c) {
    const T = c.def.tall;
    shadow(g, c.cx, c.cy, 14, 6);
    g.rect(c.cx - 2, c.cy - T + 20, 4, T - 20).fill(PALETTE[26]).stroke({ width: 1.2, color: INK });
    g.roundRect(c.cx - 20, c.cy - T - 4, 40, 30, 7).fill(PALETTE[1]).stroke({ width: OUTLINE, color: INK });
    g.roundRect(c.cx - 16, c.cy - T, 32, 22, 5).fill(c.side);
    heart(g, c.cx, c.cy - T + 10, 8, c.top);
    heartStroke(g, c.cx, c.cy - T + 10, 8);
    // little "join here" arrow below the board
    g.moveTo(c.cx - 6, c.cy - T + 32).lineTo(c.cx + 6, c.cy - T + 32).lineTo(c.cx, c.cy - T + 40).closePath().fill(c.top).stroke({ width: 1, color: INK });
  },
};

/**
 * Armchair and sofa: stubby feet, a plump body, one seat cushion per place, rolled arms and a tufted
 * backrest opposite the facing. The backrest is drawn before the seat when it is the far edge, after when near.
 */
function upholstered(g: Graphics, c: ArtCtx, seats: number) {
  const T = c.def.tall;
  const r = c.rot % 4;
  const { w, h } = c;
  const feet = PALETTE[21];
  floorShadow(g, 0.04, 0.04, w - 0.08, h - 0.08);
  for (const u of [0.1, w - 0.22]) for (const v of [0.1, h - 0.22]) box(g, u, v, 0.12, 0.12, 0, 4, shade(feet, 1.25), feet);
  box(g, 0.05, 0.05, w - 0.1, h - 0.1, 3, 9, shade(c.top, 0.9), c.side);
  const back = backRect(r, w, h, 0.24);
  const arms = armRects(r, w, h, 0.2);
  let [x0, y0, x1, y1] = [0.05, 0.05, w - 0.05, h - 0.05];
  if (r % 2 === 0) {
    x0 += 0.2;
    x1 -= 0.2;
  } else {
    y0 += 0.2;
    y1 -= 0.2;
  }
  if (r === 0) y0 += 0.24;
  else if (r === 1) x1 -= 0.24;
  else if (r === 2) y1 -= 0.24;
  else x0 += 0.24;
  const drawBack = () => {
    const [bx, by, bw, bh] = back;
    cushion(g, bx, by, bw, bh, 12, T - 10, c.top, false);
    for (let i = 0; i < seats; i++) {
      const k = (i + 0.5) / seats;
      const p = r % 2 === 0 ? tileToScreen(bx + bw * k, by + bh / 2) : tileToScreen(bx + bw / 2, by + bh * k);
      g.circle(p.x, p.y - T - 2, 1.4).fill(shade(c.top, 0.62));
      g.circle(p.x - 0.5, p.y - T - 2.6, 0.6).fill({ color: 0xffffff, alpha: 0.6 });
    }
  };
  const near = r === 1 || r === 2;
  if (!near) drawBack();
  const gap = 0.03;
  for (let i = 0; i < seats; i++) {
    if (r % 2 === 0) {
      const sw = (x1 - x0 - gap * (seats - 1)) / seats;
      cushion(g, x0 + i * (sw + gap), y0, sw, y1 - y0, 12, 5, shade(c.top, 1.04));
    } else {
      const sh = (y1 - y0 - gap * (seats - 1)) / seats;
      cushion(g, x0, y0 + i * (sh + gap), x1 - x0, sh, 12, 5, shade(c.top, 1.04));
    }
  }
  if (seats > 1) {
    const pillow: [number, number, number, number] =
      r === 0 ? [x0 + 0.05, y0, 0.34, 0.12] : r === 1 ? [x1 - 0.12, y0 + 0.05, 0.12, 0.34] : r === 2 ? [x0 + 0.05, y1 - 0.12, 0.34, 0.12] : [x0, y0 + 0.05, 0.12, 0.34];
    cushion(g, ...pillow, 16, 9, PALETTE[1], false);
    const p = tileToScreen(pillow[0] + pillow[2] / 2, pillow[1] + pillow[3] / 2);
    heart(g, p.x, p.y - 25.5, 2.2, c.side);
  }
  for (const a of arms) {
    box(g, ...a, 12, 6, shade(c.top, 1.02), c.side);
    roll(g, a, 20, c.top, 6);
  }
  if (near) drawBack();
}

/** padded roll lying along the long axis of a strip, its underside resting at `z` */
function roll(g: Graphics, [x, y, w, h]: [number, number, number, number], z: number, col: number, thick: number) {
  const along = w >= h;
  const a = along ? tileToScreen(x + 0.06, y + h / 2) : tileToScreen(x + w / 2, y + 0.06);
  const b = along ? tileToScreen(x + w - 0.06, y + h / 2) : tileToScreen(x + w / 2, y + h - 0.06);
  const k = z + thick / 2 - 1;
  g.moveTo(a.x, a.y - k).lineTo(b.x, b.y - k).stroke({ width: thick + 3, color: INK, cap: 'round' });
  g.moveTo(a.x, a.y - k).lineTo(b.x, b.y - k).stroke({ width: thick, color: shade(col, 1.06), cap: 'round' });
  g.moveTo(a.x, a.y - k + thick * 0.28).lineTo(b.x, b.y - k + thick * 0.28).stroke({ width: thick * 0.35, color: shade(col, 0.8), cap: 'round', alpha: 0.7 });
  g.moveTo(a.x, a.y - k - thick * 0.22).lineTo(b.x, b.y - k - thick * 0.22).stroke({ width: 1.4, color: 0xffffff, alpha: 0.5, cap: 'round' });
}

function heartPath(g: Graphics, cx: number, cy: number, r: number) {
  g.moveTo(cx, cy + r * 0.95)
    .bezierCurveTo(cx - r * 1.35, cy + r * 0.1, cx - r * 0.95, cy - r * 1.05, cx, cy - r * 0.35)
    .bezierCurveTo(cx + r * 0.95, cy - r * 1.05, cx + r * 1.35, cy + r * 0.1, cx, cy + r * 0.95)
    .closePath();
}

export function heart(g: Graphics, cx: number, cy: number, r: number, colour: number, alpha = 1) {
  heartPath(g, cx, cy, r);
  g.fill({ color: colour, alpha });
}

function heartStroke(g: Graphics, cx: number, cy: number, r: number) {
  heartPath(g, cx, cy, r);
  g.stroke({ width: 1.5, color: INK });
}

export function paintFurniture(g: Graphics, def: FurnitureDef, rot: number, frame: number, on: boolean, state = '') {
  const { w, h } = footprint(def, rot);
  const centre = tileToScreen(w / 2, h / 2);
  const ctx: ArtCtx = {
    def,
    rot,
    frame,
    t: def.anim > 1 ? frame / def.anim : 0,
    on,
    state,
    w,
    h,
    top: PALETTE[def.colours[0]],
    side: PALETTE[def.colours[1]],
    cx: centre.x,
    cy: centre.y,
  };
  (PAINTERS[def.kind] ?? LAB_PAINTERS[def.kind] ?? BEACH_PAINTERS[def.kind] ?? DREAM_PAINTERS[def.kind] ?? PARK_PAINTERS[def.kind] ?? DEN_PAINTERS[def.kind] ?? CASINO_PAINTERS[def.kind] ?? PAINTERS.block)(g, ctx);
}

/** Pixel bounds of an item's art relative to its tile origin (used to size atlas frames). */
export function artBounds(def: FurnitureDef, rot: number) {
  const { w, h } = footprint(def, rot);
  const pad = 44; // glows, canopies and floating notes spill past the footprint
  const left = tileToScreen(0, h).x - pad;
  const right = tileToScreen(w, 0).x + pad;
  const top = -def.tall - pad - 30;
  const bottom = tileToScreen(w, h).y + pad / 2;
  return { x: left, y: top, w: right - left, h: bottom - top };
}
