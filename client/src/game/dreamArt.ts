import { Graphics } from 'pixi.js';
import { PALETTE, tileToScreen } from '@dovey/shared';
import { box, heart, shade } from './furnitureArt';
import { Painter, Pt, diamondAt, glowAt, panel, rnd, shadowAt, wallMap } from './labArt';

/** Dream Suite furniture: pastel, glowy, photo-ready pieces with looping animation. */

const TAU = Math.PI * 2;
const INK = PALETTE[0];
const WHITE = 0xffffff;
const GOLD = PALETTE[17];
const PASTEL = [PALETTE[6], PALETTE[8], PALETTE[31], PALETTE[12], PALETTE[30]];

const lift = (tx: number, ty: number, z: number): Pt => {
  const p = tileToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
};

function sparkle(g: Graphics, x: number, y: number, r: number, col: number, a: number) {
  g.poly([
    { x, y: y - r },
    { x: x + r * 0.25, y: y - r * 0.25 },
    { x: x + r, y },
    { x: x + r * 0.25, y: y + r * 0.25 },
    { x, y: y + r },
    { x: x - r * 0.25, y: y + r * 0.25 },
    { x: x - r, y },
    { x: x - r * 0.25, y: y - r * 0.25 },
  ]).fill({ color: col, alpha: a });
}

function star5(g: Graphics, x: number, y: number, r: number) {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  return g.poly(pts);
}

/** where the "back" of a seat sits for a rotation (opposite the facing) */
function backOffset(rot: number, w: number, h: number): Pt {
  return [tileToScreen(w / 2, 0.15), tileToScreen(w - 0.15, h / 2), tileToScreen(w / 2, h - 0.15), tileToScreen(0.15, h / 2)][rot % 4];
}

