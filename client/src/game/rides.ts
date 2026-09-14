import { Container, Graphics } from 'pixi.js';
import {
  PALETTE,
  Placement,
  RideVehicle,
  TRACK_CLEARANCE,
  WONDER_COASTER,
  coasterTiles,
  rideKind,
  rideVehicles,
  riderPose,
  tileToScreen,
  trackAt,
  trainHead,
} from '@dovey/shared';
import { PARK, cylinder, edison, glow, grad, hgrad, rad } from './parkArt';
import { shade } from './furnitureArt';

const INK = PALETTE[0];
const WHITE = 0xffffff;
const TAU = Math.PI * 2;
const P = PARK;

/** depth of a point in continuous floor coords, on the same scale as avatars (tile index sum) */
const zOf = (x: number, y: number) => x + y - 1;
/** screen point for continuous floor coords lifted z px */
const scr = (x: number, y: number, z = 0) => {
  const p = tileToScreen(x, y);
  return { x: p.x, y: p.y - z };
};

export interface RiderScreen {
  x: number;
  y: number;
  z: number;
  dir: number;
}

interface Rig {
  draw(now: number): void;
  destroy(): void;
}

function gfx(layer: Container): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  layer.addChild(g);
  return g;
}

// ---- carousel: centre drum, eight galloping horses on brass poles, a striped canopy that turns

function horse(g: Graphics, lift: number, kick: number, tint: number, saddle: number) {
  const y = -lift;
  g.moveTo(-8, y + 3).lineTo(-12, y + 11 + kick).stroke({ width: 2.2, color: INK, cap: 'round' });
  g.moveTo(-5, y + 4).lineTo(-3, y + 12 - kick).stroke({ width: 2.2, color: INK, cap: 'round' });
  g.moveTo(7, y + 3).lineTo(13, y + 8 - kick).stroke({ width: 2.2, color: INK, cap: 'round' });
  g.moveTo(9, y + 3).lineTo(8, y + 12 + kick).stroke({ width: 2.2, color: INK, cap: 'round' });
  g.moveTo(-13, y - 2).quadraticCurveTo(-20, y + 2, -18, y + 10).stroke({ width: 3.5, color: P.brassD, cap: 'round' });
  g.ellipse(0, y, 14, 7.5).fill(rad(WHITE, tint, 0.4, 0.3)).stroke({ width: 1.4, color: INK });
  g.poly([
    { x: 7, y: y - 3 },
    { x: 12, y: y - 15 },
    { x: 18, y: y - 13 },
    { x: 14, y: y - 1 },
  ]).fill(tint).stroke({ width: 1.2, color: INK });
  g.ellipse(18, y - 15, 6.5, 4).fill(tint).stroke({ width: 1.2, color: INK });
  g.circle(19, y - 16, 0.9).fill(INK);
  g.poly([{ x: 13, y: y - 18 }, { x: 14, y: y - 23 }, { x: 16, y: y - 18 }]).fill(tint).stroke({ width: 1, color: INK });
  for (let i = 0; i < 4; i++) g.circle(10 + i * 1.6, y - 15 + i * 3, 2.4).fill(P.brass);
  g.ellipse(-1, y - 5, 7, 3.5).fill(saddle).stroke({ width: 1, color: INK });
  g.moveTo(-6, y - 3).lineTo(4, y - 3).stroke({ width: 1, color: P.brass });
  g.moveTo(14, y - 14).lineTo(22, y - 15).stroke({ width: 0.8, color: P.brass });
}

class CarouselRig implements Rig {
  private drum: Graphics;
  private horses: Graphics[];
  private canopy: Graphics;

  constructor(
    layer: Container,
    private p: Placement,
  ) {
    this.drum = gfx(layer);
    this.horses = Array.from({ length: 8 }, () => gfx(layer));
    this.canopy = gfx(layer);
  }

