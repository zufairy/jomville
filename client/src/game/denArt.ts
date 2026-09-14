import { Graphics } from 'pixi.js';
import { PALETTE, TILE_W, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { box, shade } from './furnitureArt';
import { cylinder, glow, grad, hgrad, rad, shadow } from './parkArt';

/**
 * Game Den furniture: arcade-night neon, dark lacquer and felt. Same painter
 * contract as the other art files. Game tables light up (`on`) while a match
 * is being played at them.
 */

type Painter = (g: Graphics, c: ArtCtx) => void;
type Pt = { x: number; y: number };

const TAU = Math.PI * 2;
const INK = PALETTE[0];
const WHITE = 0xffffff;
const NAVY = 0x1b1838;
const CYAN = 0x5ef2ff;
const PINK = 0xff5fa2;
const GOLD = 0xf2b632;
const RGB = [0xff5f7e, 0xffd23f, 0x7cf29a, 0x5ef2ff, 0xc49bff, 0xff9a5c];

const lift = (tx: number, ty: number, z: number): Pt => {
  const p = tileToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
};

function diamond(g: Graphics, tx: number, ty: number, w: number, h: number, inset = 0, z = 0) {
  const i = inset / TILE_W;
  return g.poly([lift(tx + i, ty + i, z), lift(tx + w - i, ty + i, z), lift(tx + w - i, ty + h - i, z), lift(tx + i, ty + h - i, z)]);
}

function wallMap(c: ArtCtx, z0: number, z1: number) {
  const onX = c.rot % 2 === 0;
  const a = tileToScreen(0, 0);
  const b = onX ? tileToScreen(c.w, 0) : tileToScreen(0, c.h);
  return (u: number, v: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - (z0 + (z1 - z0) * v) });
}

/** neon tube glyphs, unit box, y down */
const TUBES: Record<string, number[][][]> = {
  G: [[[1, 0.15], [0.8, 0], [0.2, 0], [0, 0.2], [0, 0.8], [0.2, 1], [0.8, 1], [1, 0.8], [1, 0.55], [0.55, 0.55]]],
  A: [[[0, 1], [0.5, 0], [1, 1]], [[0.22, 0.6], [0.78, 0.6]]],
  M: [[[0, 1], [0, 0], [0.5, 0.55], [1, 0], [1, 1]]],
  E: [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.75, 0.5]]],
  O: [[[0.2, 0], [0.8, 0], [1, 0.2], [1, 0.8], [0.8, 1], [0.2, 1], [0, 0.8], [0, 0.2], [0.2, 0]]],
  N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
};