export const DREAM_PAINTERS: Record<string, Painter> = {
  // ---- wall pieces

  wall_dream(g, c) {
    const id = c.def.id;
    if (id === 'neon_wings') {
      const P = wallMap(c, 12, 94);
      const pulse = 0.65 + 0.35 * Math.sin(c.t * TAU);
      const m = P(0.5, 0.5);
      glowAt(g, m.x, m.y, 70, c.side, 0.18 * pulse);
      for (const side of [-1, 1]) {
        // each wing: feathers fanning out from the centre
        for (let f = 0; f < 6; f++) {
          const k = f / 5;
          const tip = P(0.5 + side * (0.12 + k * 0.32), 0.25 + k * 0.6);
          const mid = P(0.5 + side * (0.08 + k * 0.18), 0.15 + k * 0.5);
          const base = P(0.5 + side * 0.05, 0.42);
          g.moveTo(base.x, base.y).quadraticCurveTo(mid.x, mid.y, tip.x, tip.y).stroke({ width: 5, color: c.side, alpha: 0.25 * pulse });
          g.moveTo(base.x, base.y).quadraticCurveTo(mid.x, mid.y, tip.x, tip.y).stroke({ width: 2, color: WHITE, alpha: 0.6 + 0.4 * pulse });
        }
      }
      const halo = P(0.5, 0.9);
      g.ellipse(halo.x, halo.y, 14, 4).stroke({ width: 4, color: GOLD, alpha: 0.35 * pulse });
      g.ellipse(halo.x, halo.y, 14, 4).stroke({ width: 1.5, color: PALETTE[30] });
      heart(g, m.x, m.y + 4, 6, c.side, 0.6 + 0.4 * pulse);
      for (let i = 0; i < 6; i++) {
        const s = P(0.1 + rnd(i) * 0.8, 0.1 + rnd(i + 20) * 0.85);
        sparkle(g, s.x, s.y, 2 + rnd(i + 5) * 3, WHITE, Math.abs(Math.sin((c.t + rnd(i + 9)) * TAU)));
      }
      return;
    }
    if (id === 'photo_wall') {
      const P = wallMap(c, 22, 88);
      panel(g, P, 0.03, 0, 0.97, 1).fill(shade(c.top, 1.1)).stroke({ width: 2.5, color: INK });
      for (let i = 0; i < 14; i++) {
        const s = P(0.07 + rnd(i) * 0.86, 0.05 + rnd(i + 30) * 0.9);
        g.circle(s.x, s.y, 3 + rnd(i + 3) * 2).fill(PASTEL[i % PASTEL.length]);
        g.circle(s.x, s.y, 1.2).fill(PALETTE[16]);
      }
      // fairy-light string with polaroids clipped on, swaying
      const a = P(0.06, 0.8);
      const b = P(0.94, 0.8);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 + 10;
      g.moveTo(a.x, a.y).quadraticCurveTo(mx, my, b.x, b.y).stroke({ width: 1.2, color: INK });
      for (let i = 0; i < 9; i++) {
        const k = (i + 0.5) / 9;
        const u = 1 - k;
        const x = u * u * a.x + 2 * u * k * mx + k * k * b.x;
        const y = u * u * a.y + 2 * u * k * my + k * k * b.y;
        const lit = (i + c.frame) % 3 !== 0;
        if (lit) glowAt(g, x, y + 2, 5, PALETTE[30], 0.6);
        g.circle(x, y + 2, 1.6).fill(lit ? PALETTE[30] : shade(PALETTE[30], 0.5));
        if (i % 2 === 1) {
          const sw = Math.sin(c.t * TAU + i) * 0.12;
          const cx = x;
          const cy = y + 14;
          const pts: Pt[] = [
            [-6, -8],
            [6, -8],
            [6, 8],
            [-6, 8],
          ].map(([dx, dy]) => ({ x: cx + dx * Math.cos(sw) - dy * Math.sin(sw), y: cy + dx * Math.sin(sw) + dy * Math.cos(sw) }));
          g.poly(pts).fill(WHITE).stroke({ width: 1, color: INK });
          g.circle(cx, cy - 2, 3.5).fill(PASTEL[(i + 2) % PASTEL.length]);
        }
      }
      return;
    }
    // heart_mirror: three gold heart mirrors with a shine sweeping across
    const P = wallMap(c, 30, 86);
    [0.22, 0.5, 0.78].forEach((u, i) => {
      const p = P(u, i === 1 ? 0.55 : 0.45);
      const r = i === 1 ? 14 : 10;
      heart(g, p.x, p.y, r + 3, GOLD);
      heart(g, p.x, p.y, r, PALETTE[31]);
      const k = (c.t + i * 0.2) % 1;
      g.moveTo(p.x - r + k * r * 2, p.y - r * 0.6).lineTo(p.x - r + k * r * 2 + 4, p.y + r * 0.5).stroke({ width: 2.5, color: WHITE, alpha: 0.7 * Math.sin(k * Math.PI) });
    });
  },

  // ---- floor pieces

  canopy_bed(g, c) {
    const T = c.def.tall;
    const sway = Math.sin(c.t * TAU) * 3;
    shadowAt(g, c.cx, c.cy + 6, 58, 24, 0.16);
    const posts: Array<[number, number]> = [
      [0.1, 0.1],
      [c.w - 0.1, 0.1],
      [c.w - 0.1, c.h - 0.1],
      [0.1, c.h - 0.1],
    ];
    const post = (i: number) => {
      const p = lift(posts[i][0], posts[i][1], 0);
      g.rect(p.x - 1.5, p.y - T, 3, T).fill(GOLD).stroke({ width: 0.8, color: INK });
      g.circle(p.x, p.y - T - 2, 2.5).fill(GOLD);
    };
    post(0);
    post(1);
    post(3);
    // back drapes
    for (const i of [0, 1]) {
      const top = lift(posts[i][0], posts[i][1], T - 4);
      g.poly([{ x: top.x - 10, y: top.y }, { x: top.x + 10, y: top.y }, { x: top.x + 6, y: top.y + T - 20 }, { x: top.x - 6, y: top.y + T - 20 }]).fill({ color: c.top, alpha: 0.35 });
    }
    box(g, 0.08, 0.08, c.w - 0.16, c.h - 0.16, 0, 14, WHITE, PALETTE[24]);
    box(g, 0.12, 0.12, c.w - 0.24, c.h - 0.24, 14, 6, PALETTE[1], PALETTE[24]);
    box(g, 0.12, 0.8, c.w - 0.24, c.h - 0.92, 20, 3, c.side, shade(c.side, 0.85));
    // heart pillows
    const pl = lift(c.w * 0.35, 0.45, 26);
    const pr = lift(c.w * 0.65, 0.45, 26);
    heart(g, pl.x, pl.y, 9, c.top);
    heart(g, pr.x, pr.y, 9, WHITE);
    // sheer canopy roof
    const roof = posts.map(([x, y]) => lift(x, y, T));
    g.poly(roof).fill({ color: c.top, alpha: 0.28 }).stroke({ width: 1.5, color: GOLD });
    // fairy lights along the canopy edges
    for (let i = 0; i < 4; i++) {
      const a = roof[i];
      const b = roof[(i + 1) % 4];
      for (let s = 0; s < 5; s++) {
        const k = (s + 0.5) / 5;
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k + 4 * Math.sin(k * Math.PI);
        const lit = (s + i + c.frame) % 3 !== 0;
        if (lit) glowAt(g, x, y, 5, PALETTE[30], 0.55);
        g.circle(x, y, 1.5).fill(lit ? PALETTE[30] : shade(PALETTE[30], 0.5));
      }
    }
    // front drapes tied with bows, swaying
    for (const i of [3, 2]) {
      post(i);
      const top = roof[i];
      g.poly([
        { x: top.x - 8, y: top.y + 2 },
        { x: top.x + 8, y: top.y + 2 },
        { x: top.x + 3 + sway, y: top.y + T - 12 },
        { x: top.x - 5 + sway, y: top.y + T - 12 },
      ]).fill({ color: c.top, alpha: 0.55 });
      heart(g, top.x + sway * 0.5, top.y + T * 0.45, 4, PALETTE[7]);
    }
  },

  vanity(g, c) {
    const T = c.def.tall;
    const along = c.w >= c.h;
    shadowAt(g, c.cx, c.cy + 3, 34, 13);
    box(g, 0.08, 0.2, c.w - 0.16, c.h - 0.4, 0, 30, c.top, PALETTE[24]);
    for (const k of [0.3, 0.7]) {
      const p = along ? lift(k * c.w, c.h - 0.2, 16) : lift(c.w - 0.2, k * c.h, 16);
      g.circle(p.x, p.y, 2).fill(GOLD);
    }
    // heart mirror with chasing bulbs
    const m = lift(c.w / 2, c.h / 2, T - 22);
    heart(g, m.x, m.y, 26, GOLD);
    heart(g, m.x, m.y, 22, PALETTE[31]);
    g.moveTo(m.x - 12, m.y - 10).lineTo(m.x - 4, m.y + 6).stroke({ width: 3, color: WHITE, alpha: 0.6 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const bx = m.x + Math.cos(a) * 27;
      const by = m.y + Math.sin(a) * 24 - 3;
      const lit = c.on && (i + c.frame) % 4 !== 0;
      if (lit) glowAt(g, bx, by, 6, PALETTE[30], 0.5);
      g.circle(bx, by, 2).fill(lit ? PALETTE[30] : shade(PALETTE[30], 0.45));
    }
    // perfume + lipstick on the top
    const top = (k: number) => (along ? lift(0.2 + k * (c.w - 0.4), 0.5, 32) : lift(0.5, 0.2 + k * (c.h - 0.4), 32));
    let p = top(0.1);
    g.roundRect(p.x - 4, p.y - 10, 8, 10, 3).fill({ color: c.side, alpha: 0.8 }).stroke({ width: 1, color: INK });
    g.rect(p.x - 1.5, p.y - 13, 3, 3).fill(GOLD);
    p = top(0.9);
    g.rect(p.x - 2, p.y - 9, 4, 9).fill(GOLD).stroke({ width: 0.8, color: INK });
    g.rect(p.x - 2, p.y - 13, 4, 4).fill(PALETTE[5]);
  },

  heart_chair(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 14, 6);
    const back = backOffset(c.rot, c.w, c.h);
    const drawBack = () => {
      heart(g, back.x, back.y - 26, 16, INK);
      heart(g, back.x, back.y - 26, 14, c.top);
      heart(g, back.x, back.y - 25, 8, shade(c.top, 1.15));
    };
    const behind = c.rot % 4 === 0 || c.rot % 4 === 3;
    if (behind) drawBack();
    for (const dx of [-8, 8]) g.rect(x + dx - 1, y - 10, 2, 10).fill(GOLD);
    g.ellipse(x, y - 11, 13, 6).fill(c.side).stroke({ width: 1.5, color: INK });
    if (!behind) drawBack();
  },

  cloud_sofa(g, c) {
    const along = c.w >= c.h;
    const r = c.rot % 4;
    shadowAt(g, c.cx, c.cy + 4, 40, 14);
    const at = (k: number, side: number, z: number) =>
      along ? lift(0.1 + k * (c.w - 0.2), c.h / 2 + side * 0.25, z) : lift(c.w / 2 + side * 0.25, 0.1 + k * (c.h - 0.2), z);
    const backSide = r === 0 || r === 3 ? -1 : 1;
    const puff = (side: number, z: number, rad: number, col: number) => {
      for (let i = 0; i < 5; i++) {
        const p = at(i / 4, side, z);
        g.circle(p.x, p.y, rad + 2).fill(INK);
      }
      for (let i = 0; i < 5; i++) {
        const p = at(i / 4, side, z);
        g.circle(p.x, p.y, rad).fill(col);
        g.circle(p.x - rad * 0.3, p.y - rad * 0.3, rad * 0.35).fill({ color: WHITE, alpha: 0.6 });
      }
    };
    if (backSide < 0) puff(-1, 22, 10, c.top);
    puff(0, 9, 11, shade(c.top, 0.96));
    if (backSide > 0) puff(1, 22, 10, c.top);
    const mid = at(0.5, 0, 16);
    heart(g, mid.x, mid.y, 5, PALETTE[6]);
  },

  teddy_giant(g, c) {
    const x = c.cx;
    const y = c.cy;
    const fur = c.top;
    shadowAt(g, x, y + 2, 20, 8);
    g.ellipse(x - 10, y - 4, 7, 5).fill(fur).stroke({ width: 1.5, color: INK });
    g.ellipse(x + 10, y - 4, 7, 5).fill(fur).stroke({ width: 1.5, color: INK });
    g.ellipse(x, y - 20, 16, 18).fill(fur).stroke({ width: 2, color: INK });
    g.ellipse(x, y - 17, 9, 11).fill(shade(fur, 1.3));
    // waving arm
    const wave = Math.sin(c.t * TAU) * 0.5;
    g.ellipse(x - 16, y - 24, 5, 9).fill(fur).stroke({ width: 1.5, color: INK });
    const ax = x + 16 + Math.sin(wave) * 4;
    const ay = y - 34 - Math.cos(wave) * 4;
    g.ellipse(ax, ay, 5, 9).fill(fur).stroke({ width: 1.5, color: INK });
    // head
    const hy = y - 46;
    for (const s of [-1, 1]) {
      g.circle(x + s * 12, hy - 11, 6).fill(fur).stroke({ width: 1.5, color: INK });
      g.circle(x + s * 12, hy - 11, 3).fill(PALETTE[6]);
    }
    g.circle(x, hy, 15).fill(fur).stroke({ width: 2, color: INK });
    g.ellipse(x, hy + 5, 7, 5).fill(shade(fur, 1.3));
    g.ellipse(x, hy + 3, 2.5, 1.8).fill(INK);
    if (c.frame === 5) {
      g.moveTo(x - 8, hy - 2).lineTo(x - 3, hy - 2).moveTo(x + 3, hy - 2).lineTo(x + 8, hy - 2).stroke({ width: 1.5, color: INK });
    } else {
      g.circle(x - 5, hy - 2, 2).fill(INK);
      g.circle(x + 5, hy - 2, 2).fill(INK);
    }
    g.circle(x - 10, hy + 4, 2.5).fill({ color: PALETTE[7], alpha: 0.5 });
    g.circle(x + 10, hy + 4, 2.5).fill({ color: PALETTE[7], alpha: 0.5 });
    // bow tie
    g.poly([{ x, y: hy + 15 }, { x: x - 8, y: hy + 11 }, { x: x - 8, y: hy + 19 }]).fill(c.side).stroke({ width: 1, color: INK });
    g.poly([{ x, y: hy + 15 }, { x: x + 8, y: hy + 11 }, { x: x + 8, y: hy + 19 }]).fill(c.side).stroke({ width: 1, color: INK });
    g.circle(x, hy + 15, 2).fill(c.side);
  },

  cake_stand(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 14, 6);
    g.rect(x - 2, y - 12, 4, 10).fill(GOLD);
    g.ellipse(x, y - 1, 9, 4).fill(GOLD).stroke({ width: 1, color: INK });
    g.ellipse(x, y - 12, 17, 6).fill(WHITE).stroke({ width: 1.2, color: INK });
    const tiers: Array<[number, number, number]> = [
      [14, 10, c.top],
      [10, 9, c.side],
      [6, 8, WHITE],
    ];
    let base = y - 13;
    tiers.forEach(([rw, h, col]) => {
      g.rect(x - rw, base - h, rw * 2, h).fill(col).stroke({ width: 1, color: INK });
      g.ellipse(x, base - h, rw, rw * 0.35).fill(shade(col, 1.08)).stroke({ width: 1, color: INK });
      for (let i = 0; i < 4; i++) g.ellipse(x - rw + 2 + i * ((rw * 2 - 4) / 3), base - h + 2, 2, 3).fill(WHITE);
      base -= h;
    });
    // candle with flicker + sparkles
    g.rect(x - 1, base - 9, 2, 8).fill(PALETTE[31]);
    const f = 1 + 0.25 * Math.sin(c.t * TAU * 2);
    glowAt(g, x, base - 12, 8, PALETTE[16], 0.5);
    g.ellipse(x, base - 12, 1.8, 3.5 * f).fill(PALETTE[18]);
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      sparkle(g, x - 14 + i * 14, base - 4 - k * 14, 2.5, WHITE, 1 - k);
    }
  },

  boba_bar(g, c) {
    const T = c.def.tall;
    const along = c.w >= c.h;
    shadowAt(g, c.cx, c.cy + 3, 36, 13);
    box(g, 0.06, 0.2, c.w - 0.12, c.h - 0.4, 0, 34, c.top, shade(c.top, 0.85));
    box(g, 0.02, 0.16, c.w - 0.04, c.h - 0.32, 34, 4, c.side, shade(c.side, 0.85));
    const top = (k: number) => (along ? lift(0.2 + k * (c.w - 0.4), 0.5, 38) : lift(0.5, 0.2 + k * (c.h - 0.4), 38));
    const teas = [PALETTE[3], PALETTE[8], PALETTE[12]];
    teas.forEach((col, i) => {
      const p = top(i / 2);
      g.poly([{ x: p.x - 5, y: p.y - 14 }, { x: p.x + 5, y: p.y - 14 }, { x: p.x + 4, y: p.y }, { x: p.x - 4, y: p.y }]).fill({ color: col, alpha: 0.9 }).stroke({ width: 1, color: INK });
      for (let j = 0; j < 4; j++) g.circle(p.x - 3 + j * 2, p.y - 2 - (j % 2), 1.3).fill(PALETTE[21]);
      g.ellipse(p.x, p.y - 14, 5, 1.8).fill(WHITE).stroke({ width: 0.8, color: INK });
      g.moveTo(p.x + 1, p.y - 14).lineTo(p.x + 3, p.y - 22).stroke({ width: 2, color: PASTEL[(i + 1) % PASTEL.length] });
      if (!c.on) return;
      for (let b = 0; b < 2; b++) {
        const k = (c.t + b / 2 + i * 0.3) % 1;
        g.circle(p.x - 2 + b * 3, p.y - 4 - k * 9, 1).fill({ color: WHITE, alpha: 1 - k });
      }
    });
    // heart menu sign
    const s = lift(c.w / 2, c.h / 2, T - 4);
    heart(g, s.x, s.y, 10, c.side);
    heart(g, s.x, s.y, 6, c.on ? PALETTE[7] : shade(PALETTE[7], 0.5));
  },

  swing_chair(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 20, 8);
    // arch frame
    g.moveTo(x - 20, y).lineTo(x - 20, y - T + 20).quadraticCurveTo(x, y - T - 8, x + 20, y - T + 20).lineTo(x + 20, y).stroke({ width: 5, color: INK });
    g.moveTo(x - 20, y).lineTo(x - 20, y - T + 20).quadraticCurveTo(x, y - T - 8, x + 20, y - T + 20).lineTo(x + 20, y).stroke({ width: 3, color: c.top });
    const sw = Math.sin(c.t * TAU) * 4;
    const seatY = y - 16;
    const topY = y - T + 8;
    for (const dx of [-10, 10]) {
      g.moveTo(x + dx, topY).lineTo(x + dx + sw, seatY).stroke({ width: 1.5, color: PALETTE[15] });
      for (let i = 1; i < 6; i++) {
        const k = i / 6;
        g.circle(x + dx + sw * k, topY + (seatY - topY) * k, 2.6).fill(PASTEL[(i + (dx > 0 ? 2 : 0)) % PASTEL.length]);
        g.circle(x + dx + sw * k, topY + (seatY - topY) * k, 0.9).fill(PALETTE[16]);
      }
    }
    g.roundRect(x - 13 + sw, seatY - 3, 26, 6, 3).fill(c.side).stroke({ width: 1.5, color: INK });
    heart(g, x + sw, seatY, 3, WHITE);
  },

  heart_disco(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 12, 5);
    g.ellipse(x, y - 2, 9, 4).fill(PALETTE[26]).stroke({ width: 1, color: INK });
    g.rect(x - 1.2, y - T + 28, 2.4, T - 30).fill(PALETTE[25]);
    const hy = y - T + 16;
    if (c.on) {
      // light specks sweeping the floor
      for (let i = 0; i < 10; i++) {
        const a = c.t * TAU + (i / 10) * TAU;
        const r = 26 + (i % 3) * 12;
        g.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, 3, 1.5).fill({ color: PASTEL[i % PASTEL.length], alpha: 0.7 });
      }
      glowAt(g, x, hy, 30, c.top, 0.35);
    }
    heart(g, x, hy, 17, INK);
    heart(g, x, hy, 15, c.side);
    // mirror tiles shimmer
    for (let row = -2; row <= 2; row++)
      for (let col = -2; col <= 2; col++) {
        const px = x + col * 5 + (row % 2) * 2.5;
        const py = hy + row * 5 - 2;
        if (Math.abs(col) + Math.abs(row) > 3) continue;
        const lit = (row * 3 + col * 5 + c.frame) % 4 === 0;
        g.rect(px - 1.8, py - 1.8, 3.6, 3.6).fill(lit ? WHITE : shade(c.top, 1.05));
      }
  },

  fluffy_rug(g, c) {
    diamondAt(g, 0.2, 0.2, c.w - 0.4, c.h - 0.4, shade(c.side, 1.1), 6, 0.5);
    const x = c.cx;
    const y = c.cy;
    const blobs: Array<[number, number, number]> = [
      [-28, 2, 16],
      [-12, -8, 18],
      [8, -10, 20],
      [26, -2, 16],
      [14, 8, 18],
      [-10, 8, 18],
    ];
    for (const [dx, dy, r] of blobs) g.ellipse(x + dx, y + dy, r + 2, (r + 2) * 0.55).fill(shade(c.side, 0.85));
    for (const [dx, dy, r] of blobs) g.ellipse(x + dx, y + dy - 1, r, r * 0.55).fill(c.top);
    for (let i = 0; i < 6; i++) {
      const tw = Math.abs(Math.sin((c.t + rnd(i + 7)) * TAU));
      sparkle(g, x + (rnd(i) * 2 - 1) * 34, y + (rnd(i + 11) * 2 - 1) * 12, 2 + tw * 2.5, i % 2 ? PALETTE[6] : PALETTE[30], tw);
    }
  },

  star_lamp(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 1, 10, 4);
    g.ellipse(x, y - 2, 8, 4).fill(GOLD).stroke({ width: 1, color: INK });
    g.rect(x - 1, y - T + 18, 2, T - 20).fill(GOLD);
    const sy = y - T + 10 + Math.sin(c.t * TAU) * 1.5;
    if (c.on) glowAt(g, x, sy, 26, c.top, 0.45);
    star5(g, x, sy, 11).fill(c.on ? c.top : shade(c.top, 0.55)).stroke({ width: 1.5, color: INK });
    if (!c.on) return;
    for (let i = 0; i < 3; i++) {
      const a = c.t * TAU + (i * TAU) / 3;
      sparkle(g, x + Math.cos(a) * 16, sy + Math.sin(a) * 6, 2.5, c.side, 0.9);
    }
  },

  bunny_plush(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 12, 5);
    g.ellipse(x, y - 8, 10, 9).fill(c.top).stroke({ width: 1.5, color: INK });
    const hy = y - 20;
    const twitch = c.frame === 3 || c.frame === 4 ? -0.35 : 0;
    for (const s of [-1, 1]) {
      const ang = s * 0.2 + (s > 0 ? twitch : 0);
      const ex = x + s * 4 + Math.sin(ang) * 8;
      const ey = hy - 12 - Math.cos(ang) * 2;
      g.ellipse(ex, ey, 3.5, 9).fill(c.top).stroke({ width: 1.5, color: INK });
      g.ellipse(ex, ey + 1, 1.6, 6).fill(c.side);
    }
    g.circle(x, hy, 8).fill(c.top).stroke({ width: 1.5, color: INK });
    g.circle(x - 3, hy - 1, 1.2).fill(INK);
    g.circle(x + 3, hy - 1, 1.2).fill(INK);
    g.circle(x - 5, hy + 2, 1.8).fill({ color: c.side, alpha: 0.6 });
    g.circle(x + 5, hy + 2, 1.8).fill({ color: c.side, alpha: 0.6 });
    g.poly([{ x: x - 1.2, y: hy + 1.5 }, { x: x + 1.2, y: hy + 1.5 }, { x, y: hy + 3 }]).fill(c.side);
    heart(g, x, y - 8, 3, c.side);
  },
};