  draw(now: number) {
    const p = this.p;
    const cx = p.x + 1.5;
    const cy = p.y + 1.5;
    const vs = rideVehicles(p, now);
    const top = 106;
    const beat = Math.floor(now / 160);

    const d = this.drum;
    d.clear();
    d.zIndex = zOf(cx, cy) + 0.01;
    const c0 = scr(cx, cy);
    cylinder(d, c0.x, c0.y - 14, 15, 7.5, top - 14, P.cream, P.lacquer);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI - ((i + 0.5) / 5) * Math.PI;
      const mx = c0.x + Math.cos(a) * 11;
      d.roundRect(mx - 3, c0.y - top + 18, 6, top - 44, 2).fill({ color: 0xe8f4ff, alpha: 0.75 }).stroke({ width: 1, color: P.brass });
    }
    for (let i = 0; i < 6; i++) {
      const lit = (i + beat) % 3 !== 0;
      const bx = c0.x - 12 + i * 4.8;
      if (lit) glow(d, bx, c0.y - top + 10, 7, P.bulb, 0.5);
      d.circle(bx, c0.y - top + 10, 1.6).fill(lit ? WHITE : P.brassD);
    }

    const tints = [0xfff4dc, 0xd9c4b0, 0xfff4dc, 0xe6e2ea];
    const saddles = [P.lacquer, P.teal, 0x9b6bdc, P.mustard];
    vs.forEach((v, i) => {
      const g = this.horses[i];
      g.clear();
      const s = scr(v.x, v.y);
      g.position.set(s.x, s.y);
      g.zIndex = zOf(v.x, v.y) + 0.02;
      g.rect(-1.6, -top, 3.2, top - 14).fill(hgrad(P.brassL, P.brassD));
      for (let k = 0; k < 9; k++) g.moveTo(-1.6, -top + 6 + k * 10).lineTo(1.6, -top + 10 + k * 10).stroke({ width: 1, color: P.brassD, alpha: 0.8 });
      horse(g, v.lift, Math.sin(now / 200 + i) * 3, tints[i % 4], saddles[i % 4]);
      // screen-space travel direction decides which way the horse looks
      g.scale.x = v.hx - v.hy >= 0 ? 1 : -1;
    });

    // canopy: striped cone, sorted back to front so the near wedges cover the far ones
    const g = this.canopy;
    g.clear();
    g.zIndex = p.x + p.y + 4.7;
    const phase = vs[0]?.spin ?? 0;
    const apex = scr(cx, cy, top + 44);
    const R = 1.62;
    const wedges = Array.from({ length: 16 }, (_, i) => {
      const a0 = phase + (i / 16) * TAU;
      const a1 = phase + ((i + 1) / 16) * TAU;
      const am = (a0 + a1) / 2;
      return { i, a0, a1, depth: Math.cos(am) + Math.sin(am) };
    }).sort((a, b) => a.depth - b.depth);
    for (const w of wedges) {
      const s0 = scr(cx + Math.cos(w.a0) * R, cy + Math.sin(w.a0) * R, top);
      const s1 = scr(cx + Math.cos(w.a1) * R, cy + Math.sin(w.a1) * R, top);
      const sm = scr(cx + Math.cos((w.a0 + w.a1) / 2) * R * 0.6, cy + Math.sin((w.a0 + w.a1) / 2) * R * 0.6, top + 26);
      g.poly([apex, s0, sm, s1]).fill(w.i % 2 ? P.cream : P.lacquer);
      g.poly([apex, s0, sm, s1]).stroke({ width: 1, color: INK, alpha: 0.5 });
    }
    for (let i = 0; i < 28; i++) {
      const a = phase * 0.5 + (i / 28) * TAU;
      if (Math.cos(a) + Math.sin(a) < -0.2) continue;
      const q = scr(cx + Math.cos(a) * R, cy + Math.sin(a) * R, top - 3);
      g.circle(q.x, q.y, 4.5).fill(i % 2 ? P.brass : P.lacquerD).stroke({ width: 0.8, color: INK, alpha: 0.7 });
      const lit = (i + beat) % 3 !== 0;
      if (lit) glow(g, q.x, q.y + 6, 8, P.bulb, 0.55);
      g.circle(q.x, q.y + 6, 1.6).fill(lit ? WHITE : P.brassD);
    }
    g.circle(apex.x, apex.y - 3, 4).fill(rad(P.brassL, P.brassD)).stroke({ width: 1, color: INK });
    g.moveTo(apex.x, apex.y - 6).lineTo(apex.x, apex.y - 22).stroke({ width: 1.5, color: P.brassD });
    const flap = Math.sin(now / 180) * 3;
    g.poly([
      { x: apex.x, y: apex.y - 22 },
      { x: apex.x + 14, y: apex.y - 19 + flap },
      { x: apex.x, y: apex.y - 15 },
    ]).fill(P.lacquer).stroke({ width: 1, color: INK });
  }

  destroy() {
    for (const g of [this.drum, ...this.horses, this.canopy]) g.destroy();
  }
}

