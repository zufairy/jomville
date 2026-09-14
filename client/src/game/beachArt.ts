import { Graphics } from 'pixi.js';
import { PALETTE, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { box, heart, shade } from './furnitureArt';
import { Painter, Pt, diamondAt, glowAt, rnd, shadowAt } from './labArt';

/** Sunset Cove furniture: golden-hour beach pieces with looping animation. */

const TAU = Math.PI * 2;
const INK = PALETTE[0];
const WHITE = 0xffffff;
const WOOD = 0xc58b52;
const NEON = [PALETTE[7], PALETTE[16], PALETTE[13], PALETTE[18], PALETTE[9]];

/** rotated capsule (surfboards, floats) */
function capsule(g: Graphics, x: number, y: number, len: number, wid: number, ang: number, col: number) {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const pts: Pt[] = [];
  for (let i = 0; i < 16; i++) {
    const th = (i / 16) * TAU;
    const a = Math.cos(th) * len * 0.5;
    const b = Math.sin(th) * wid * 0.5;
    pts.push({ x: x + ux * a - uy * b, y: y + uy * a + ux * b });
  }
  return g.poly(pts).fill(col).stroke({ width: 1.5, color: INK });
}

const lift = (tx: number, ty: number, z: number): Pt => {
  const p = tileToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
};

export const BEACH_PAINTERS: Record<string, Painter> = {
  cabana(g, c) {
    const T = c.def.tall;
    const sway = Math.sin(c.t * TAU) * 4;
    shadowAt(g, c.cx, c.cy + 6, 60, 26, 0.18);
    diamondAt(g, 0.02, 0.02, c.w - 0.04, c.h - 0.04, WOOD, 2);
    const corners: Array<[number, number]> = [
      [0.12, 0.12],
      [c.w - 0.12, 0.12],
      [c.w - 0.12, c.h - 0.12],
      [0.12, c.h - 0.12],
    ];
    const post = ([x, y]: [number, number]) => {
      const a = lift(x, y, 0);
      g.rect(a.x - 2, a.y - T + 10, 4, T - 10).fill(PALETTE[21]).stroke({ width: 1, color: INK });
    };
    post(corners[0]);
    post(corners[1]);
    post(corners[3]);
    box(g, 0.22, 0.22, c.w - 0.44, c.h - 0.44, 2, 10, c.top, PALETTE[24]);
    box(g, 0.3, 0.3, 0.5, 0.35, 12, 6, c.side, shade(c.side, 0.8));
    box(g, c.w - 0.8, 0.3, 0.5, 0.35, 12, 6, PALETTE[13], shade(PALETTE[13], 0.8));
    post(corners[2]);
    // striped pyramid roof
    const apex = lift(c.w / 2, c.h / 2, T + 16);
    const rc = corners.map(([x, y]) => lift(x, y, T - 10));
    for (let i = 0; i < 4; i++) {
      const a = rc[i];
      const b = rc[(i + 1) % 4];
      for (let s = 0; s < 4; s++) {
        const k0 = s / 4;
        const k1 = (s + 1) / 4;
        const p0 = { x: a.x + (b.x - a.x) * k0, y: a.y + (b.y - a.y) * k0 };
        const p1 = { x: a.x + (b.x - a.x) * k1, y: a.y + (b.y - a.y) * k1 };
        g.poly([apex, p0, p1]).fill(s % 2 ? WHITE : c.side);
      }
      g.poly([apex, a, b]).stroke({ width: 1.5, color: INK });
    }
    // scalloped fringe with twinkle lights
    for (let i = 0; i < 4; i++) {
      const a = rc[i];
      const b = rc[(i + 1) % 4];
      for (let s = 0; s < 6; s++) {
        const k = (s + 0.5) / 6;
        const m = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        g.circle(m.x, m.y + 3, 3).fill(s % 2 ? c.side : WHITE);
        g.circle(m.x, m.y + 7, 1.4).fill(NEON[(s + i + c.frame) % NEON.length]);
      }
    }
    // front curtains tied back, swaying in the breeze
    for (const i of [2, 3]) {
      const top = rc[i];
      const bot = lift(corners[i][0], corners[i][1], 10);
      g.poly([
        { x: top.x - 6, y: top.y + 4 },
        { x: top.x + 6, y: top.y + 4 },
        { x: bot.x + 5 + sway, y: bot.y },
        { x: bot.x - 3 + sway, y: bot.y },
      ]).fill({ color: WHITE, alpha: 0.85 });
    }
  },

  sun_lounger(g, c) {
    const along = c.w >= c.h;
    shadowAt(g, c.cx, c.cy + 3, 34, 13);
    box(g, 0.08, 0.2, c.w - 0.16, c.h - 0.4, 0, 8, PALETTE[27], PALETTE[25]);
    box(g, 0.12, 0.24, c.w - 0.24, c.h - 0.48, 8, 3, c.side, shade(c.side, 0.8));
    if (along) box(g, 0.12, 0.24, 0.55, c.h - 0.48, 11, 9, shade(c.side, 1.12), shade(c.side, 0.8));
    else box(g, 0.24, 0.12, c.w - 0.48, 0.55, 11, 9, shade(c.side, 1.12), shade(c.side, 0.8));
    for (let i = 1; i < 5; i++) {
      const k = i / 5;
      const a = along ? lift(0.12 + k * (c.w - 0.24), 0.24, 11) : lift(0.24, 0.12 + k * (c.h - 0.24), 11);
      const b = along ? lift(0.12 + k * (c.w - 0.24), c.h - 0.24, 11) : lift(c.w - 0.24, 0.12 + k * (c.h - 0.24), 11);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2, color: WHITE, alpha: 0.7 });
    }
    // sunglasses resting on the towel
    const s = along ? lift(c.w - 0.5, c.h / 2, 12) : lift(c.w / 2, c.h - 0.5, 12);
    g.circle(s.x - 4, s.y, 3).fill(PALETTE[29]);
    g.circle(s.x + 4, s.y, 3).fill(PALETTE[29]);
    g.moveTo(s.x - 1, s.y).lineTo(s.x + 1, s.y).stroke({ width: 1, color: PALETTE[29] });
  },

  hammock(g, c) {
    const T = c.def.tall;
    const along = c.w >= c.h;
    const p0 = along ? lift(0.08, 0.5, 0) : lift(0.5, 0.08, 0);
    const p1 = along ? lift(c.w - 0.08, 0.5, 0) : lift(0.5, c.h - 0.08, 0);
    shadowAt(g, c.cx, c.cy + 4, 36, 12);
    for (const p of [p0, p1]) g.rect(p.x - 2.5, p.y - T, 5, T).fill(WOOD).stroke({ width: 1, color: INK });
    const sway = Math.sin(c.t * TAU) * 3;
    const a = { x: p0.x, y: p0.y - T + 12 };
    const b = { x: p1.x, y: p1.y - T + 12 };
    const mid = { x: (a.x + b.x) / 2 + sway, y: (a.y + b.y) / 2 + 30 };
    // striped fabric: bands between the upper and lower sag curves
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const pt = (k: number, off: number) => {
        const u = 1 - k;
        return { x: u * u * a.x + 2 * u * k * mid.x + k * k * b.x, y: u * u * a.y + 2 * u * k * (mid.y + off) + k * k * b.y + off * 0.3 };
      };
      const k0 = i / bands;
      const k1 = (i + 1) / bands;
      g.poly([pt(k0, -6), pt(k1, -6), pt(k1, 6), pt(k0, 6)]).fill(i % 2 ? c.top : c.side);
    }
    g.moveTo(a.x, a.y).quadraticCurveTo(mid.x, mid.y + 12, b.x, b.y).stroke({ width: 1.5, color: INK });
    g.moveTo(a.x, a.y).quadraticCurveTo(mid.x, mid.y - 12, b.x, b.y).stroke({ width: 1.5, color: INK, alpha: 0.6 });
  },

  tiki_bar(g, c) {
    const T = c.def.tall;
    shadowAt(g, c.cx, c.cy + 6, 58, 24, 0.18);
    // bamboo counter
    box(g, 0.1, 0.35, c.w - 0.2, c.h - 0.45, 0, 34, PALETTE[19], PALETTE[20]);
    for (let i = 1; i < 8; i++) {
      const a = lift(0.1 + (i / 8) * (c.w - 0.2), c.h - 0.1, 0);
      g.moveTo(a.x, a.y - 2).lineTo(a.x, a.y - 32).stroke({ width: 1, color: shade(PALETTE[20], 0.7) });
    }
    box(g, 0.05, 0.3, c.w - 0.1, c.h - 0.35, 34, 4, c.top, shade(c.top, 0.8));
    // back posts + thatch roof
    for (const [x, y] of [
      [0.15, 0.12],
      [c.w - 0.15, 0.12],
    ] as const) {
      const p = lift(x, y, 0);
      g.rect(p.x - 2.5, p.y - T, 5, T).fill(PALETTE[21]).stroke({ width: 1, color: INK });
    }
    const r = [lift(-0.1, -0.1, T), lift(c.w + 0.1, -0.1, T), lift(c.w + 0.1, 0.7, T - 8), lift(-0.1, 0.7, T - 8)];
    g.poly(r).fill(PALETTE[17]).stroke({ width: 1.5, color: INK });
    const sway = Math.sin(c.t * TAU) * 1.5;
    for (let i = 0; i < 12; i++) {
      const k = (i + 0.5) / 12;
      const e = { x: r[3].x + (r[2].x - r[3].x) * k, y: r[3].y + (r[2].y - r[3].y) * k };
      g.poly([{ x: e.x - 5, y: e.y }, { x: e.x + 5, y: e.y }, { x: e.x + sway, y: e.y + 10 + (i % 3) * 2 }]).fill(shade(PALETTE[17], 0.85));
      if (i % 2 === 0) g.circle(e.x, e.y + 3, 1.6).fill(c.on ? NEON[(i + c.frame) % NEON.length] : shade(PALETTE[30], 0.5));
    }
    // neon "aloha" sign: a glowing wave + heart
    const s = lift(c.w / 2, 0.14, T - 26);
    if (c.on) glowAt(g, s.x, s.y, 26, PALETTE[7], 0.3 + 0.15 * Math.sin(c.t * TAU));
    g.roundRect(s.x - 20, s.y - 8, 40, 16, 5).fill(0x1c1c1c).stroke({ width: 1.5, color: INK });
    g.moveTo(s.x - 15, s.y + 2).quadraticCurveTo(s.x - 9, s.y - 6, s.x - 3, s.y + 2).quadraticCurveTo(s.x + 3, s.y + 8, s.x + 8, s.y).stroke({ width: 2, color: c.on ? PALETTE[13] : shade(PALETTE[13], 0.4) });
    heart(g, s.x + 13, s.y, 4, c.on ? PALETTE[7] : shade(PALETTE[7], 0.4));
    // drinks on the counter
    const top = (u: number) => lift(0.15 + u * (c.w - 0.3), 0.55, 38);
    const cups = [PALETTE[7], PALETTE[18], PALETTE[13]];
    cups.forEach((col, i) => {
      const p = top(0.15 + i * 0.25);
      g.poly([{ x: p.x - 4, y: p.y - 10 }, { x: p.x + 4, y: p.y - 10 }, { x: p.x + 2, y: p.y }, { x: p.x - 2, y: p.y }]).fill(col).stroke({ width: 1, color: INK });
      g.moveTo(p.x + 1, p.y - 10).lineTo(p.x + 4, p.y - 16).stroke({ width: 1.2, color: WHITE });
      g.circle(p.x - 3, p.y - 11, 2).fill(PALETTE[14]);
    });
    // blender swirling
    const bl = top(0.9);
    g.roundRect(bl.x - 5, bl.y - 16, 10, 14, 3).fill({ color: PALETTE[31], alpha: 0.8 }).stroke({ width: 1, color: INK });
    const sw = c.on ? c.t * TAU * 2 : 0;
    g.ellipse(bl.x + Math.cos(sw) * 1.5, bl.y - 8, 3.5, 4).fill(PALETTE[6]);
    g.rect(bl.x - 5, bl.y - 3, 10, 3).fill(PALETTE[26]);
  },

  surf_rack(g, c) {
    const T = c.def.tall;
    shadowAt(g, c.cx, c.cy + 2, 24, 9);
    g.moveTo(c.cx - 14, c.cy).lineTo(c.cx - 4, c.cy - T + 10).lineTo(c.cx + 6, c.cy).stroke({ width: 3, color: WOOD });
    const boards = [c.side, PALETTE[7], PALETTE[16]];
    boards.forEach((col, i) => {
      const x = c.cx - 8 + i * 8;
      capsule(g, x, c.cy - T / 2 + 4, T - 6, 10, -Math.PI / 2 + 0.18, col);
      g.moveTo(x - 1, c.cy - T + 10).lineTo(x + 3, c.cy - 4).stroke({ width: 1.5, color: WHITE, alpha: 0.8 });
    });
    g.moveTo(c.cx - 16, c.cy - 22).lineTo(c.cx + 16, c.cy - 24).stroke({ width: 3, color: shade(WOOD, 0.8) });
  },

  sandcastle(g, c) {
    const x = c.cx;
    const y = c.cy;
    const sand = c.top;
    shadowAt(g, x, y + 2, 20, 8);
    g.ellipse(x, y - 2, 20, 9).fill(shade(sand, 0.9)).stroke({ width: 1.5, color: INK });
    const tower = (tx: number, ty: number, w: number, h: number) => {
      g.rect(tx - w / 2, ty - h, w, h).fill(sand).stroke({ width: 1.2, color: INK });
      for (let i = 0; i < 3; i++) g.rect(tx - w / 2 + i * (w / 3), ty - h - 3, w / 3 - 1, 3).fill(sand);
      g.rect(tx - 1.5, ty - h * 0.6, 3, 4).fill(shade(sand, 0.6));
    };
    tower(x - 11, y - 1, 8, 14);
    tower(x + 11, y - 1, 8, 14);
    tower(x, y - 3, 11, 24);
    const flagY = y - 27 - 12;
    g.moveTo(x, y - 30).lineTo(x, flagY).stroke({ width: 1.2, color: INK });
    const w = Math.sin(c.t * TAU) * 3;
    g.poly([{ x, y: flagY }, { x: x + 10, y: flagY + 3 + w }, { x, y: flagY + 7 }]).fill(c.side);
    g.circle(x - 16, y + 1, 1.8).fill(PALETTE[6]);
    g.circle(x + 15, y + 2, 1.5).fill(WHITE);
  },

  flamingo_pool(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 8, 56, 24, 0.16);
    g.ellipse(x, y + 5, 54, 26).fill(shade(c.side, 0.75)).stroke({ width: 2, color: INK });
    g.ellipse(x, y, 54, 26).fill(c.side).stroke({ width: 2, color: INK });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      g.circle(x + Math.cos(a) * 47, y + Math.sin(a) * 21, 4).fill(i % 2 ? WHITE : c.side);
    }
    g.ellipse(x, y, 40, 17).fill(c.top).stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 2; i++) {
      const k = (c.t + i / 2) % 1;
      g.ellipse(x + 10, y + 2, 6 + k * 22, 3 + k * 9).stroke({ width: 1.2, color: WHITE, alpha: (1 - k) * 0.7 });
    }
    // flamingo float bobbing
    const bob = Math.sin(c.t * TAU) * 2;
    const fx = x - 6;
    const fy = y - 2 + bob;
    g.ellipse(fx, fy, 14, 7).fill(PALETTE[7]).stroke({ width: 1.5, color: INK });
    g.moveTo(fx + 8, fy - 3).bezierCurveTo(fx + 20, fy - 14, fx + 4, fy - 20, fx + 12, fy - 28).stroke({ width: 4, color: INK });
    g.moveTo(fx + 8, fy - 3).bezierCurveTo(fx + 20, fy - 14, fx + 4, fy - 20, fx + 12, fy - 28).stroke({ width: 2.5, color: PALETTE[7] });
    g.circle(fx + 13, fy - 29, 4).fill(PALETTE[7]).stroke({ width: 1.2, color: INK });
    g.poly([{ x: fx + 16, y: fy - 30 }, { x: fx + 22, y: fy - 27 }, { x: fx + 16, y: fy - 27 }]).fill(PALETTE[29]);
    g.circle(fx + 13, fy - 30, 1).fill(INK);
  },

  beach_ball(g, c) {
    const hop = Math.abs(Math.sin(c.t * TAU)) * 14;
    shadowAt(g, c.cx, c.cy + 1, 10 - hop * 0.25, 4 - hop * 0.1, 0.25);
    const x = c.cx;
    const y = c.cy - 9 - hop;
    const cols = [c.top, WHITE, c.side, PALETTE[16], WHITE, PALETTE[15]];
    const spin = c.t * TAU;
    for (let i = 0; i < 6; i++) {
      const a0 = spin + (i / 6) * TAU;
      const a1 = spin + ((i + 1) / 6) * TAU;
      g.poly([{ x, y }, { x: x + Math.cos(a0) * 9, y: y + Math.sin(a0) * 9 }, { x: x + Math.cos((a0 + a1) / 2) * 9.4, y: y + Math.sin((a0 + a1) / 2) * 9.4 }, { x: x + Math.cos(a1) * 9, y: y + Math.sin(a1) * 9 }]).fill(cols[i]);
    }
    g.circle(x, y, 9).stroke({ width: 1.5, color: INK });
    g.circle(x - 3, y - 3, 2.5).fill({ color: WHITE, alpha: 0.6 });
  },

  shell_lamp(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 14, 6);
    g.ellipse(x, y - 2, 12, 5).fill(WOOD).stroke({ width: 1.2, color: INK });
    const cy = y - T / 2;
    if (c.on) glowAt(g, x, cy, 30 + ((c.frame % 3) - 1) * 2, PALETTE[30], 0.5);
    // scallop shell fan
    const R = T / 2 - 2;
    const pts: Pt[] = [{ x, y: y - 6 }];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      const r = R + (i % 2 ? 0 : 2);
      pts.push({ x: x + Math.cos(a) * r * 0.8, y: y - 6 + Math.sin(a) * r });
    }
    g.poly(pts).fill(c.on ? c.top : shade(c.top, 0.7)).stroke({ width: 1.5, color: INK });
    for (let i = 1; i < 10; i += 2) {
      const a = Math.PI + (i / 10) * Math.PI;
      g.moveTo(x, y - 6).lineTo(x + Math.cos(a) * R * 0.75, y - 6 + Math.sin(a) * R * 0.95).stroke({ width: 1, color: shade(c.side, 0.8), alpha: 0.8 });
    }
    g.circle(x, y - 9, 3).fill(WHITE).stroke({ width: 1, color: INK });
  },

  boombox(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 16, 7);
    g.roundRect(x - 15, y - 20, 30, 16, 4).fill(c.top).stroke({ width: 1.5, color: INK });
    g.moveTo(x - 9, y - 20).lineTo(x - 7, y - 26).lineTo(x + 7, y - 26).lineTo(x + 9, y - 20).stroke({ width: 2, color: INK });
    const pulse = c.on ? 1 + 0.15 * Math.abs(Math.sin(c.t * TAU * 2)) : 1;
    for (const sx of [-8, 8]) {
      g.circle(x + sx, y - 12, 5 * pulse).fill(c.side).stroke({ width: 1, color: PALETTE[26] });
      g.circle(x + sx, y - 12, 1.8).fill(PALETTE[26]);
    }
    g.rect(x - 3, y - 17, 6, 4).fill(c.on ? PALETTE[13] : PALETTE[26]);
    if (!c.on) return;
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      const nx = x - 10 + i * 10 + Math.sin(k * 6 + i) * 4;
      const ny = y - 28 - k * 22;
      g.circle(nx, ny, 2.2).fill({ color: NEON[i], alpha: 1 - k });
      g.moveTo(nx + 2, ny).lineTo(nx + 2, ny - 7).stroke({ width: 1.2, color: NEON[i], alpha: 1 - k });
    }
  },

  lifeguard_tower(g, c) {
    const T = c.def.tall;
    const plat = 60;
    shadowAt(g, c.cx, c.cy + 6, 50, 22, 0.18);
    const foot: Array<[number, number]> = [
      [0.15, 0.15],
      [c.w - 0.15, 0.15],
      [c.w - 0.15, c.h - 0.15],
      [0.15, c.h - 0.15],
    ];
    const leg = (i: number) => {
      const f = lift(foot[i][0], foot[i][1], 0);
      const t = lift(0.4 + (foot[i][0] > 1 ? c.w - 0.8 : 0), 0.4 + (foot[i][1] > 1 ? c.h - 0.8 : 0), plat);
      g.moveTo(f.x, f.y).lineTo(t.x, t.y).stroke({ width: 4, color: INK });
      g.moveTo(f.x, f.y).lineTo(t.x, t.y).stroke({ width: 2.5, color: WHITE });
    };
    leg(0);
    leg(1);
    leg(3);
    box(g, 0.35, 0.35, c.w - 0.7, c.h - 0.7, plat, 6, PALETTE[24], PALETTE[25]);
    // striped hut
    box(g, 0.45, 0.45, c.w - 0.9, c.h - 0.9, plat + 6, 28, c.top, c.side);
    for (let i = 1; i < 4; i++) {
      const a = lift(0.45, c.h - 0.45, plat + 6 + i * 7);
      const b = lift(c.w - 0.45, c.h - 0.45, plat + 6 + i * 7);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 3, color: i % 2 ? c.side : WHITE });
    }
    const apex = lift(c.w / 2, c.h / 2, T);
    const rc = [lift(0.3, 0.3, plat + 34), lift(c.w - 0.3, 0.3, plat + 34), lift(c.w - 0.3, c.h - 0.3, plat + 34), lift(0.3, c.h - 0.3, plat + 34)];
    for (let i = 0; i < 4; i++) g.poly([apex, rc[i], rc[(i + 1) % 4]]).fill(i % 2 ? c.side : WHITE).stroke({ width: 1.5, color: INK });
    leg(2);
    // ladder
    const l0 = lift(c.w / 2 - 0.2, c.h + 0.1, 0);
    const l1 = lift(c.w / 2 - 0.2, c.h - 0.35, plat);
    for (const dx of [-5, 5]) g.moveTo(l0.x + dx, l0.y).lineTo(l1.x + dx, l1.y).stroke({ width: 2, color: WOOD });
    for (let i = 1; i < 6; i++) {
      const k = i / 6;
      g.moveTo(l0.x - 5 + (l1.x - l0.x) * k, l0.y + (l1.y - l0.y) * k).lineTo(l0.x + 5 + (l1.x - l0.x) * k, l0.y + (l1.y - l0.y) * k).stroke({ width: 1.5, color: WOOD });
    }
    // life ring
    const ring = lift(c.w - 0.45, c.h / 2, plat + 18);
    g.circle(ring.x, ring.y, 7).stroke({ width: 5, color: c.side });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      g.circle(ring.x + Math.cos(a) * 7, ring.y + Math.sin(a) * 7, 2).fill(WHITE);
    }
    // waving flag
    const fp = lift(c.w / 2, c.h / 2, T);
    g.moveTo(fp.x, fp.y).lineTo(fp.x, fp.y - 22).stroke({ width: 1.5, color: INK });
    const pts: Pt[] = [];
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      pts.push({ x: fp.x + k * 16, y: fp.y - 22 + Math.sin(c.t * TAU + k * 3) * 2 * k });
    }
    for (let i = 4; i >= 0; i--) {
      const k = i / 4;
      pts.push({ x: fp.x + k * 16, y: fp.y - 13 + Math.sin(c.t * TAU + k * 3) * 2 * k });
    }
    g.poly(pts).fill(c.side).stroke({ width: 1, color: INK });
  },

  shore_foam(g, c) {
    // wet sand band + foam that washes in and out along the seaward edges
    const wash = 0.5 + 0.5 * Math.sin(c.t * TAU);
    const edge = (a: Pt, b: Pt, inward: Pt) => {
      const d = 4 + wash * 7;
      g.poly([a, b, { x: b.x + inward.x * d, y: b.y + inward.y * d }, { x: a.x + inward.x * d, y: a.y + inward.y * d }]).fill({ color: 0xc9a46d, alpha: 0.35 });
      const pts: Pt[] = [];
      for (let i = 0; i <= 6; i++) {
        const k = i / 6;
        const o = d + Math.sin(k * TAU * 1.5 + c.t * TAU) * 1.5;
        pts.push({ x: a.x + (b.x - a.x) * k + inward.x * o, y: a.y + (b.y - a.y) * k + inward.y * o });
      }
      g.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: 2, color: WHITE, alpha: 0.85 });
      for (let i = 0; i < 3; i++) {
        const k = rnd(i + c.frame * 3);
        g.circle(a.x + (b.x - a.x) * k + inward.x * (d + 3), a.y + (b.y - a.y) * k + inward.y * (d + 3), 1.2).fill({ color: WHITE, alpha: 0.7 });
      }
    };
    const p01 = tileToScreen(0, 1);
    const p11 = tileToScreen(1, 1);
    const p10 = tileToScreen(1, 0);
    edge(p01, p11, { x: 0, y: -1 });
    edge(p11, p10, { x: -0.9, y: -0.45 });
  },

  beach_towel(g, c) {
    diamondAt(g, 0.12, 0.08, c.w - 0.24, c.h - 0.16, c.top, 0);
    const along = c.h >= c.w;
    const stripes = 5;
    for (let i = 0; i < stripes; i++) {
      if (i % 2 === 0) continue;
      const k0 = 0.08 + (i / stripes) * (c.h - 0.16);
      const k1 = 0.08 + ((i + 1) / stripes) * (c.h - 0.16);
      const pts = along
        ? [tileToScreen(0.12, k0), tileToScreen(c.w - 0.12, k0), tileToScreen(c.w - 0.12, k1), tileToScreen(0.12, k1)]
        : [tileToScreen(k0, 0.12), tileToScreen(k1, 0.12), tileToScreen(k1, c.h - 0.12), tileToScreen(k0, c.h - 0.12)];
      g.poly(pts).fill(i === 1 ? c.side : WHITE);
    }
    // flip-flops
    const f = tileToScreen(c.w * 0.5, c.h * 0.8);
    g.ellipse(f.x - 5, f.y, 3, 6).fill(PALETTE[13]).stroke({ width: 1, color: INK });
    g.ellipse(f.x + 4, f.y + 2, 3, 6).fill(PALETTE[13]).stroke({ width: 1, color: INK });
  },
};