export const DEN_PAINTERS: Record<string, Painter> = {
  game_table(g, c) {
    const T = c.def.tall;
    const m = lift(0.5, 0.5, 0);
    const live = c.on;
    const pulse = 0.6 + 0.4 * Math.sin(c.t * TAU);
    shadow(g, m.x, m.y + 2, 26, 12, 0.25);
    if (live) g.ellipse(m.x, m.y, 40, 20).fill({ color: c.top, alpha: 0.18 * pulse });
    cylinder(g, m.x, m.y, 10, 5, 4, 0x2a2548, 0x2a2548);
    g.rect(m.x - 3, m.y - T + 8, 6, T - 10).fill(hgrad(0x4a4378, 0x221d44));
    // tabletop: dark lacquer rim, felt inlay, neon edge strip
    box(g, 0.06, 0.06, 0.88, 0.88, T - 8, 7, NAVY, 0x2d2760);
    const strip = [lift(0.06, 0.94, T - 4), lift(0.94, 0.94, T - 4), lift(0.94, 0.06, T - 4)];
    g.poly(strip, false).stroke({ width: 2.2, color: live ? c.top : shade(c.top, 0.45), alpha: live ? pulse : 0.9 });
    if (live) g.poly(strip, false).stroke({ width: 6, color: c.top, alpha: 0.25 * pulse });
    diamond(g, 0.06, 0.06, 0.88, 0.88, 5, T - 1).fill(c.side === PALETTE[0] ? 0x2d2d33 : grad(shade(c.side, 1.1), shade(c.side, 0.85)));
    const top = (u: number, v: number, z = 0) => lift(0.18 + u * 0.64, 0.18 + v * 0.64, T - 1 + z);
    const id = c.def.id;
    if (id === 'gt_c4') {
      // an upright blue rack with a few discs in it
      const a = top(0.1, 0.5, 0);
      const b = top(0.9, 0.5, 0);
      const h = 22;
      g.poly([a, b, { x: b.x, y: b.y - h }, { x: a.x, y: a.y - h }]).fill(grad(0x3a78ff, 0x2552d6)).stroke({ width: 1.2, color: INK });
      for (let col = 0; col < 5; col++)
        for (let row = 0; row < 3; row++) {
          const k = (col + 0.5) / 5;
          const x = a.x + (b.x - a.x) * k;
          const y = a.y + (b.y - a.y) * k - 5 - row * 6.5;
          const v = (col * 3 + row * 5 + (live ? c.frame : 0)) % 5;
          g.circle(x, y, 2.4).fill(v === 0 ? 0xff4d5e : v === 1 ? 0xffd23f : 0x13306f);
        }
    } else if (id === 'gt_ttt') {
      for (const k of [1 / 3, 2 / 3]) {
        const p0 = top(k, 0);
        const p1 = top(k, 1);
        const q0 = top(0, k);
        const q1 = top(1, k);
        g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).moveTo(q0.x, q0.y).lineTo(q1.x, q1.y).stroke({ width: 1.8, color: WHITE, alpha: 0.9 });
      }
      const x = top(1 / 6, 1 / 6);
      g.moveTo(x.x - 4, x.y - 2).lineTo(x.x + 4, x.y + 2).moveTo(x.x + 4, x.y - 2).lineTo(x.x - 4, x.y + 2).stroke({ width: 2, color: PINK });
      const o = top(0.5, 0.5);
      g.ellipse(o.x, o.y, 4.5, 2.4).stroke({ width: 2, color: 0x26b5ff });
      if (live) {
        const x2 = top(5 / 6, 5 / 6);
        g.moveTo(x2.x - 4, x2.y - 2).lineTo(x2.x + 4, x2.y + 2).moveTo(x2.x + 4, x2.y - 2).lineTo(x2.x - 4, x2.y + 2).stroke({ width: 2, color: PINK, alpha: pulse });
      }
    } else if (id === 'gt_reversi') {
      for (let i = 1; i < 4; i++) {
        const p0 = top(i / 4, 0);
        const p1 = top(i / 4, 1);
        const q0 = top(0, i / 4);
        const q1 = top(1, i / 4);
        g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).moveTo(q0.x, q0.y).lineTo(q1.x, q1.y).stroke({ width: 1, color: 0x0c3a21, alpha: 0.7 });
      }
      const discs: Array<[number, number, number]> = [
        [1, 1, 0],
        [2, 2, 0],
        [1, 2, 1],
        [2, 1, live && c.frame % 4 < 2 ? 0 : 1],
      ];
      for (const [cx, cy, s] of discs) {
        const p = top((cx + 0.5) / 4, (cy + 0.5) / 4, 1.5);
        g.ellipse(p.x, p.y, 4.5, 2.5).fill(s === 0 ? 0x16161a : WHITE).stroke({ width: 0.8, color: INK, alpha: 0.6 });
      }
    } else {
      // dots & boxes on paper
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          const p = top(i / 3, j / 3);
          g.circle(p.x, p.y, 1.2).fill(INK);
        }
      const a = top(0, 0);
      const b = top(1 / 3, 0);
      const d = top(0, 1 / 3);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.6, color: PINK });
      g.moveTo(a.x, a.y).lineTo(d.x, d.y).stroke({ width: 1.6, color: 0x26b5ff });
      const box0 = [top(1 / 3, 1 / 3), top(2 / 3, 1 / 3), top(2 / 3, 2 / 3), top(1 / 3, 2 / 3)];
      g.poly(box0).fill({ color: PINK, alpha: live ? 0.35 + 0.3 * pulse : 0.3 });
    }
    if (live) {
      for (let i = 0; i < 3; i++) {
        const k = (c.t + i / 3) % 1;
        const p = lift(0.5, 0.5, T + 8 + k * 26);
        g.star?.(p.x + Math.sin((k + i) * TAU) * 10, p.y, 4, 3.5 * (1 - k), 1.5 * (1 - k)).fill({ color: c.top, alpha: 1 - k });
      }
    }
  },

  game_chair(g, c) {
    const x = c.cx;
    const y = c.cy;
    const r = c.rot % 4;
    shadow(g, x, y + 2, 16, 7, 0.22);
    // star base on casters
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      g.moveTo(x, y - 4).lineTo(x + Math.cos(a) * 12, y - 2 + Math.sin(a) * 5).stroke({ width: 2.5, color: 0x2a2548 });
      g.circle(x + Math.cos(a) * 12, y - 1 + Math.sin(a) * 5, 1.8).fill(INK);
    }
    g.rect(x - 1.8, y - 14, 3.6, 10).fill(0x55507a);
    const rgb = RGB[c.frame % RGB.length];
    const backs: Record<number, [number, number, number, number]> = {
      0: [0.12, 0.08, 0.76, 0.18],
      1: [0.74, 0.12, 0.18, 0.76],
      2: [0.12, 0.74, 0.76, 0.18],
      3: [0.08, 0.12, 0.18, 0.76],
    };
    const [bx, by, bw, bh] = backs[r];
    const back = () => {
      box(g, bx, by, bw, bh, 16, 26, c.top, shade(c.top, 0.7));
      // racing stripe + headrest pillow + RGB piping
      const mid = lift(bx + bw / 2, by + bh / 2, 30);
      g.roundRect(mid.x - 3, mid.y - 10, 6, 20, 3).fill({ color: c.side, alpha: 0.9 });
      g.roundRect(mid.x - 7, mid.y - 16, 14, 6, 3).fill(0x2a2548).stroke({ width: 1, color: INK });
      const e0 = lift(bx, by + (r % 2 ? 0 : bh), 42);
      const e1 = lift(bx + (r % 2 ? bw : bw), by + bh, 42);
      g.moveTo(e0.x, e0.y).lineTo(e1.x, e1.y).stroke({ width: 2, color: rgb });
    };
    const farBack = r === 0 || r === 3;
    if (farBack) back();
    box(g, 0.14, 0.14, 0.72, 0.72, 13, 5, shade(c.top, 0.9), shade(c.top, 0.65));
    const seat = lift(0.5, 0.5, 18);
    g.ellipse(seat.x, seat.y, 10, 4.5).fill({ color: c.side, alpha: 0.5 });
    glow(g, seat.x, seat.y + 6, 10, rgb, 0.25);
    if (!farBack) back();
  },

  bean_bag(g, c) {
    const x = c.cx;
    const y = c.cy;
    const squish = 1 + 0.03 * Math.sin(c.t * TAU);
    shadow(g, x, y + 2, 18, 8);
    g.ellipse(x, y - 7, 17 * squish, 10 / squish).fill(rad(shade(c.top, 1.3), shade(c.top, 0.7), 0.4, 0.3)).stroke({ width: 1.5, color: INK });
    g.ellipse(x - 2, y - 14, 11, 7).fill(rad(shade(c.top, 1.35), c.top, 0.35, 0.3)).stroke({ width: 1.2, color: INK });
    g.moveTo(x - 9, y - 6).quadraticCurveTo(x, y - 2, x + 9, y - 7).stroke({ width: 1, color: shade(c.top, 0.6), alpha: 0.7 });
    g.ellipse(x - 6, y - 17, 3, 1.5).fill({ color: WHITE, alpha: 0.35 });
  },

  game_shelf(g, c) {
    const wide = c.w >= c.h;
    const T = c.def.tall;
    shadow(g, c.cx, c.cy + 3, 34, 13);
    const [bx, by, bw, bh] = wide ? [0.05, 0.3, c.w - 0.1, 0.5] : [0.3, 0.05, 0.5, c.h - 0.1];
    box(g, bx, by, bw, bh, 0, T, 0x3b2f5c, 0x2a2148);
    const colours = [0xff5f7e, 0xffd23f, 0x5ef2ff, 0x7cf29a, 0xc49bff, 0xff9a5c, 0xffffff];
    for (let shelf = 0; shelf < 3; shelf++) {
      const z = 8 + shelf * 21;
      for (let i = 0; i < 6; i++) {
        const k = (i + 0.5) / 6;
        const p = wide ? lift(bx + bw * k, by + bh, z) : lift(bx + bw, by + bh * k, z);
        const hgt = 8 + ((i * 7 + shelf * 3) % 3) * 3;
        const col = colours[(i * 5 + shelf * 2) % colours.length];
        g.rect(p.x - 3.5, p.y - hgt, 7, hgt).fill(col).stroke({ width: 0.8, color: INK });
        g.rect(p.x - 3.5, p.y - hgt + 2, 7, 1.5).fill({ color: WHITE, alpha: 0.5 });
      }
      const s0 = wide ? lift(bx, by + bh, z - 1) : lift(bx + bw, by, z - 1);
      const s1 = wide ? lift(bx + bw, by + bh, z - 1) : lift(bx + bw, by + bh, z - 1);
      g.moveTo(s0.x, s0.y).lineTo(s1.x, s1.y).stroke({ width: 2, color: CYAN, alpha: 0.6 });
    }
  },

  trophy_case(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 18, 8);
    box(g, 0.15, 0.15, 0.7, 0.7, 0, 10, 0x3b2f5c, 0x2a2148);
    box(g, 0.15, 0.15, 0.7, 0.7, T - 6, 6, 0x3b2f5c, 0x2a2148);
    // trophies inside
    for (const [dx, h, s] of [
      [-8, 30, 0.8],
      [0, 48, 1.1],
      [8, 26, 0.75],
    ] as const) {
      const ty = y - 12 - h * 0.35;
      g.rect(x + dx - 3 * s, ty + 6 * s, 6 * s, 3 * s).fill(0x6b4632);
      g.rect(x + dx - 1 * s, ty, 2 * s, 7 * s).fill(GOLD);
      g.moveTo(x + dx - 6 * s, ty - 10 * s).quadraticCurveTo(x + dx, ty + 4 * s, x + dx + 6 * s, ty - 10 * s).fill(grad(0xffe28a, 0xc98a12)).stroke({ width: 0.8, color: INK });
      g.circle(x + dx, ty - 5 * s, 1.4 * s).fill(WHITE);
    }
    // glass with a sweeping shine
    const a = lift(0.15, 0.85, 10);
    const b = lift(0.85, 0.85, 10);
    const d = lift(0.85, 0.15, 10);
    g.poly([a, b, { x: b.x, y: b.y - (T - 16) }, { x: a.x, y: a.y - (T - 16) }]).fill({ color: 0xbfe6ff, alpha: 0.16 });
    g.poly([b, d, { x: d.x, y: d.y - (T - 16) }, { x: b.x, y: b.y - (T - 16) }]).fill({ color: 0xbfe6ff, alpha: 0.1 });
    const k = c.t;
    const sx = a.x + (b.x - a.x) * k;
    const sy = a.y + (b.y - a.y) * k;
    g.moveTo(sx, sy - 6).lineTo(sx + 6, sy - (T - 22)).stroke({ width: 3, color: WHITE, alpha: 0.45 * Math.sin(k * Math.PI) });
    glow(g, x, y - T + 4, 10, CYAN, 0.5);
  },

  giant_dice(g, c) {
    const bob = Math.abs(Math.sin(c.t * TAU)) * 3;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 16 - bob, 7, 0.22);
    box(g, 0.18, 0.18, 0.64, 0.64, 2 + bob, 30, 0xfffdf6, 0xe6e0f2);
    const topC = lift(0.5, 0.5, 32 + bob);
    for (const [dx, dy] of [
      [-6, -3],
      [0, 0],
      [6, 3],
    ])
      g.ellipse(topC.x + dx, topC.y + dy, 2.2, 1.2).fill(PINK);
    const right = lift(0.82, 0.5, 17 + bob);
    for (const [dx, dy] of [
      [-4, -6],
      [4, 2],
      [-4, 2],
      [4, -6],
    ])
      g.ellipse(right.x + dx, right.y + dy, 1.6, 2.2).fill(NAVY);
    const left = lift(0.5, 0.82, 17 + bob);
    for (const [dx, dy] of [
      [-5, -5],
      [5, 5],
    ])
      g.ellipse(left.x + dx, left.y + dy, 1.6, 2.2).fill(NAVY);
  },

  chess_king(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 2, 16, 7, 0.25);
    cylinder(g, x, y, 13, 6, 6, 0x2a2548, 0x2a2548);
    const body = [
      { x: x - 11, y: y - 6 },
      { x: x - 5, y: y - 26 },
      { x: x - 7, y: y - 30 },
      { x: x - 4, y: y - T + 20 },
      { x: x + 4, y: y - T + 20 },
      { x: x + 7, y: y - 30 },
      { x: x + 5, y: y - 26 },
      { x: x + 11, y: y - 6 },
    ];
    g.poly(body).fill(hgrad(0x4a4378, 0x141129)).stroke({ width: 1.5, color: INK });
    g.ellipse(x, y - T + 18, 9, 4).fill(0x2a2548).stroke({ width: 1.2, color: INK });
    g.rect(x - 1.6, y - T + 2, 3.2, 14).fill(GOLD);
    g.rect(x - 5, y - T + 6, 10, 3).fill(GOLD);
    const k = c.t;
    g.moveTo(x - 6 + k * 12, y - 10).lineTo(x - 3 + k * 8, y - T + 22).stroke({ width: 2, color: WHITE, alpha: 0.35 * Math.sin(k * Math.PI) });
    glow(g, x, y - T + 6, 12, GOLD, 0.35 + 0.25 * Math.sin(k * TAU));
  },

  pool_table(g, c) {
    const wide = c.w >= c.h;
    shadow(g, c.cx, c.cy + 5, 70, 30, 0.25);
    for (const [lx, ly] of [
      [0.15, 0.15],
      [c.w - 0.35, 0.15],
      [0.15, c.h - 0.35],
      [c.w - 0.35, c.h - 0.35],
    ])
      box(g, lx, ly, 0.2, 0.2, 0, 16, 0x5b3a26, 0x3d2718);
    box(g, 0.05, 0.05, c.w - 0.1, c.h - 0.1, 16, 8, 0x6b4632, 0x4a2f20);
    diamond(g, 0.05, 0.05, c.w - 0.1, c.h - 0.1, 7, 24).fill(grad(0x23a35b, 0x17804a));
    for (const [px, py] of [
      [0.12, 0.12],
      [c.w - 0.12, 0.12],
      [0.12, c.h - 0.12],
      [c.w - 0.12, c.h - 0.12],
      [c.w / 2, wide ? 0.1 : c.h / 2],
      [wide ? c.w / 2 : 0.1, wide ? c.h - 0.1 : c.h / 2],
    ]) {
      const p = lift(px, py, 24);
      g.ellipse(p.x, p.y, 3.2, 1.8).fill(INK);
    }
    const balls = [0xffd23f, 0x3a78ff, 0xff4d5e, 0x7b5cff, 0xff9a5c, 0x23a35b, 0x8b2723, 0x16161a];
    balls.forEach((col, i) => {
      const a = c.t * TAU + (i / balls.length) * TAU;
      const r = 0.25 + (i % 3) * 0.12;
      const p = lift(c.w / 2 + Math.cos(a) * r * (wide ? 1.4 : 0.8), c.h / 2 + Math.sin(a) * r * (wide ? 0.6 : 1.2), 26);
      g.circle(p.x, p.y, 2.6).fill(col).stroke({ width: 0.6, color: INK });
      g.circle(p.x - 0.8, p.y - 0.8, 0.8).fill({ color: WHITE, alpha: 0.7 });
    });
    const cue = lift(c.w * 0.25, c.h * 0.5, 26);
    g.circle(cue.x, cue.y, 2.8).fill(WHITE).stroke({ width: 0.6, color: INK });
    const hang = lift(c.w / 2, c.h / 2, 70);
    g.moveTo(hang.x, hang.y - 20).lineTo(hang.x, hang.y).stroke({ width: 1, color: INK });
    g.roundRect(hang.x - 22, hang.y, 44, 7, 3).fill(0x2a2548).stroke({ width: 1, color: INK });
    g.poly([
      { x: hang.x - 20, y: hang.y + 7 },
      { x: hang.x + 20, y: hang.y + 7 },
      { x: hang.x + 44, y: hang.y + 50 },
      { x: hang.x - 44, y: hang.y + 50 },
    ]).fill({ color: 0xfff1a8, alpha: 0.08 });
  },

  dice_rug(g, c) {
    diamond(g, 0, 0, c.w, c.h, 3).fill(0x221d44);
    diamond(g, 0, 0, c.w, c.h, 3).stroke({ width: 2, color: CYAN, alpha: 0.8 });
    diamond(g, 0, 0, c.w, c.h, 9).stroke({ width: 1.5, color: PINK, alpha: 0.7 });
    for (let i = 0; i < 4; i++) {
      const tx = 0.4 + (i % 2) * (c.w - 1.3);
      const ty = 0.4 + Math.floor(i / 2) * (c.h - 1.3);
      diamond(g, tx, ty, 0.5, 0.5).fill(i % 2 ? PINK : CYAN);
      const p = lift(tx + 0.25, ty + 0.25, 0);
      g.ellipse(p.x, p.y, 2.2, 1.2).fill(NAVY);
    }
  },

  pixel_lamp(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadow(g, x, y + 1, 10, 4);
    const col = RGB[c.frame % RGB.length];
    if (c.on) g.ellipse(x, y, 30, 14).fill({ color: col, alpha: 0.12 });
    cylinder(g, x, y, 7, 3.5, 4, 0x2a2548, 0x2a2548);
    g.rect(x - 1.5, y - T + 18, 3, T - 20).fill(0x55507a);
    const hy = y - T + 10;
    if (c.on) glow(g, x, hy, 20, col, 0.6);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const lit = c.on && (i + j + c.frame) % 2 === 0;
        g.rect(x - 7.5 + i * 5, hy - 7.5 + j * 5, 4.5, 4.5).fill(lit ? col : shade(col, 0.35)).stroke({ width: 0.6, color: INK });
      }
  },

  wall_den(g, c) {
    const id = c.def.id;
    if (id === 'neon_game') {
      const W = wallMap(c, 28, 90);
      g.poly([W(0.02, -0.04), W(0.98, -0.04), W(0.98, 1.04), W(0.02, 1.04)]).fill({ color: NAVY, alpha: 0.85 }).stroke({ width: 2, color: 0x2d2760 });
      const flick = c.frame === 5 ? 0.35 : 1;
      const word = (text: string, v0: number, v1: number, col: number, seed: number) => {
        const cell = 0.8 / text.length;
        [...text].forEach((ch, li) => {
          const u0 = 0.1 + li * cell + cell * 0.18;
          const u1 = 0.1 + (li + 1) * cell - cell * 0.18;
          for (const stroke of TUBES[ch] ?? []) {
            const pts = stroke.map(([px, py]) => W(u0 + (u1 - u0) * px, v1 - (v1 - v0) * py));
            const a = li === seed ? flick : 1;
            g.poly(pts, false).stroke({ width: 7, color: col, alpha: 0.25 * a, join: 'round', cap: 'round' });
            g.poly(pts, false).stroke({ width: 2.6, color: col, alpha: a, join: 'round', cap: 'round' });
            g.poly(pts, false).stroke({ width: 1, color: WHITE, alpha: 0.8 * a, join: 'round', cap: 'round' });
          }
        });
      };
      word('GAME', 0.56, 0.92, PINK, 2);
      word('ON', 0.1, 0.44, CYAN, -1);
      return;
    }
    if (id === 'scoreboard') {
      const W = wallMap(c, 26, 90);
      g.poly([W(0.03, 0), W(0.97, 0), W(0.97, 1), W(0.03, 1)]).fill(0x100d22).stroke({ width: 3, color: 0x3b2f5c });
      const top = [W(0.05, 0.84), W(0.95, 0.84), W(0.95, 0.97), W(0.05, 0.97)];
      g.poly(top).fill(PINK);
      for (let row = 0; row < 4; row++) {
        const v = 0.66 - row * 0.17;
        const len = 0.2 + (((row * 37 + c.frame * (row + 1)) % 11) / 11) * 0.55;
        const col = [GOLD, CYAN, 0x7cf29a, 0xc49bff][row];
        g.poly([W(0.18, v), W(0.18 + len, v), W(0.18 + len, v + 0.1), W(0.18, v + 0.1)]).fill({ color: col, alpha: 0.85 });
        const n = W(0.1, v + 0.05);
        g.circle(n.x, n.y, 2.4).fill(col);
      }
      for (let i = 0; i < 10; i++) {
        const p = W(0.08 + i * 0.093, 0.905);
        g.circle(p.x, p.y, 1.1).fill((i + c.frame) % 3 ? WHITE : NAVY);
      }
      return;
    }
    // dartboard with a dart that lands, wobbles, and resets
    const W = wallMap(c, 36, 86);
    const m = W(0.5, 0.5);
    const R = 16;
    const rings = [0x16161a, 0xfff1d6, 0xe0553d, 0xfff1d6, 0x2fb39b, 0xe0553d];
    rings.forEach((col, i) => g.ellipse(m.x, m.y, R * (1 - i * 0.16), R * (1 - i * 0.16) * 1.1).fill(col));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      g.moveTo(m.x, m.y).lineTo(m.x + Math.cos(a) * R, m.y + Math.sin(a) * R * 1.1).stroke({ width: 0.6, color: INK, alpha: 0.5 });
    }
    g.ellipse(m.x, m.y, R, R * 1.1).stroke({ width: 2, color: INK });
    const land = c.frame >= 2;
    const dx = land ? 3 : 3 + (2 - c.frame) * 9;
    const wob = land ? Math.sin(c.frame * 2) * 1.2 : 0;
    g.moveTo(m.x + dx, m.y - 2).lineTo(m.x + dx + 10, m.y - 8 + wob).stroke({ width: 2, color: 0x55507a });
    g.poly([
      { x: m.x + dx + 9, y: m.y - 8 + wob },
      { x: m.x + dx + 15, y: m.y - 13 + wob },
      { x: m.x + dx + 13, y: m.y - 6 + wob },
    ]).fill(PINK);
  },
};