// ---- star swings: tall teal-and-brass tower, spinning crown, chairs flung out on chains

class SwingRig implements Rig {
  private tower: Graphics;
  private crown: Graphics;
  private chairs: Graphics[];

  constructor(
    layer: Container,
    private p: Placement,
  ) {
    this.tower = gfx(layer);
    this.chairs = Array.from({ length: 8 }, () => gfx(layer));
    this.crown = gfx(layer);
  }

  draw(now: number) {
    const p = this.p;
    const cx = p.x + 1.5;
    const cy = p.y + 1.5;
    const vs = rideVehicles(p, now);
    const H = 156;
    const speed = vs[0].spin;
    const phase = Math.atan2(vs[0].y - cy, vs[0].x - cx);

    const t = this.tower;
    t.clear();
    t.zIndex = zOf(cx, cy) + 0.01;
    const b = scr(cx, cy, 6);
    t.poly([
      { x: b.x - 9, y: b.y },
      { x: b.x + 9, y: b.y },
      { x: b.x + 4, y: b.y - H },
      { x: b.x - 4, y: b.y - H },
    ]).fill(hgrad(P.teal, shade(P.teal, 0.6))).stroke({ width: 1.5, color: INK });
    for (let k = 1; k < 7; k++) {
      const yy = b.y - (k / 7) * H;
      const w = 9 - (k / 7) * 5;
      t.rect(b.x - w - 1, yy - 2, (w + 1) * 2, 3).fill(P.brass);
    }

    this.chairs.forEach((g, i) => {
      const v = vs[i];
      g.clear();
      const s = scr(v.x, v.y);
      g.position.set(s.x, s.y);
      g.zIndex = zOf(v.x, v.y) + 0.02;
      const a = phase + (i / 8) * TAU;
      const hang = scr(cx + Math.cos(a) * 1.05, cy + Math.sin(a) * 1.05, H - 4);
      const seatY = -v.lift - 18;
      g.ellipse(0, 0, 10 - speed * 3, 5 - speed * 1.5).fill({ color: INK, alpha: 0.1 });
      for (const off of [-4, 4]) g.moveTo(hang.x - s.x + off * 0.4, hang.y - s.y).lineTo(off, seatY).stroke({ width: 1, color: P.brassD, alpha: 0.9 });
      g.roundRect(-8, seatY, 16, 5, 2).fill(grad(P.cream, P.linenD)).stroke({ width: 1.2, color: INK });
      g.roundRect(-7, seatY - 9, 14, 9, 3).fill(i % 2 ? P.lacquer : P.teal).stroke({ width: 1.2, color: INK });
      g.circle(0, seatY - 5, 1.6).fill(P.brass);
    });

    const g = this.crown;
    g.clear();
    g.zIndex = p.x + p.y + 4.8;
    const c = scr(cx, cy, H);
    const rx = 1.12 * 45.25;
    const ry = 1.12 * 22.6;
    cylinder(g, c.x, c.y, rx, ry, 10, grad(P.cream, P.linenD), P.teal);
    for (let i = 0; i < 12; i++) {
      const a = phase + (i / 12) * TAU;
      g.circle(c.x + Math.cos(a) * rx * 0.72, c.y - 10 + Math.sin(a) * ry * 0.72, 2).fill(i % 2 ? P.brass : P.lacquer);
    }
    const beat = Math.floor(now / 140);
    for (let i = 0; i < 20; i++) {
      const a = Math.PI - (i / 19) * Math.PI;
      const qx = c.x + Math.cos(a) * rx;
      const qy = c.y - 4 + Math.sin(a) * ry;
      const lit = (i + beat) % 2 === 0;
      if (lit) glow(g, qx, qy, 7, P.bulb, 0.5);
      g.circle(qx, qy, 1.6).fill(lit ? WHITE : P.brassD);
    }
    g.poly([
      { x: c.x - 8, y: c.y - 10 },
      { x: c.x + 8, y: c.y - 10 },
      { x: c.x, y: c.y - 38 },
    ]).fill(hgrad(P.brassL, P.brassD)).stroke({ width: 1.2, color: INK });
    const sy = c.y - 44;
    glow(g, c.x, sy, 14, P.brassL, 0.5 + 0.5 * speed);
    const pts = Array.from({ length: 10 }, (_, k) => {
      const a = -Math.PI / 2 + (k / 10) * TAU;
      const r = k % 2 ? 3 : 7;
      return { x: c.x + Math.cos(a) * r, y: sy + Math.sin(a) * r };
    });
    g.poly(pts).fill(P.brass).stroke({ width: 1, color: INK });
  }

