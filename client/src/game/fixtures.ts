import { Container, FillGradient, Graphics, Matrix, Text, TextStyle } from 'pixi.js';
import { PALETTE, tileToScreen } from '@dovey/shared';

const INK = PALETTE[0];

/**
 * Every FillGradient owns a GPU texture that is never freed. The fixtures repaint every frame,
 * so gradients are shared per colour pair instead of rebuilt (that leaked ~300 textures a second).
 */
const GRADIENTS = new Map<string, FillGradient>();

function vertical(top: number, bottom: number): FillGradient {
  const key = `v${top}:${bottom}`;
  let g = GRADIENTS.get(key);
  if (!g) {
    g = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: top },
        { offset: 1, color: bottom },
      ],
      textureSpace: 'local',
    });
    GRADIENTS.set(key, g);
  }
  return g;
}

function radial(light: number, dark: number, lx = 0.35, ly = 0.3): FillGradient {
  const key = `r${light}:${dark}:${lx}:${ly}`;
  let g = GRADIENTS.get(key);
  if (!g) {
    g = new FillGradient({
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
    });
    GRADIENTS.set(key, g);
  }
  return g;
}

function shade(colour: number, k: number): number {
  const ch = (sh: number) => Math.min(255, Math.round(((colour >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

interface Pt {
  x: number;
  y: number;
}

/**
 * A point in back-wall space, relative to a fixture's base on the floor line:
 * `a` px along the wall (the +x tile axis: 32px across, 16px down per tile),
 * `h` px up, and `d` px out from the wall toward the viewer (the +y tile axis).
 */
function wp(a: number, h: number, d = 0): Pt {
  return { x: a - d, y: 0.5 * a + 0.5 * d - h };
}

function poly(g: Graphics, pts: Pt[]): Graphics {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  return g.closePath();
}

/** A layer whose local drawing (x along, -y up) lands on a plane parallel to the back wall, `d` px out from it. */
function wallFace(d: number): Container {
  const c = new Container();
  c.setFromMatrix(new Matrix(1, 0.5, 0, 1, -d, 0.5 * d));
  return c;
}

const CAPSULE_COLS = [PALETTE[10], PALETTE[16], PALETTE[7], PALETTE[14], PALETTE[8], PALETTE[18], PALETTE[13], PALETTE[4]];
const RARITY_COL: Record<string, number> = { common: PALETTE[4], rare: PALETTE[11], epic: PALETTE[9], legendary: PALETTE[17] };

/** cabinet footprint: width along the wall, height, and how far it stands out from the wall */
const MACHINE = { w: 60, h: 104, depth: 16 };
/** doorway opening and how far the frame stands proud of the wall */
const DOOR = { w: 40, h: 82, proud: 3 };
/** the leaf swings this far open (radians) when someone walks up */
const DOOR_OPEN = 1.25;
/** the door is set in the wall above tile (1, 0); the machine stands above (4, 0), leaving a gap so the two signs never overlap */
const DOOR_TILE = 1;
const MACHINE_TILE = 4;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  col: number;
}

/**
 * Fixed room fixtures on the back wall: the exit door (leave / browse) and the
 * capsule machine beside it, both drawn in the wall's own orientation. The
 * door swings open as you walk up and spills warm light on the mat; the
 * machine is a solid cabinet whose glass dome runs a tiny physics sim so
 * capsules settle, jiggle and, during a pull, bounce like mad. `rattle()` and
 * `dispense()` drive the in-world show while the sheet is open.
 */
export class Fixtures extends Container {
  readonly door = new Container();
  readonly machine = new Container();
  private body = new Container();
  private balls = new Graphics();
  private bulbs = new Graphics();
  private sheen = new Graphics();
  private dial = new Graphics();
  private spill = new Graphics();
  private drop = new Graphics();
  private doorLeaf = new Graphics();
  private doorLight = new Graphics();
  private doorSpill = new Graphics();
  private signGlow = new Graphics();
  private signLabel!: Text;
  private clock = 0;
  private rattleUntil = 0;
  private dropAt = -1;
  private dropCol: number = PALETTE[4];
  private sim: Ball[] = [];
  private visitor: Pt | null = null;
  /** 0 shut .. 1 fully open */
  private doorOpen = 0;
  private drawnOpen = -1;
  private flickerUntil = 0;

  constructor(private roomSize: number) {
    super();
    this.buildDoor();
    this.buildMachine();
    this.addChild(this.door, this.machine);
  }

  /** Where the local player stands (tile coords), so the door can open for them. */
  setVisitor(p: Pt | null) {
    this.visitor = p;
  }

  private buildDoor() {
    const base = tileToScreen(DOOR_TILE + 0.5, 0);
    const { w, h, proud } = DOOR;
    const wood = PALETTE[21];

    const mat = new Graphics();
    poly(mat, [wp(-24, 0, 6), wp(24, 0, 6), wp(24, 0, 30), wp(-24, 0, 30)])
      .fill(vertical(PALETTE[7], shade(PALETTE[7], 0.8)))
      .stroke({ width: 2, color: INK });
    for (const k of [-12, 0, 12]) poly(mat, [wp(k - 1.5, 0, 9), wp(k + 1.5, 0, 9), wp(k + 1.5, 0, 27), wp(k - 1.5, 0, 27)]).fill({ color: 0xffffff, alpha: 0.28 });

    // the frame's right edge, so it reads as a real surround standing out from the wall
    const side = new Graphics();
    poly(side, [wp(w / 2 + 6, 0, 0), wp(w / 2 + 6, 0, proud), wp(w / 2 + 6, h + 6, proud), wp(w / 2 + 6, h + 6, 0)]).fill(shade(wood, 0.6)).stroke({ width: 2, color: INK });

    const face = wallFace(proud);
    const frame = new Graphics();
    frame.roundRect(-w / 2 - 6, -h - 6, w + 12, h + 6, 6).fill(vertical(shade(wood, 1.15), shade(wood, 0.8))).stroke({ width: 3, color: INK });
    // the dark room beyond the doorway
    frame.roundRect(-w / 2, -h, w, h, 4).fill(vertical(0x2a1f2a, 0x0f0a12));
    for (const y of [-h + 8, -18]) frame.rect(-w / 2 - 4, y, 4, 8).fill(PALETTE[26]).stroke({ width: 1, color: INK });
    // plaque beside the door
    frame.roundRect(w / 2 + 10, -58, 12, 16, 2).fill(PALETTE[22]).stroke({ width: 1.5, color: INK });
    for (const [y, len] of [[-54, 6], [-50, 6], [-46, 4]]) frame.rect(w / 2 + 13, y, len, 1.5).fill(PALETTE[20]);
    face.addChild(frame, this.doorLight);

    // neon exit sign over the door
    const sign = new Graphics();
    sign.roundRect(-24, -h - 30, 48, 18, 6).fill(0x1c1c1c).stroke({ width: 2.5, color: INK });
    sign.roundRect(-21, -h - 27, 42, 12, 4).stroke({ width: 2, color: PALETTE[14], alpha: 0.9 });
    this.signLabel = new Text({ text: 'EXIT', style: new TextStyle({ fontSize: 10, fontWeight: '900', fill: PALETTE[14], fontFamily: 'system-ui, sans-serif', letterSpacing: 2 }) });
    this.signLabel.anchor.set(0.5);
    this.signLabel.position.set(0, -h - 21);
    face.addChild(this.signGlow, sign, this.signLabel);

    this.door.addChild(mat, this.doorSpill, side, face, this.doorLeaf);
    this.door.position.set(base.x, base.y);
    this.door.eventMode = 'static';
    this.door.cursor = 'pointer';
    this.drawDoor();
  }

  /** Leaf, light and floor spill for the current opening. */
  private drawDoor() {
    const k = this.doorOpen;
    if (Math.abs(k - this.drawnOpen) < 0.002) return;
    this.drawnOpen = k;
    const { w, h, proud } = DOOR;
    const angle = k * DOOR_OPEN;
    const hinge = -w / 2;
    const freeA = hinge + w * Math.cos(angle);
    const freeD = proud + w * Math.sin(angle);
    // a point on the leaf: t across from the hinge, `up` px above the floor
    const at = (t: number, up: number) => wp(hinge + (freeA - hinge) * t, up, proud + (freeD - proud) * t);
    const top = h - 2;

    const light = this.doorLight;
    light.clear();
    if (k > 0.01) light.roundRect(-w / 2, -h, w, h, 4).fill({ color: 0xffd27a, alpha: 0.6 * k });

    const spill = this.doorSpill;
    spill.clear();
    if (k > 0.01) poly(spill, [wp(-w / 2, 0, proud), wp(w / 2, 0, proud), wp(w / 2 + 12, 0, 44), wp(-w / 2 - 6, 0, 44)]).fill({ color: 0xffd27a, alpha: 0.32 * k });

    const g = this.doorLeaf;
    g.clear();
    const leafWood = PALETTE[19];
    poly(g, [at(0, 0), at(1, 0), at(1, top), at(0, top)]).fill(vertical(shade(leafWood, 1.1), shade(leafWood, 0.82))).stroke({ width: 2, color: INK });
    poly(g, [at(0.15, top - 6), at(0.85, top - 6), at(0.85, top - 32), at(0.15, top - 32)]).fill(vertical(PALETTE[31], shade(PALETTE[31], 0.85))).stroke({ width: 1.5, color: INK });
    const s0 = at(0.28, top - 10);
    const s1 = at(0.5, top - 28);
    g.moveTo(s0.x, s0.y).lineTo(s1.x, s1.y).stroke({ width: 2.5, color: 0xffffff, alpha: 0.5 });
    poly(g, [at(0.15, 8), at(0.85, 8), at(0.85, 36), at(0.15, 36)]).stroke({ width: 1.5, color: shade(leafWood, 0.65) });
    const knob = at(0.84, 40);
    g.circle(knob.x, knob.y, 3.2).fill(radial(0xfff1a8, PALETTE[17])).stroke({ width: 1.5, color: INK });
  }

  private buildMachine() {
    const base = tileToScreen(MACHINE_TILE + 0.5, 0);
    const { w, h, depth } = MACHINE;
    const red = PALETTE[5];

    const shadow = new Graphics();
    poly(shadow, [wp(-w / 2 - 4, 0, 0), wp(w / 2 + 4, 0, 0), wp(w / 2 + 8, 0, depth + 10), wp(-w / 2, 0, depth + 10)]).fill({ color: INK, alpha: 0.16 });

    // right side and top: the cabinet is a solid box standing out from the wall
    const box = new Graphics();
    poly(box, [wp(w / 2, 0, 0), wp(w / 2, 0, depth), wp(w / 2, h, depth), wp(w / 2, h, 0)]).fill(shade(red, 0.62)).stroke({ width: 2.5, color: INK });
    for (let i = 0; i < 4; i++) {
      const v0 = wp(w / 2, 34 + i * 8, 4);
      const v1 = wp(w / 2, 34 + i * 8, depth - 4);
      box.moveTo(v0.x, v0.y).lineTo(v1.x, v1.y).stroke({ width: 1.5, color: shade(red, 0.42) });
    }
    poly(box, [wp(-w / 2, h, 0), wp(w / 2, h, 0), wp(w / 2, h, depth), wp(-w / 2, h, depth)]).fill(shade(red, 1.22)).stroke({ width: 2.5, color: INK });

    // the front, drawn flat and sheared onto the cabinet face
    const face = wallFace(depth);
    const g = new Graphics();
    g.roundRect(-w / 2, -8, w, 10, 3).fill(vertical(PALETTE[26], PALETTE[28])).stroke({ width: 2.5, color: INK });
    g.roundRect(-w / 2, -h, w, h - 4, 10).fill(vertical(shade(red, 1.2), shade(red, 0.78))).stroke({ width: 3, color: INK });
    g.roundRect(-27, -h + 3, 6, h - 10, 3).fill({ color: 0xffffff, alpha: 0.18 });
    g.roundRect(-w / 2 - 1, -h + 4, 3, h - 12, 1.5).fill(PALETTE[24]);
    g.roundRect(w / 2 - 2, -h + 4, 3, h - 12, 1.5).fill(PALETTE[24]);
    g.roundRect(-25, -98, 50, 46, 14).fill(vertical(0xffffff, 0xfff1a8)).stroke({ width: 2.5, color: INK });
    face.addChild(g);

    // capsules and the glass sheen live in the dome
    const dome = new Graphics().roundRect(-24, -97, 48, 44, 13).fill(0xffffff);
    this.balls.mask = dome;
    const dome2 = new Graphics().roundRect(-24, -97, 48, 44, 13).fill(0xffffff);
    this.sheen.mask = dome2;
    const gloss = new Graphics();
    gloss.roundRect(-22, -95, 18, 26, 8).fill({ color: 0xffffff, alpha: 0.4 });
    face.addChild(this.balls, dome, gloss, this.sheen, dome2);

    const front = new Graphics();
    // coin slot plate, price tag and the chute with its flap
    front.roundRect(14, -46, 10, 16, 2).fill(PALETTE[26]).stroke({ width: 1.5, color: INK });
    front.rect(18, -42, 2, 8).fill(INK);
    front.roundRect(-24, -46, 14, 10, 2).fill(PALETTE[1]).stroke({ width: 1.5, color: INK });
    front.rect(-21, -42, 8, 1.5).fill(PALETTE[5]);
    front.rect(-21, -39, 5, 1.5).fill(PALETTE[5]);
    front.roundRect(-17, -22, 34, 14, 4).fill(vertical(0x2a2a30, 0x101014)).stroke({ width: 2, color: INK });
    front.roundRect(-14, -20, 28, 6, 2).fill({ color: 0xffffff, alpha: 0.12 });
    face.addChild(front);

    // the dial turns while a pull rattles
    this.dial.circle(0, 0, 11).fill(radial(0xfff1a8, PALETTE[17])).stroke({ width: 2.5, color: INK });
    this.dial.roundRect(-2.5, -12, 5, 24, 2.5).fill(vertical(PALETTE[28], INK));
    this.dial.circle(0, 0, 3).fill(PALETTE[27]).stroke({ width: 1, color: INK });
    this.dial.position.set(0, -36);
    face.addChild(this.dial);

    const marquee = new Graphics();
    marquee.roundRect(-33, -h - 18, 66, 18, 7).fill(vertical(PALETTE[16], PALETTE[17])).stroke({ width: 2.5, color: INK });
    const label = new Text({ text: 'CAPSULES', style: new TextStyle({ fontSize: 10, fontWeight: '900', fill: INK, fontFamily: 'system-ui, sans-serif', letterSpacing: 1.5 }) });
    label.anchor.set(0.5);
    label.position.set(0, -h - 9);
    face.addChild(marquee, this.bulbs, label);

    this.body.addChild(box, face);
    this.machine.addChild(shadow, this.spill, this.body, this.drop);
    this.machine.position.set(base.x, base.y);
    this.machine.eventMode = 'static';
    this.machine.cursor = 'pointer';
    for (let i = 0; i < 11; i++) {
      this.sim.push({ x: -16 + (i % 5) * 8 + (i > 4 ? 4 : 0), y: -66 - Math.floor(i / 5) * 9, vx: 0, vy: 0, r: 4.6, col: CAPSULE_COLS[i % CAPSULE_COLS.length] });
    }
  }

  /** World-space hit test for the two fixtures, against what is actually drawn. */
  hit(x: number, y: number): 'door' | 'machine' | null {
    const within = (c: Container) => {
      const b = c.getLocalBounds();
      const px = x - c.x;
      const py = y - c.y;
      return px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY;
    };
    if (within(this.door)) return 'door';
    if (within(this.machine)) return 'machine';
    return null;
  }

  /** Shake the machine and stir the capsules (called when a pull starts). */
  rattle(ms = 1400) {
    this.rattleUntil = this.clock + ms;
    for (const b of this.sim) {
      b.vy -= 60 + Math.random() * 80;
      b.vx += (Math.random() - 0.5) * 90;
    }
  }

  /** A capsule of the given rarity rolls out of the chute and pops on the floor. */
  dispense(rarity: string) {
    this.dropCol = RARITY_COL[rarity] ?? PALETTE[4];
    this.dropAt = this.clock;
  }

  private stepBalls(dt: number) {
    const rattling = this.clock < this.rattleUntil;
    const floor = -56;
    for (const b of this.sim) {
      b.vy += 220 * dt; // gravity
      if (rattling && Math.random() < 0.12) {
        b.vy -= 40 + Math.random() * 60;
        b.vx += (Math.random() - 0.5) * 60;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > floor - b.r) {
        b.y = floor - b.r;
        b.vy = -b.vy * 0.35;
        b.vx *= 0.8;
        if (Math.abs(b.vy) < 6) b.vy = 0;
      }
      if (b.x < -20 + b.r) {
        b.x = -20 + b.r;
        b.vx = -b.vx * 0.5;
      }
      if (b.x > 20 - b.r) {
        b.x = 20 - b.r;
        b.vx = -b.vx * 0.5;
      }
      if (b.y < -94 + b.r) {
        b.y = -94 + b.r;
        b.vy = Math.abs(b.vy) * 0.3;
      }
    }
    // simple separation so they stack instead of overlapping
    for (let i = 0; i < this.sim.length; i++)
      for (let j = i + 1; j < this.sim.length; j++) {
        const a = this.sim[i];
        const c = this.sim[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = a.r + c.r;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          c.x += (dx / d) * push;
          c.y += (dy / d) * push;
        }
      }
    const g = this.balls;
    g.clear();
    for (const b of this.sim) {
      g.circle(b.x, b.y, b.r).fill(radial(shade(b.col, 1.3), shade(b.col, 0.8))).stroke({ width: 1.5, color: INK });
      g.circle(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.28).fill({ color: 0xffffff, alpha: 0.7 });
    }
  }

  private stepBulbs() {
    const g = this.bulbs;
    g.clear();
    const rattling = this.clock < this.rattleUntil;
    const on = Math.floor(this.clock / (rattling ? 90 : 500));
    for (let i = 0; i < 9; i++) {
      const x = -28 + i * 7;
      const lit = (i + on) % 3 === 0;
      if (lit) g.circle(x, -MACHINE.h - 19, 4).fill({ color: 0xffffff, alpha: 0.4 });
      g.circle(x, -MACHINE.h - 19, 2.2).fill(lit ? 0xffffff : PALETTE[18]).stroke({ width: 1, color: INK });
    }
  }

  /** A light sweep across the dome glass every few seconds. */
  private stepSheen() {
    const g = this.sheen;
    g.clear();
    const k = (this.clock % 3200) / 3200;
    if (k > 0.45) return;
    const x = -40 + (k / 0.45) * 80;
    g.moveTo(x, -98).lineTo(x + 9, -98).lineTo(x - 6, -52).lineTo(x - 15, -52).closePath().fill({ color: 0xffffff, alpha: 0.4 });
  }

  private stepDrop() {
    const g = this.drop;
    g.clear();
    if (this.dropAt < 0) return;
    const t = (this.clock - this.dropAt) / 1000;
    if (t > 2.4) {
      this.dropAt = -1;
      return;
    }
    // out of the chute, bounce twice on the floor as it rolls toward the viewer, then pop
    const { depth } = MACHINE;
    let along = 0;
    let up: number;
    let out: number;
    let rot = 0;
    if (t < 0.35) {
      const k = t / 0.35;
      up = 14 * (1 - k * k);
      out = depth + 8 * k;
    } else if (t < 0.75) {
      const k = (t - 0.35) / 0.4;
      up = 10 * Math.sin(k * Math.PI);
      out = depth + 8 + 10 * k;
      along = 4 * k;
      rot = k * 1.2;
    } else if (t < 1.0) {
      const k = (t - 0.75) / 0.25;
      up = 4 * Math.sin(k * Math.PI);
      out = depth + 18 + 4 * k;
      along = 4 + 2 * k;
      rot = 1.2 + k * 0.5;
    } else {
      up = 0;
      out = depth + 22;
      along = 6;
      rot = 1.7;
    }
    const r = 7;
    const { x, y } = wp(along, up + r, out);
    const open = t > 1.2;
    const fade = t > 2 ? 1 - (t - 2) / 0.4 : 1;
    const c = this.dropCol;
    if (open) {
      const k = Math.min(1, (t - 1.2) / 0.3);
      g.circle(x, y - 8, 14 + k * 6).fill({ color: c, alpha: 0.18 * fade });
      g.circle(x - 6 * k, y - 4 * k, r).fill({ color: 0xffffff, alpha: fade }).stroke({ width: 1.5, color: INK, alpha: fade });
      g.circle(x + 6 * k, y + 2 * k, r).fill({ color: c, alpha: fade }).stroke({ width: 1.5, color: INK, alpha: fade });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 3;
        const rr = 10 + k * 10 + Math.sin(t * 9 + i) * 2;
        g.circle(x + Math.cos(a) * rr, y - 6 + Math.sin(a) * rr * 0.6, 1.8).fill({ color: PALETTE[16], alpha: fade * 0.9 });
      }
    } else {
      g.circle(x, y, r).fill(c).stroke({ width: 1.5, color: INK });
      g.moveTo(x - r, y).arc(x, y, r, Math.PI + rot, rot).closePath().fill(0xffffff).stroke({ width: 1.5, color: INK });
      g.circle(x - 2, y - 2, 2).fill({ color: 0xffffff, alpha: 0.7 });
    }
  }

  tick(dtMs: number) {
    this.clock += dtMs;
    const dt = Math.min(0.05, dtMs / 1000);
    const k = 0.5 + 0.5 * Math.sin(this.clock / 600);
    const rattling = this.clock < this.rattleUntil;

    // the door opens for whoever walks up to it
    const v = this.visitor;
    const near = !!v && Math.hypot(v.x - (DOOR_TILE + 0.5), v.y - 0.5) < 2.2;
    this.doorOpen += ((near ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 6);
    this.drawDoor();

    // exit neon hums, with the odd flicker
    if (this.clock > this.flickerUntil && Math.random() < 0.004) this.flickerUntil = this.clock + 90 + Math.random() * 120;
    const lit = this.clock > this.flickerUntil ? 1 : 0.3;
    this.signLabel.alpha = lit;
    this.signGlow.clear();
    this.signGlow.ellipse(0, -DOOR.h - 21, 30 + k * 3, 14 + k * 2).fill({ color: PALETTE[14], alpha: (0.12 + k * 0.08) * lit });

    // coloured light from the dome pools on the floor in front of the machine
    const { depth } = MACHINE;
    this.spill.clear();
    poly(this.spill, [wp(-22, 0, depth + 2), wp(22, 0, depth + 2), wp(30, 0, depth + 28), wp(-30, 0, depth + 28)]).fill({
      color: PALETTE[16],
      alpha: 0.1 + k * 0.08 + (rattling ? 0.14 : 0),
    });

    if (rattling) {
      this.body.position.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2);
      this.body.rotation = (Math.random() - 0.5) * 0.03;
      this.dial.rotation += dt * 9;
    } else {
      this.body.position.set(0, 0);
      this.body.rotation = 0;
      this.dial.rotation *= 0.9;
    }
    this.stepBalls(dt);
    this.stepBulbs();
    this.stepSheen();
    this.stepDrop();
    void this.roomSize;
  }
}
