import { Graphics } from 'pixi.js';
import { PALETTE, TILE_W, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { box, shade } from './furnitureArt';

/**
 * Along Rocket Lab furniture: space-age pieces with looping animation. Same
 * contract as furnitureArt painters (origin = top corner of tile 0,0; baked
 * into the atlas per rotation/frame/on).
 */

type Painter = (g: Graphics, c: ArtCtx) => void;
type Pt = { x: number; y: number };

const TAU = Math.PI * 2;
const INK = PALETTE[0];
const CYAN = 0x7ef9ff;
const NEON = [PALETTE[7], PALETTE[9], PALETTE[11], PALETTE[13], PALETTE[16]];

/** stable 0..1 hash so stars and specks don't jump between frames */
function rnd(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function glowAt(g: Graphics, x: number, y: number, r: number, col: number, a: number) {
  g.circle(x, y, r).fill({ color: col, alpha: a * 0.3 });
  g.circle(x, y, r * 0.6).fill({ color: col, alpha: a * 0.45 });
  g.circle(x, y, r * 0.28).fill({ color: col, alpha: a });
}

function shadowAt(g: Graphics, x: number, y: number, rx: number, ry: number, a = 0.2) {
  g.ellipse(x, y, rx, ry).fill({ color: INK, alpha: a });
}

function diamondPts(tx: number, ty: number, w: number, h: number, inset: number, z: number): Pt[] {
  const i = inset / TILE_W;
  return [tileToScreen(tx + i, ty + i), tileToScreen(tx + w - i, ty + i), tileToScreen(tx + w - i, ty + h - i), tileToScreen(tx + i, ty + h - i)].map((p) => ({
    x: p.x,
    y: p.y - z,
  }));
}

function diamondAt(g: Graphics, tx: number, ty: number, w: number, h: number, col: number, inset = 0, alpha = 1, z = 0) {
  g.poly(diamondPts(tx, ty, w, h, inset, z)).fill({ color: col, alpha });
}

function diamondStroke(g: Graphics, tx: number, ty: number, w: number, h: number, col: number, width: number, inset = 0) {
  g.poly(diamondPts(tx, ty, w, h, inset, 0)).stroke({ width, color: col });
}

/** Map (u along the wall 0..1, v up the wall 0..1) onto a wall panel between z0 and z1 px. rot 0/2 = y=0 wall, 1/3 = x=0 wall. */
function wallMap(c: ArtCtx, z0: number, z1: number) {
  const along = c.rot % 2 === 0;
  const a = tileToScreen(0, 0);
  const b = along ? tileToScreen(c.w, 0) : tileToScreen(0, c.h);
  return (u: number, v: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - (z0 + (z1 - z0) * v) });
}

function panel(g: Graphics, P: (u: number, v: number) => Pt, u0: number, v0: number, u1: number, v1: number) {
  return g.poly([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]);
}

function line(g: Graphics, a: Pt, b: Pt) {
  return g.moveTo(a.x, a.y).lineTo(b.x, b.y);
}

function zz(g: Graphics, x: number, y: number, s: number, a: number) {
  g.moveTo(x - s, y - s).lineTo(x + s, y - s).lineTo(x - s, y + s).lineTo(x + s, y + s).stroke({ width: 1.5, color: 0xffffff, alpha: a });
}

export const LAB_PAINTERS: Record<string, Painter> = {
  // ---- wall pieces (walkable; drawn up on the back wall)

  wall_art(g, c) {
    const P = wallMap(c, 26, 86);
    panel(g, P, 0.02, -0.05, 0.98, 1.05).fill({ color: INK, alpha: 0.25 });
    panel(g, P, 0.05, 0, 0.95, 1).fill(PALETTE[29]).stroke({ width: 2.5, color: INK });
    const id = c.def.id;

    if (id === 'art_planet') {
      panel(g, P, 0.1, 0.08, 0.9, 0.92).fill(0x1b1640);
      for (let i = 0; i < 14; i++) {
        const s = P(0.12 + rnd(i) * 0.76, 0.1 + rnd(i + 40) * 0.8);
        g.circle(s.x, s.y, 0.8 + rnd(i + 3)).fill({ color: 0xffffff, alpha: 0.3 + 0.7 * Math.abs(Math.sin((c.t + rnd(i + 9)) * TAU)) });
      }
      const pc = P(0.45, 0.5);
      const a = c.t * TAU;
      const moon = P(0.45 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3);
      const drawMoon = () => g.circle(moon.x, moon.y, 3.5).fill(PALETTE[24]).stroke({ width: 1, color: INK });
      if (Math.sin(a) > 0) drawMoon();
      glowAt(g, pc.x, pc.y, 22, c.side, 0.25);
      g.circle(pc.x, pc.y, 12).fill(c.side).stroke({ width: 1.5, color: INK });
      g.circle(pc.x - 3, pc.y - 3, 6).fill({ color: 0xffffff, alpha: 0.18 });
      g.ellipse(pc.x, pc.y + 1, 21, 5).stroke({ width: 2, color: PALETTE[16] });
      if (Math.sin(a) <= 0) drawMoon();
    } else if (id === 'art_wave') {
      const bands = [0xff6f91, 0xb8397f, 0x7a2477, 0x4a1d6b, 0x2a1650];
      bands.forEach((col, i) => panel(g, P, 0.1, 0.42 + i * 0.1, 0.9, 0.52 + i * 0.1).fill(col));
      const sun = P(0.5, 0.56);
      g.circle(sun.x, sun.y, 13).fill(PALETTE[16]);
      for (let i = 0; i < 3; i++) panel(g, P, 0.36, 0.5 - i * 0.045, 0.64, 0.515 - i * 0.045).fill(0xb8397f);
      panel(g, P, 0.1, 0.08, 0.9, 0.42).fill(0x140a2a);
      for (let i = 0; i < 7; i++) {
        const u = 0.1 + i * (0.8 / 6);
        line(g, P(0.5 + (u - 0.5) * 0.25, 0.42), P(u, 0.08)).stroke({ width: 1, color: c.top, alpha: 0.8 });
      }
      for (let i = 0; i < 4; i++) {
        const k = (i + c.t) / 4;
        const v = 0.42 - 0.34 * k * k;
        line(g, P(0.1, v), P(0.9, v)).stroke({ width: 1, color: c.top, alpha: 0.3 + 0.6 * k });
      }
    } else if (id === 'art_rocket') {
      panel(g, P, 0.1, 0.08, 0.9, 0.92).fill(0x0f1733);
      for (let i = 0; i < 12; i++) {
        const s = P(0.12 + rnd(i + 7) * 0.76, 0.92 - ((rnd(i) + c.t * 1.5) % 1) * 0.84);
        g.moveTo(s.x, s.y).lineTo(s.x, s.y - 4 - rnd(i + 2) * 5).stroke({ width: 1, color: 0xffffff, alpha: 0.25 + 0.5 * rnd(i + 5) });
      }
      const p = P(0.5, 0.45);
      const x = p.x;
      const y = p.y + Math.sin(c.t * TAU * 2) * 1.5;
      const fl = 7 + ((c.frame * 5) % 3) * 3;
      g.ellipse(x, y + 12 + fl / 2, 3.5, fl / 2 + 2).fill(PALETTE[18]);
      g.ellipse(x, y + 12 + fl / 3, 2, fl / 3 + 1).fill(PALETTE[30]);
      g.poly([{ x: x - 5, y: y + 6 }, { x: x - 9, y: y + 14 }, { x: x - 5, y: y + 12 }]).fill(c.side);
      g.poly([{ x: x + 5, y: y + 6 }, { x: x + 9, y: y + 14 }, { x: x + 5, y: y + 12 }]).fill(c.side);
      g.roundRect(x - 5, y - 10, 10, 23, 4).fill(PALETTE[27]).stroke({ width: 1.2, color: INK });
      g.moveTo(x - 5, y - 6).quadraticCurveTo(x, y - 22, x + 5, y - 6).closePath().fill(c.side).stroke({ width: 1.2, color: INK });
      g.circle(x, y - 1, 2.6).fill(PALETTE[10]).stroke({ width: 1, color: INK });
    } else {
      // art_circuit: data pulses racing along traces into a chip
      panel(g, P, 0.1, 0.08, 0.9, 0.92).fill(0x0c241f);
      const traces: Array<Array<[number, number]>> = [
        [[0.12, 0.3], [0.35, 0.3], [0.44, 0.48]],
        [[0.12, 0.76], [0.3, 0.76], [0.44, 0.6]],
        [[0.88, 0.2], [0.66, 0.2], [0.56, 0.46]],
        [[0.88, 0.82], [0.7, 0.82], [0.56, 0.6]],
      ];
      traces.forEach((tr, i) => {
        const pts = tr.map(([u, v]) => P(u, v));
        g.moveTo(pts[0].x, pts[0].y).lineTo(pts[1].x, pts[1].y).lineTo(pts[2].x, pts[2].y).stroke({ width: 1.5, color: c.side, alpha: 0.55 });
        g.circle(pts[0].x, pts[0].y, 1.8).fill(c.side);
        const k = (c.t + i / 4) % 1;
        const [a, b, f] = k < 0.5 ? [pts[0], pts[1], k * 2] : [pts[1], pts[2], (k - 0.5) * 2];
        glowAt(g, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 5, CYAN, 0.9);
      });
      panel(g, P, 0.42, 0.4, 0.58, 0.68).fill(0x1c1c1c).stroke({ width: 1, color: c.side });
      const m = P(0.5, 0.54);
      glowAt(g, m.x, m.y, 8, c.side, 0.45 + 0.4 * Math.sin(c.t * TAU));
    }
    panel(g, P, 0.1, 0.62, 0.3, 0.9).fill({ color: 0xffffff, alpha: 0.06 });
  },

  space_window(g, c) {
    const P = wallMap(c, 20, 90);
    panel(g, P, 0, -0.05, 1, 1.05).fill({ color: INK, alpha: 0.25 });
    panel(g, P, 0.02, 0, 0.98, 1).fill(PALETTE[26]).stroke({ width: 3, color: INK });
    panel(g, P, 0.06, 0.08, 0.94, 0.92).fill(0x07061a);
    for (let i = 0; i < 26; i++) {
      const s = P(0.07 + ((rnd(i) + c.t * 0.25) % 1) * 0.86, 0.1 + rnd(i + 11) * 0.8);
      g.circle(s.x, s.y, 0.8 + rnd(i + 4) * 1.1).fill({ color: 0xffffff, alpha: 0.4 + 0.6 * Math.abs(Math.sin((c.t * 2 + rnd(i)) * TAU)) });
    }
    // earth with continents rolling across
    const e = P(0.3, 0.44);
    const R = 17;
    glowAt(g, e.x, e.y, 32, 0x7ecbff, 0.25);
    g.circle(e.x, e.y, R).fill(0x3f8fe0).stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 6; i++) {
      const dx = (((rnd(i + 20) + c.t) % 1) * 2 - 1) * R;
      const dy = (rnd(i + 30) * 2 - 1) * R * 0.6;
      const r = 3 + rnd(i + 33) * 3;
      const edge = Math.sqrt(Math.max(0, 1 - (dx / R) ** 2));
      if (dx * dx + dy * dy < (R - r) * (R - r)) g.ellipse(e.x + dx, e.y + dy, r * edge + 0.5, r * 0.8).fill(PALETTE[15]);
    }
    g.circle(e.x - 5, e.y - 6, 6).fill({ color: 0xffffff, alpha: 0.2 });
    const mn = P(0.72, 0.66);
    g.circle(mn.x, mn.y, 6).fill(PALETTE[24]).stroke({ width: 1, color: INK });
    g.circle(mn.x - 2, mn.y - 1, 1.5).fill(PALETTE[25]);
    const sat = P(0.08 + ((c.t * 0.9) % 1) * 0.84, 0.28);
    g.rect(sat.x - 1.5, sat.y - 1.5, 3, 3).fill(PALETTE[24]);
    g.rect(sat.x - 6, sat.y - 0.8, 3.5, 1.6).fill(PALETTE[11]);
    g.rect(sat.x + 2.5, sat.y - 0.8, 3.5, 1.6).fill(PALETTE[11]);
    if (c.frame % 3 === 0) glowAt(g, sat.x, sat.y, 4, PALETTE[5], 0.9);
    for (const u of [1 / 3, 2 / 3]) line(g, P(u, 0.08), P(u, 0.92)).stroke({ width: 3, color: PALETTE[26] });
    panel(g, P, 0.06, 0.55, 0.25, 0.9).fill({ color: 0xffffff, alpha: 0.05 });
  },

  // ---- floor pieces

  lava_lamp(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 12, 5);
    if (c.on) glowAt(g, x, y - T / 2, 30, c.top, 0.35);
    g.poly([{ x: x - 9, y: y - 1 }, { x: x + 9, y: y - 1 }, { x: x + 5, y: y - 13 }, { x: x - 5, y: y - 13 }]).fill(PALETTE[26]).stroke({ width: 1.5, color: INK });
    const gy = y - T + 4;
    const gh = T - 17;
    g.poly([
      { x: x - 5, y: y - 13 },
      { x: x + 5, y: y - 13 },
      { x: x + 7, y: gy + gh * 0.45 },
      { x: x + 3.5, y: gy },
      { x: x - 3.5, y: gy },
      { x: x - 7, y: gy + gh * 0.45 },
    ])
      .fill({ color: c.on ? c.top : shade(c.top, 0.5), alpha: 0.9 })
      .stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 4; i++) {
      const k = (c.t + i / 4) % 1;
      const w = Math.sin(k * Math.PI);
      g.circle(x + Math.sin((k + i * 0.3) * TAU) * 2 * w, y - 15 - k * (gh - 6), 2 + w * 2.4).fill(c.on ? PALETTE[16] : shade(PALETTE[16], 0.55));
    }
    g.roundRect(x - 4, gy - 6, 8, 6, 2).fill(PALETTE[26]).stroke({ width: 1.2, color: INK });
    g.rect(x - 3, gy + 3, 1.5, gh * 0.4).fill({ color: 0xffffff, alpha: 0.35 });
  },

  pod_bed(g, c) {
    const along = c.w >= c.h;
    const pulse = 0.5 + 0.5 * Math.sin(c.t * TAU);
    diamondAt(g, 0.1, 0.1, c.w - 0.2, c.h - 0.2, CYAN, 6, 0.12 + 0.12 * pulse);
    box(g, 0.05, 0.08, c.w - 0.1, c.h - 0.16, 6, 12, PALETTE[27], PALETTE[25]);
    box(g, 0.12, 0.14, c.w - 0.24, c.h - 0.28, 18, 4, PALETTE[31], PALETTE[10]);
    if (along) {
      box(g, 0.16, 0.22, 0.4, c.h - 0.44, 22, 4, PALETTE[27], PALETTE[24]);
      box(g, 0.7, 0.14, c.w - 0.82, c.h - 0.28, 22, 3, c.side, shade(c.side, 0.8));
    } else {
      box(g, 0.22, 0.16, c.w - 0.44, 0.4, 22, 4, PALETTE[27], PALETTE[24]);
      box(g, 0.14, 0.7, c.w - 0.28, c.h - 0.82, 22, 3, c.side, shade(c.side, 0.8));
    }
    const p0 = along ? tileToScreen(0.12, 0.5) : tileToScreen(0.5, 0.12);
    const p1 = along ? tileToScreen(c.w - 0.12, 0.5) : tileToScreen(0.5, c.h - 0.12);
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    g.moveTo(p0.x, p0.y - 20).quadraticCurveTo(mx, my - 80, p1.x, p1.y - 20).closePath().fill({ color: 0xbfe9ff, alpha: 0.16 }).stroke({ width: 2, color: 0xffffff, alpha: 0.65 });
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8;
      const q = along ? tileToScreen(0.05 + u * (c.w - 0.1), c.h - 0.08) : tileToScreen(c.w - 0.08, 0.05 + u * (c.h - 0.1));
      g.circle(q.x, q.y - 9, 1.6).fill(NEON[(i + c.frame) % NEON.length]);
    }
    zz(g, mx + 12 + c.t * 8, my - 44 - c.t * 14, 2.5 + c.t * 2, 1 - c.t);
  },

  holo_desk(g, c) {
    const along = c.w >= c.h;
    const L = along ? c.w : c.h;
    shadowAt(g, c.cx, c.cy + 2, 40, 15);
    const leg = (u: number) => (along ? box(g, u, 0.2, 0.1, c.h - 0.4, 0, 20, PALETTE[28], PALETTE[29]) : box(g, 0.2, u, c.w - 0.4, 0.1, 0, 20, PALETTE[28], PALETTE[29]));
    leg(0.1);
    leg(L - 0.2);
    box(g, 0.04, 0.12, c.w - 0.08, c.h - 0.24, 20, 5, PALETTE[27], PALETTE[25]);
    const e0 = along ? tileToScreen(0.04, c.h - 0.12) : tileToScreen(c.w - 0.12, 0.04);
    const e1 = along ? tileToScreen(c.w - 0.04, c.h - 0.12) : tileToScreen(c.w - 0.12, c.h - 0.04);
    line(g, { x: e0.x, y: e0.y - 21 }, { x: e1.x, y: e1.y - 21 }).stroke({ width: 2, color: CYAN, alpha: c.on ? 0.9 : 0.2 });
    for (let i = 0; i < 2; i++) {
      const m = along ? tileToScreen(0.5 + i, 0.35) : tileToScreen(0.35, 0.5 + i);
      const sx = m.x - 12;
      const sy = m.y - 45;
      g.rect(m.x - 1.5, sy + 16, 3, 8).fill(PALETTE[26]);
      g.roundRect(sx, sy, 24, 17, 2).fill(0x0d1b2a).stroke({ width: 1.5, color: INK });
      if (!c.on) continue;
      for (let j = 0; j < 4; j++) {
        const w = 5 + ((j * 7 + c.frame * 3 + i * 5) % 13);
        g.rect(sx + 3 + ((j + i) % 2) * 2, sy + 3 + j * 3.4, w, 1.6).fill(j % 2 ? PALETTE[14] : c.side);
      }
      glowAt(g, m.x, sy + 8, 16, c.side, 0.18);
    }
    if (!c.on) return;
    const hx = c.cx;
    const hy = c.cy - 70;
    g.moveTo(c.cx - 10, c.cy - 26).lineTo(hx - 11, hy + 4).moveTo(c.cx + 10, c.cy - 26).lineTo(hx + 11, hy + 4).stroke({ width: 1, color: CYAN, alpha: 0.3 });
    glowAt(g, hx, hy, 20, CYAN, 0.2);
    g.circle(hx, hy, 11).stroke({ width: 1.5, color: CYAN, alpha: 0.85 });
    for (const k of [-0.5, 0, 0.5]) g.ellipse(hx, hy + k * 11, 11 * Math.sqrt(1 - k * k), 2.5).stroke({ width: 1, color: CYAN, alpha: 0.55 });
    for (let i = 0; i < 2; i++) {
      const a = c.t * TAU + (i * Math.PI) / 2;
      g.ellipse(hx, hy, Math.abs(Math.cos(a)) * 11 + 0.3, 11).stroke({ width: 1, color: CYAN, alpha: 0.55 });
    }
  },

  server_rack(g, c) {
    const T = c.def.tall;
    shadowAt(g, c.cx, c.cy + 2, 22, 9);
    box(g, 0.15, 0.15, 0.7, 0.7, 0, T, PALETTE[28], PALETTE[29]);
    const cols = [PALETTE[13], PALETTE[16], CYAN, PALETTE[5]];
    for (let r = 0; r < 8; r++)
      for (let col = 0; col < 4; col++) {
        const q = tileToScreen(0.2 + (col + 0.5) * 0.15, 0.85);
        const z = 8 + r * ((T - 16) / 8);
        const lit = (r * 3 + col * 5 + c.frame) % 4 === 0;
        const colr = cols[(r + col) % 4];
        g.rect(q.x - 1.5, q.y - z - 1, 3, 2).fill(lit ? colr : shade(colr, 0.35));
      }
    const f = tileToScreen(0.85, 0.5);
    const fy = f.y - T + 14;
    g.circle(f.x, fy, 5).fill(0x111111).stroke({ width: 1, color: PALETTE[26] });
    for (let i = 0; i < 3; i++) {
      const a = c.t * TAU * 2 + (i * TAU) / 3;
      g.moveTo(f.x, fy).lineTo(f.x + Math.cos(a) * 4, fy + Math.sin(a) * 4).stroke({ width: 1.5, color: PALETTE[25] });
    }
  },

  holo_shelf(g, c) {
    const T = c.def.tall;
    const along = c.w >= c.h;
    const L = along ? c.w : c.h;
    const at = (u: number) => (along ? tileToScreen(u, 0.5) : tileToScreen(0.5, u));
    shadowAt(g, c.cx, c.cy + 2, 38, 14);
    for (const u of [0.12, L - 0.12]) {
      const p = at(u);
      g.rect(p.x - 1.5, p.y - T, 3, T).fill(PALETTE[25]).stroke({ width: 1, color: INK });
      g.circle(p.x, p.y - T, 2.5).fill(CYAN);
    }
    [12, 34, 56].forEach((z, si) => {
      if (along) box(g, 0.04, 0.25, c.w - 0.08, c.h - 0.5, z, 2, c.side, shade(c.side, 0.85));
      else box(g, 0.25, 0.04, c.w - 0.5, c.h - 0.08, z, 2, c.side, shade(c.side, 0.85));
      const a0 = along ? tileToScreen(0.04, c.h - 0.25) : tileToScreen(c.w - 0.25, 0.04);
      const a1 = along ? tileToScreen(c.w - 0.04, c.h - 0.25) : tileToScreen(c.w - 0.25, c.h - 0.04);
      line(g, { x: a0.x, y: a0.y - z }, { x: a1.x, y: a1.y - z }).stroke({ width: 1.5, color: CYAN, alpha: 0.4 + 0.6 * Math.abs(Math.sin((c.t + si * 0.2) * TAU)) });
    });
    const top = (u: number, z: number) => {
      const p = at(u * L);
      return { x: p.x, y: p.y - z - 2 };
    };
    // shelf 1: mini rocket + spinning crystal
    let p = top(0.3, 14);
    g.roundRect(p.x - 2.5, p.y - 11, 5, 11, 2).fill(PALETTE[27]).stroke({ width: 1, color: INK });
    g.poly([{ x: p.x - 2.5, y: p.y - 9 }, { x: p.x, y: p.y - 15 }, { x: p.x + 2.5, y: p.y - 9 }]).fill(PALETTE[5]);
    p = top(0.7, 14);
    const cw = 1 + 5 * Math.abs(Math.cos(c.t * TAU));
    glowAt(g, p.x, p.y - 7, 10, PALETTE[8], 0.3);
    g.poly([{ x: p.x, y: p.y - 15 }, { x: p.x + cw, y: p.y - 7 }, { x: p.x, y: p.y }, { x: p.x - cw, y: p.y - 7 }]).fill(PALETTE[8]).stroke({ width: 1, color: INK });
    // shelf 2: books + bubbling specimen jar
    p = top(0.25, 36);
    [PALETTE[11], PALETTE[7], PALETTE[16]].forEach((col, i) => {
      g.rect(p.x - 6 + i * 4, p.y - 10 + (i % 2), 3.5, 10 - (i % 2)).fill(col).stroke({ width: 0.8, color: INK });
    });
    p = top(0.72, 36);
    g.roundRect(p.x - 4, p.y - 10, 8, 10, 2).fill({ color: PALETTE[31], alpha: 0.6 }).stroke({ width: 1, color: INK });
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      g.circle(p.x - 2 + i * 2, p.y - 2 - k * 7, 1).fill({ color: PALETTE[14], alpha: 1 - k });
    }
    // shelf 3: ringed planet
    p = top(0.5, 58);
    g.circle(p.x, p.y - 6, 5).fill(PALETTE[18]).stroke({ width: 1, color: INK });
    g.ellipse(p.x, p.y - 6, 9, 2.5).stroke({ width: 1.2, color: PALETTE[30] });
  },

  rocket_model(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    box(g, 0.1, 0.1, 0.8, 0.8, 0, 6, PALETTE[26], PALETTE[28]);
    for (let i = 0; i < 3; i++) {
      const k = (c.t + i / 3) % 1;
      const dir = i % 2 ? 1 : -1;
      g.circle(x + dir * (6 + k * 18), y - 6 - k * 4, 3 + k * 5).fill({ color: 0xffffff, alpha: (1 - k) * 0.45 });
    }
    const top = y - T + 16;
    const base = y - 10;
    g.poly([{ x: x - 8, y: base - 14 }, { x: x - 15, y: base + 2 }, { x: x - 8, y: base - 2 }]).fill(c.side).stroke({ width: 1.2, color: INK });
    g.poly([{ x: x + 8, y: base - 14 }, { x: x + 15, y: base + 2 }, { x: x + 8, y: base - 2 }]).fill(c.side).stroke({ width: 1.2, color: INK });
    g.moveTo(x - 3, base).lineTo(x, base + 4 + (c.frame % 2) * 2).lineTo(x + 3, base).closePath().fill(PALETTE[18]);
    g.roundRect(x - 8, top, 16, base - top, 7).fill(PALETTE[27]).stroke({ width: 1.5, color: INK });
    g.rect(x - 8, base - 20, 16, 4).fill(c.side);
    g.moveTo(x - 8, top + 8).quadraticCurveTo(x, top - 22, x + 8, top + 8).closePath().fill(c.side).stroke({ width: 1.5, color: INK });
    g.circle(x, top + 18, 4.5).fill(PALETTE[10]).stroke({ width: 1.5, color: INK });
    g.circle(x - 1.5, top + 16.5, 1.5).fill({ color: 0xffffff, alpha: 0.8 });
    g.rect(x - 5, top + 28, 1.5, Math.max(4, base - top - 54)).fill({ color: 0xffffff, alpha: 0.5 });
    const blink = c.frame % 4 < 2;
    if (blink) glowAt(g, x, top - 9, 8, PALETTE[5], 0.5);
    g.circle(x, top - 9, 2).fill(blink ? PALETTE[5] : shade(PALETTE[5], 0.4));
  },

  telescope(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 18, 7);
    const hub = { x, y: y - 30 };
    for (const [dx, dy] of [
      [-13, 2],
      [12, 3],
      [1, 6],
    ])
      g.moveTo(hub.x, hub.y).lineTo(x + dx, y + dy).stroke({ width: 2.5, color: INK });
    const a = -0.55;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const px = -uy;
    const py = ux;
    const th = 4.5;
    const s = { x: hub.x - ux * 12, y: hub.y - uy * 12 };
    const e = { x: hub.x + ux * 22, y: hub.y + uy * 22 };
    g.poly([
      { x: s.x + px * th * 0.7, y: s.y + py * th * 0.7 },
      { x: e.x + px * th, y: e.y + py * th },
      { x: e.x - px * th, y: e.y - py * th },
      { x: s.x - px * th * 0.7, y: s.y - py * th * 0.7 },
    ])
      .fill(c.top)
      .stroke({ width: 1.5, color: INK });
    const b = { x: hub.x + ux * 6, y: hub.y + uy * 6 };
    g.moveTo(b.x + px * 5, b.y + py * 5).lineTo(b.x - px * 5, b.y - py * 5).stroke({ width: 3, color: c.side });
    g.ellipse(e.x, e.y, 2.5, th).fill(PALETTE[31]).stroke({ width: 1, color: INK });
    g.circle(hub.x, hub.y, 3).fill(c.side).stroke({ width: 1, color: INK });
    const tw = 0.5 + 0.5 * Math.sin(c.t * TAU);
    const sx = e.x + 10;
    const sy = e.y - 12;
    const r = 2 + tw * 3;
    g.poly([
      { x: sx, y: sy - r },
      { x: sx + r * 0.3, y: sy - r * 0.3 },
      { x: sx + r, y: sy },
      { x: sx + r * 0.3, y: sy + r * 0.3 },
      { x: sx, y: sy + r },
      { x: sx - r * 0.3, y: sy + r * 0.3 },
      { x: sx - r, y: sy },
      { x: sx - r * 0.3, y: sy - r * 0.3 },
    ]).fill({ color: PALETTE[30], alpha: 0.5 + tw * 0.5 });
  },

  orb_light(g, c) {
    const T = c.def.tall;
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 1, 12, 5);
    g.ellipse(x, y - 2, 10, 5).fill(PALETTE[28]).stroke({ width: 1.5, color: INK });
    g.rect(x - 1.5, y - T + 30, 3, T - 32).fill(PALETTE[25]);
    const oy = y - T + 14 + Math.sin(c.t * TAU) * 3;
    if (c.on) glowAt(g, x, oy, 34, c.top, 0.45);
    const sq = Math.abs(Math.sin(c.t * TAU));
    g.ellipse(x, oy, 15, 2 + 4 * sq).stroke({ width: 1.5, color: c.side, alpha: 0.9 });
    g.circle(x, oy, 8).fill(c.on ? c.top : shade(c.top, 0.5)).stroke({ width: 1.5, color: INK });
    g.circle(x - 3, oy - 3, 2.5).fill({ color: 0xffffff, alpha: 0.7 });
    if (!c.on) return;
    for (let i = 0; i < 3; i++) {
      const a = c.t * TAU + (i * TAU) / 3;
      g.circle(x + Math.cos(a) * 15, oy + Math.sin(a) * (2 + 4 * sq), 1.6).fill(0xffffff);
    }
  },

  alien_plant(g, c) {
    const x = c.cx;
    const y = c.cy;
    shadowAt(g, x, y + 2, 14, 6);
    box(g, 0.3, 0.3, 0.4, 0.4, 0, 12, PALETTE[26], PALETTE[28]);
    const baseY = y - 12;
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin((c.t + i * 0.33) * TAU) * 4;
      const bx = x - 6 + i * 6;
      const tipx = bx + (i - 1) * 8 + sway;
      const tipy = baseY - 18 - (i % 2) * 10;
      g.moveTo(bx, baseY).quadraticCurveTo(bx + (i - 1) * 2, baseY - 10, tipx, tipy).stroke({ width: 2.5, color: PALETTE[15] });
      g.ellipse((bx + tipx) / 2 + (i - 1) * 4, (baseY + tipy) / 2, 4, 2).fill(c.top);
      const pul = 0.5 + 0.5 * Math.sin((c.t * 2 + i * 0.3) * TAU);
      glowAt(g, tipx, tipy, 9, c.top, 0.3 * pul + 0.1);
      g.circle(tipx, tipy, 3 + pul).fill(c.side).stroke({ width: 1, color: INK });
    }
  },

  egg_chair(g, c) {
    const x = c.cx;
    const y = c.cy;
    const r = c.rot % 4;
    shadowAt(g, x, y + 2, 16, 7);
    // shell sits opposite the facing: rot0 -y, rot1 +x, rot2 +y, rot3 -x
    const off = [tileToScreen(0.5, 0.18), tileToScreen(0.82, 0.5), tileToScreen(0.5, 0.82), tileToScreen(0.18, 0.5)][r];
    const shell = () => {
      const sy = off.y - 26;
      g.ellipse(off.x, sy, 15, 19).fill(PALETTE[27]).stroke({ width: 2, color: INK });
      g.ellipse(off.x + (x - off.x) * 0.25, sy + 3, 10, 13).fill(shade(c.side, 1.15));
    };
    g.rect(x - 2, y - 10, 4, 9).fill(PALETTE[25]);
    g.ellipse(x, y - 1, 9, 4).fill(PALETTE[26]).stroke({ width: 1.2, color: INK });
    const behind = r === 0 || r === 3;
    if (behind) shell();
    g.ellipse(x, y - 13, 14, 7).fill(c.side).stroke({ width: 1.5, color: INK });
    if (!behind) shell();
  },

  rug_alien(g, c) {
    diamondAt(g, 0, 0, c.w, c.h, c.top, 4);
    diamondAt(g, 0, 0, c.w, c.h, shade(c.top, 0.85), 14);
    const x = c.cx;
    const y = c.cy;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + c.t * TAU * 0.25;
      g.circle(x + Math.cos(a) * 44, y + Math.sin(a) * 22, 1.8).fill({ color: c.side, alpha: 0.7 });
    }
    for (const s of [-1, 1]) {
      g.moveTo(x + s * 6, y - 12).quadraticCurveTo(x + s * 10, y - 24, x + s * 16, y - 26).stroke({ width: 2, color: INK });
      const pul = 0.5 + 0.5 * Math.sin((c.t + (s > 0 ? 0.5 : 0)) * TAU);
      glowAt(g, x + s * 16, y - 26, 7, PALETTE[16], 0.3 + 0.5 * pul);
      g.circle(x + s * 16, y - 26, 2.5).fill(PALETTE[16]);
    }
    g.ellipse(x, y, 24, 15).fill(c.side).stroke({ width: 2, color: INK });
    g.ellipse(x, y + 6, 14, 8).fill(c.side);
    const blink = c.frame === 5;
    for (const s of [-1, 1]) {
      if (blink) {
        g.moveTo(x + s * 4, y - 1).lineTo(x + s * 14, y + 1).stroke({ width: 2, color: INK });
      } else {
        g.ellipse(x + s * 9, y, 6.5, 3.5).fill(PALETTE[29]);
        g.circle(x + s * 7, y - 1.2, 1.3).fill(0xffffff);
      }
    }
    g.moveTo(x - 3, y + 8).quadraticCurveTo(x, y + 10, x + 3, y + 8).stroke({ width: 1.5, color: INK });
  },

  rug_saturn(g, c) {
    diamondAt(g, 0, 0, c.w, c.h, c.top, 4);
    diamondStroke(g, 0, 0, c.w, c.h, PALETTE[11], 2, 10);
    const x = c.cx;
    const y = c.cy;
    for (let i = 0; i < 16; i++) {
      const dx = (rnd(i) * 2 - 1) * 40;
      const dy = (rnd(i + 50) * 2 - 1) * 18;
      if (Math.abs(dx) / 48 + Math.abs(dy) / 24 < 0.9) g.circle(x + dx, y + dy, 0.8 + rnd(i + 9)).fill({ color: 0xffffff, alpha: 0.7 });
    }
    g.ellipse(x, y, 30, 9).stroke({ width: 4, color: PALETTE[3], alpha: 0.9 });
    g.circle(x, y - 2, 13).fill(c.side).stroke({ width: 1.5, color: INK });
    g.ellipse(x, y + 2, 13, 3).fill({ color: shade(c.side, 0.8), alpha: 0.7 });
    g.moveTo(x - 30, y).bezierCurveTo(x - 30, y + 12, x + 30, y + 12, x + 30, y).stroke({ width: 4, color: PALETTE[3] });
  },

  robot_dock(g, c) {
    box(g, 0.12, 0.12, 0.76, 0.76, 0, 6, PALETTE[26], PALETTE[28]);
    diamondAt(g, 0.12, 0.12, 0.76, 0.76, 0x141a2e, 6, 1, 6);
    const x = c.cx;
    const y = c.cy - 6;
    glowAt(g, x, y, 14, c.side, 0.15 + 0.15 * Math.sin(c.t * TAU));
    for (let i = 0; i < 3; i++) {
      const a0 = c.t * TAU + (i * TAU) / 3;
      g.moveTo(x + Math.cos(a0) * 16, y + Math.sin(a0) * 8);
      for (let s = 1; s <= 6; s++) g.lineTo(x + Math.cos(a0 + s * 0.14) * 16, y + Math.sin(a0 + s * 0.14) * 8);
      g.stroke({ width: 2, color: c.side });
    }
    g.poly([{ x: x + 1, y: y - 6 }, { x: x - 4, y: y + 1 }, { x, y: y + 1 }, { x: x - 1, y: y + 6 }, { x: x + 4, y: y - 1 }, { x, y: y - 1 }]).fill(PALETTE[16]);
  },

  hex_panel(g, c) {
    diamondAt(g, 0, 0, c.w, c.h, 0x232a45, 1.5);
    const x = c.cx;
    const y = c.cy;
    const pul = 0.5 + 0.5 * Math.sin(c.t * TAU);
    const hex = (r: number) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU + Math.PI / 6;
        return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.5 };
      });
    g.poly(hex(18)).fill({ color: c.side, alpha: 0.08 + 0.12 * pul }).stroke({ width: 1.5, color: c.side, alpha: 0.35 + 0.6 * pul });
    g.poly(hex(8)).stroke({ width: 1, color: CYAN, alpha: 0.3 + 0.4 * (1 - pul) });
  },
};

export { rnd, glowAt, shadowAt, diamondAt, diamondStroke, wallMap, panel, line };
export type { Pt, Painter };