  destroy() {
    for (const g of [this.tower, this.crown, ...this.chairs]) g.destroy();
  }
}

// ---- teacup: one spinning cup on its turntable

const CUP_COLS = [P.pink, P.mint, 0xd6a3ff, 0xa8d8ff];

class TeacupRig implements Rig {
  private cup: Graphics;
  private col: number;

  constructor(
    layer: Container,
    private p: Placement,
  ) {
    this.cup = gfx(layer);
    let h = 0;
    for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    this.col = CUP_COLS[h % CUP_COLS.length];
  }

  draw(now: number) {
    const v = rideVehicles(this.p, now)[0];
    const g = this.cup;
    g.clear();
    const s = scr(v.x, v.y);
    g.position.set(s.x, s.y);
    g.zIndex = zOf(v.x, v.y) + 0.02;
    const y = -v.lift;
    const col = this.col;
    const handle = () => {
      const hx = Math.cos(v.spin) * 27;
      const hy = y - 12 + Math.sin(v.spin) * 6;
      g.ellipse(hx, hy, 6, 7).stroke({ width: 4, color: INK });
      g.ellipse(hx, hy, 6, 7).stroke({ width: 2.4, color: col });
    };
    g.ellipse(0, y + 2, 32, 15).fill(grad(WHITE, P.linenD)).stroke({ width: 1.4, color: INK });
    if (Math.sin(v.spin) < 0) handle();
    const body = [{ x: -25, y: y - 22 }];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      body.push({ x: Math.cos(a) * (25 - Math.sin(a) * 7), y: y - 22 + Math.sin(a) * 24 });
    }
    body.push({ x: 25, y: y - 22 });
    g.poly(body).fill(rad(shade(col, 1.12), shade(col, 0.75), 0.35, 0.3)).stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 8; i++) {
      const a = v.spin + (i / 8) * TAU;
      if (Math.sin(a) < -0.1) continue;
      g.circle(Math.cos(a) * 20, y - 12 + Math.sin(a) * 6, 2.4 * (0.6 + 0.4 * Math.sin(a))).fill({ color: WHITE, alpha: 0.9 });
    }
    g.ellipse(0, y - 22, 25, 11).fill(shade(col, 0.6)).stroke({ width: 1.5, color: P.brass });
    g.ellipse(0, y - 22, 25, 11).stroke({ width: 0.8, color: INK });
    g.circle(0, y - 20, 4).fill(rad(P.brassL, P.brassD)).stroke({ width: 0.8, color: INK });
    if (Math.sin(v.spin) >= 0) handle();
  }

  destroy() {
    this.cup.destroy();
  }
}

// ---- drop tower: lattice mast, beacon crown, four seats riding the carriage up and down

class DropRig implements Rig {
  private mast: Graphics;
  private seats: Graphics[];

  constructor(
    layer: Container,
    private p: Placement,
  ) {
    this.mast = gfx(layer);
    this.seats = Array.from({ length: 4 }, () => gfx(layer));
  }

  draw(now: number) {
    const p = this.p;
    const cx = p.x + 1;
    const cy = p.y + 1;
    const vs = rideVehicles(p, now);
    const z = vs[0].lift;
    const H = 236;
    const m = this.mast;
    m.clear();
    m.zIndex = zOf(cx, cy) + 0.01;
    const b = scr(cx, cy, 14);
    const w = 9;
    m.rect(b.x - w, b.y - H, 3, H).fill(P.iron);
    m.rect(b.x + w - 3, b.y - H, 3, H).fill(P.iron);
    m.rect(b.x - 1.5, b.y - H, 3, H).fill({ color: P.iron, alpha: 0.6 });
    for (let yy = 0; yy < H - 10; yy += 14) {
      m.moveTo(b.x - w + 1, b.y - yy).lineTo(b.x + w - 1, b.y - yy - 14).stroke({ width: 1.2, color: 0x57504a });
      m.moveTo(b.x + w - 1, b.y - yy).lineTo(b.x - w + 1, b.y - yy - 14).stroke({ width: 1.2, color: 0x57504a });
    }
    const run = Math.floor(now / 90);
    for (let i = 0; i < 16; i++) {
      const yy = b.y - 12 - i * 14;
      const lit = (i + run) % 6 < 2;
      if (lit) glow(m, b.x - w - 3, yy, 7, P.bulb, 0.6);
      m.circle(b.x - w - 3, yy, 1.4).fill(lit ? WHITE : P.brassD);
    }
    const cz = scr(cx, cy, z + 14);
    m.ellipse(cz.x, cz.y, 26, 13).stroke({ width: 5, color: INK });
    m.ellipse(cz.x, cz.y, 26, 13).stroke({ width: 3, color: P.brass });
    const top = b.y - H;
    m.roundRect(b.x - 16, top - 14, 32, 14, 3).fill(grad(P.lacquer, P.lacquerD)).stroke({ width: 1.5, color: INK });
    for (let i = 0; i < 5; i++) m.circle(b.x - 12 + i * 6, top - 7, 1.5).fill((i + run) % 2 ? WHITE : P.brass);
    const beacon = 0.5 + 0.5 * Math.sin(now / 200);
    glow(m, b.x, top - 22, 18, 0xff6f61, beacon);
    m.circle(b.x, top - 22, 4).fill(0xff8a80).stroke({ width: 1, color: INK });

    this.seats.forEach((g, i) => {
      const v = vs[i];
      g.clear();
      const s = scr(v.x, v.y);
      g.position.set(s.x, s.y);
      g.zIndex = zOf(v.x, v.y) + 0.02;
      g.ellipse(0, 0, 9, 4.5).fill({ color: INK, alpha: Math.max(0.04, 0.16 - v.lift / 1600) });
      const y = -v.lift;
      g.roundRect(-9, y - 4, 18, 6, 2).fill(grad(P.cream, P.linenD)).stroke({ width: 1.2, color: INK });
      g.roundRect(-8, y - 22, 16, 18, 4).fill(grad(P.lacquer, P.lacquerD)).stroke({ width: 1.2, color: INK });
      g.moveTo(-6, y - 20).quadraticCurveTo(0, y - 6, 6, y - 20).stroke({ width: 2.5, color: P.brass });
    });
  }

  destroy() {
    for (const g of [this.mast, ...this.seats]) g.destroy();
  }
}

// ---- wooden coaster: static track and trestles per tile, four live cars

class CoasterRig implements Rig {
  private track: Graphics[] = [];
  private cars: Graphics[];

  constructor(layer: Container) {
    const T = WONDER_COASTER;
    const tiles = new Map<string, Graphics>();
    const tileG = (x: number, y: number) => {
      const key = `${Math.floor(x)},${Math.floor(y)}`;
      let g = tiles.get(key);
      if (!g) {
        g = gfx(layer);
        g.zIndex = Math.floor(x) + Math.floor(y) + 0.4;
        tiles.set(key, g);
        this.track.push(g);
      }
      return g;
    };

    // trestles under the low stretches, drawn first so the rails sit on top
    const low = coasterTiles(T);
    const foot = new Map<string, { x: number; y: number; z: number }>();
    for (let d = 0; d < T.length; d += 0.05) {
      const p = trackAt(T, d);
      const key = `${Math.floor(p.x)},${Math.floor(p.y)}`;
      if ((low.get(key) ?? Infinity) >= TRACK_CLEARANCE) continue;
      const cxT = Math.floor(p.x) + 0.5;
      const cyT = Math.floor(p.y) + 0.5;
      const best = foot.get(key);
      if (!best || Math.hypot(p.x - cxT, p.y - cyT) < Math.hypot(best.x - cxT, best.y - cyT)) foot.set(key, { x: p.x, y: p.y, z: p.z });
    }
    for (const q of foot.values()) {
      const g = tileG(q.x, q.y);
      const base = scr(q.x, q.y, 6);
      const topY = base.y - (q.z - 6) + 4;
      if (base.y - topY < 6) continue;
      for (const dx of [-8, 8]) g.rect(base.x + dx - 2, topY, 4, base.y - topY).fill(hgrad(P.oakL, P.walnutL)).stroke({ width: 0.8, color: INK, alpha: 0.7 });
      for (let yy = topY + 6; yy < base.y - 10; yy += 22) {
        g.moveTo(base.x - 8, yy).lineTo(base.x + 8, yy + 20).stroke({ width: 1.6, color: P.walnutL });
        g.moveTo(base.x + 8, yy).lineTo(base.x - 8, yy + 20).stroke({ width: 1.6, color: P.walnutL });
        g.moveTo(base.x - 10, yy).lineTo(base.x + 10, yy).stroke({ width: 2, color: P.oak });
      }
    }

    // girder, sleepers, twin steel rails, chain dogs on the lift
    const step = 0.12;
    for (let d = 0; d < T.length; d += step) {
      const a = trackAt(T, d);
      const b = trackAt(T, d + step);
      const g = tileG((a.x + b.x) / 2, (a.y + b.y) / 2);
      const nx = -a.hy;
      const ny = a.hx;
      const A = scr(a.x, a.y, a.z - 7);
      const B = scr(b.x, b.y, b.z - 7);
      g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ width: 9, color: INK, cap: 'round' });
      g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ width: 6.5, color: P.walnutL, cap: 'round' });
      const even = Math.round(d / step) % 2 === 0;
      if (even) {
        const s0 = scr(a.x + nx * 0.24, a.y + ny * 0.24, a.z - 2);
        const s1 = scr(a.x - nx * 0.24, a.y - ny * 0.24, a.z - 2);
        g.moveTo(s0.x, s0.y).lineTo(s1.x, s1.y).stroke({ width: 3, color: P.oak, cap: 'round' });
      }
      for (const side of [1, -1]) {
        const r0 = scr(a.x + nx * 0.17 * side, a.y + ny * 0.17 * side, a.z);
        const r1 = scr(b.x + nx * 0.17 * side, b.y + ny * 0.17 * side, b.z);
        g.moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).stroke({ width: 3.4, color: INK, cap: 'round' });
        g.moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).stroke({ width: 1.8, color: 0xe9e3d6, cap: 'round' });
      }
      const pt = T.points[Math.min(T.points.length - 1, Math.floor(d / (T.length / T.points.length)))];
      if (pt?.lift && even) {
        const c0 = scr(a.x, a.y, a.z + 1);
        g.circle(c0.x, c0.y, 1.1).fill(0x57504a);
      }
    }
    this.cars = Array.from({ length: T.cars }, () => gfx(layer));
  }

  draw(now: number) {
    const T = WONDER_COASTER;
    const parked = !trainHead(T, now).moving;
    const vs = rideVehicles({ id: 'coaster', def: 'coaster_gate', x: T.gate.x, y: T.gate.y, rot: 0 }, now);
    vs.forEach((v, i) => this.drawCar(this.cars[i], v, i === vs.length - 1, parked));
  }

  private drawCar(g: Graphics, v: RideVehicle, lead: boolean, parked: boolean) {
    g.clear();
    const s = scr(v.x, v.y);
    g.position.set(s.x, s.y);
    g.zIndex = Math.floor(v.x) + Math.floor(v.y) + 0.6;
    const { hx, hy } = v;
    const nx = -hy;
    const ny = hx;
    const halfL = 0.4;
    const halfW = 0.25;
    const slope = Math.max(-60, Math.min(60, v.slope));
    const pt = (al: number, si: number, up: number) => {
      const q = tileToScreen(hx * al + nx * si, hy * al + ny * si);
      return { x: q.x, y: q.y - (v.lift + 3 + slope * al + up) };
    };
    g.ellipse(0, 0, 14, 7).fill({ color: INK, alpha: Math.max(0.03, 0.14 - v.lift / 1400) });
    const H = 12;
    const corners: Array<[number, number]> = [
      [halfL, halfW],
      [halfL, -halfW],
      [-halfL, -halfW],
      [-halfL, halfW],
    ];
    // side faces that face the viewer (+x+y), then the open top
    for (let k = 0; k < 4; k++) {
      const [a0, s0] = corners[k];
      const [a1, s1] = corners[(k + 1) % 4];
      const mx = hx * (a0 + a1) * 0.5 + nx * (s0 + s1) * 0.5;
      const my = hy * (a0 + a1) * 0.5 + ny * (s0 + s1) * 0.5;
      if (mx + my <= 0) continue;
      g.poly([pt(a0, s0, 0), pt(a1, s1, 0), pt(a1, s1, H), pt(a0, s0, H)]).fill(k % 2 ? P.lacquer : P.lacquerD).stroke({ width: 1.2, color: INK });
      const t0 = pt(a0, s0, H - 3);
      const t1 = pt(a1, s1, H - 3);
      g.moveTo(t0.x, t0.y).lineTo(t1.x, t1.y).stroke({ width: 1.2, color: P.brass });
    }
    g.poly(corners.map(([a, si]) => pt(a, si, H))).fill(0x5a1e1b).stroke({ width: 1.2, color: INK });
    g.poly([pt(-halfL + 0.06, halfW - 0.04, H), pt(-halfL + 0.06, -halfW + 0.04, H), pt(-halfL + 0.06, -halfW + 0.04, H + 9), pt(-halfL + 0.06, halfW - 0.04, H + 9)])
      .fill(P.cream)
      .stroke({ width: 1, color: INK });
    const bar = parked ? 12 : 4;
    const l0 = pt(0.1, halfW, H + bar);
    const l1 = pt(0.1, -halfW, H + bar);
    g.moveTo(l0.x, l0.y).lineTo(l1.x, l1.y).stroke({ width: 2, color: P.brass });
    for (const [a, si] of [
      [halfL - 0.08, halfW],
      [-halfL + 0.08, halfW],
      [halfL - 0.08, -halfW],
      [-halfL + 0.08, -halfW],
    ]) {
      const w = pt(a, si, -1);
      g.circle(w.x, w.y, 2).fill(0x3a3a3a);
    }
    if (lead) {
      const nose = pt(halfL + 0.04, 0, 6);
      edison(g, nose.x, nose.y - 4, true, 1, 0.8);
    }
  }

  destroy() {
    for (const g of [...this.track, ...this.cars]) g.destroy();
  }
}

/**
 * Live rides in the current room. Rigs are rebuilt when the set of ride
 * placements changes; each frame they re-pose from the wall clock, and the
 * game asks where each seated rider should be drawn.
 */
export class RideSystem {
  private rigs = new Map<string, Rig>();
  private key = '';
  private coaster: CoasterRig | null = null;

  constructor(private layer: Container) {}

  sync(placements: Placement[], coasterRoom: boolean) {
    const rides = placements.filter((p) => rideKind(p.def) && p.def !== 'coaster_gate');
    const station = coasterRoom && placements.some((p) => p.def === 'coaster_gate' && p.rot === 0 && p.x === WONDER_COASTER.gate.x && p.y === WONDER_COASTER.gate.y);
    const key = rides.map((p) => `${p.id}:${p.def}:${p.x}:${p.y}`).join('|') + (station ? '|coaster' : '');
    if (key === this.key) return;
    this.key = key;
    for (const r of this.rigs.values()) r.destroy();
    this.rigs.clear();
    for (const p of rides) {
      const kind = rideKind(p.def);
      const rig =
        kind === 'carousel' ? new CarouselRig(this.layer, p) : kind === 'swings' ? new SwingRig(this.layer, p) : kind === 'teacup' ? new TeacupRig(this.layer, p) : new DropRig(this.layer, p);
      this.rigs.set(p.id, rig);
    }
    if (station && !this.coaster) this.coaster = new CoasterRig(this.layer);
    if (!station && this.coaster) {
      this.coaster.destroy();
      this.coaster = null;
    }
  }

  tick(now: number) {
    for (const r of this.rigs.values()) r.draw(now);
    this.coaster?.draw(now);
  }

  /** Screen spot, depth and facing for someone seated on tile (tx, ty) of a ride, or null to sit normally. */
  rider(seat: Placement, tx: number, ty: number, now: number): RiderScreen | null {
    const kind = rideKind(seat.def);
    if (!kind) return null;
    if (kind === 'coaster' ? !this.coaster : !this.rigs.has(seat.id)) return null;
    const pose = riderPose(seat, tx, ty, now);
    if (!pose) return null;
    const s = scr(pose.x, pose.y, pose.lift);
    // sort against the vehicle, not the seat offset, so a rider at the back of a cup still sits in it
    const v = rideVehicles(seat, now)[pose.vehicle];
    const z = kind === 'coaster' ? Math.floor(v.x) + Math.floor(v.y) + 0.61 : zOf(v.x, v.y) + 0.03;
    return { x: Math.round(s.x), y: Math.round(s.y + 2), z, dir: pose.dir };
  }
}
