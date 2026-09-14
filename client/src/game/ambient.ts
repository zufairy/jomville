import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BotPose, BotRoute, PALETTE, botPose, tileToScreen } from '@dovey/shared';

const INK = PALETTE[0];
const WHITE = 0xffffff;

/** Label heights above the anchor, per critter kind. */
const TAG_Y: Record<string, number> = { crab: -28, gull: -92, butterfly: -66, kitty: -42, mascot: -112 };

/**
 * One decorative room critter (crab, gull, butterfly, kitty). Pose comes from
 * wall-clock time via the shared route math, so every visitor sees the same
 * critter in the same spot without any network traffic.
 */
class Critter extends Container {
  private shadowG = new Graphics();
  private body = new Graphics();
  private tag: Text;
  private clock = Math.random() * 1000;

  constructor(readonly route: BotRoute) {
    super();
    this.tag = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '800', fill: WHITE, stroke: { color: INK, width: 4 } }),
    });
    this.tag.anchor.set(0.5, 1);
    this.tag.resolution = 2;
    this.addChild(this.shadowG, this.body, this.tag);
    this.eventMode = 'none';
  }

  tick(dt: number, now: number) {
    this.clock += dt;
    const p = botPose(this.route, now);
    const s = tileToScreen(p.x + 0.5, p.y + 0.5);
    this.position.set(s.x, s.y);
    this.zIndex = p.x + p.y + 0.1;
    this.body.clear();
    this.shadowG.clear();
    // sprites face right by default; flip for left/up travel
    this.body.scale.x = p.dir === 3 || p.dir === 0 ? -1 : 1;
    const k = this.route.kind;
    if (k === 'crab') this.drawCrab(this.body, p);
    else if (k === 'gull') this.drawGull(this.body, p);
    else if (k === 'butterfly') this.drawButterfly(this.body, p);
    else if (k === 'mascot') this.drawMascot(this.body, p);
    else this.drawKitty(this.body, p);
    const show = !!p.say && p.k > 0.08 && p.k < 0.92;
    this.tag.visible = show;
    if (show) {
      this.tag.text = p.say ?? '';
      this.tag.position.set(0, TAG_Y[k] ?? -40);
      this.tag.alpha = Math.min(1, Math.min(p.k, 1 - p.k) * 8);
    }
  }

  private drawCrab(g: Graphics, p: BotPose) {
    const t = this.clock;
    const bob = p.moving ? Math.abs(Math.sin(t / 70)) * 1.5 : 0;
    this.shadowG.ellipse(0, 0, 12, 5).fill({ color: INK, alpha: 0.22 });
    const red = PALETTE[5];
    const y = -7 - bob;
    for (let i = 0; i < 3; i++) {
      const wig = p.moving ? Math.sin(t / 60 + i) * 2 : 0;
      for (const s of [-1, 1]) g.moveTo(s * 6, y + 2).lineTo(s * (11 + i * 2), y + 5 + wig).stroke({ width: 1.5, color: INK });
    }
    // claws snap while it stops
    const snap = !p.moving ? Math.abs(Math.sin(t / 180)) : 0.3;
    for (const s of [-1, 1]) {
      g.moveTo(s * 7, y - 2).lineTo(s * 12, y - 8).stroke({ width: 2, color: INK });
      g.circle(s * 13, y - 10, 3.5).fill(red).stroke({ width: 1.2, color: INK });
      g.moveTo(s * 13, y - 10).lineTo(s * (15 + snap * 2), y - 13 - snap * 2).stroke({ width: 1.2, color: INK });
    }
    g.ellipse(0, y, 9, 6).fill(red).stroke({ width: 1.5, color: INK });
    g.ellipse(-2, y - 2, 3, 1.5).fill({ color: WHITE, alpha: 0.4 });
    for (const s of [-1, 1]) {
      g.moveTo(s * 3, y - 5).lineTo(s * 3, y - 10).stroke({ width: 1.2, color: INK });
      g.circle(s * 3, y - 11, 2).fill(WHITE).stroke({ width: 0.8, color: INK });
      g.circle(s * 3.4, y - 11, 0.9).fill(INK);
    }
  }

  private drawGull(g: Graphics, p: BotPose) {
    const t = this.clock;
    const alt = 74 + Math.sin(t / 420) * 5;
    this.shadowG.ellipse(0, 0, 9, 3).fill({ color: INK, alpha: 0.12 });
    const y = -alt;
    const flap = Math.sin(t / 110) * 9;
    for (const s of [-1, 1]) {
      g.moveTo(0, y).quadraticCurveTo(s * 9, y - 6 - flap, s * 20, y - 2 - flap * 0.6).stroke({ width: 4, color: INK });
      g.moveTo(0, y).quadraticCurveTo(s * 9, y - 6 - flap, s * 20, y - 2 - flap * 0.6).stroke({ width: 2.5, color: WHITE });
      g.circle(s * 20, y - 2 - flap * 0.6, 1.6).fill(PALETTE[26]);
    }
    g.ellipse(0, y + 1, 7, 4).fill(WHITE).stroke({ width: 1.5, color: INK });
    g.circle(6, y - 1, 3).fill(WHITE).stroke({ width: 1.2, color: INK });
    g.poly([{ x: 8.5, y: y - 1.5 }, { x: 13, y: y }, { x: 8.5, y: y + 0.5 }]).fill(PALETTE[18]);
    g.circle(7, y - 2, 0.8).fill(INK);
    void p;
  }

  private drawButterfly(g: Graphics, p: BotPose) {
    const t = this.clock;
    const alt = 38 + Math.sin(t / 300) * 7;
    this.shadowG.ellipse(0, 0, 5, 2).fill({ color: INK, alpha: 0.12 });
    const y = -alt;
    const open = 0.25 + 0.75 * Math.abs(Math.cos(t / 70));
    const cols = this.route.id.endsWith('b') ? [PALETTE[8], PALETTE[31]] : [PALETTE[6], PALETTE[16]];
    for (const s of [-1, 1]) {
      g.ellipse(s * 6 * open, y - 3, 6 * open, 7).fill({ color: cols[0], alpha: 0.95 }).stroke({ width: 1, color: INK });
      g.ellipse(s * 5 * open, y + 4, 4 * open, 4.5).fill({ color: cols[1], alpha: 0.95 }).stroke({ width: 1, color: INK });
      g.circle(s * 6 * open, y - 4, 1.4 * open).fill(WHITE);
    }
    g.moveTo(0, y - 6).lineTo(0, y + 6).stroke({ width: 2, color: INK });
    g.moveTo(0, y - 6).lineTo(-3, y - 11).moveTo(0, y - 6).lineTo(3, y - 11).stroke({ width: 1, color: INK });
    // sparkle trail
    if (p.moving) {
      for (let i = 1; i <= 3; i++) {
        const k = ((t / 400 + i / 3) % 1);
        g.circle(-6 - i * 5, y + 6 + k * 8, 1.4 * (1 - k)).fill({ color: PALETTE[30], alpha: 1 - k });
      }
    }
  }

  private drawKitty(g: Graphics, p: BotPose) {
    const t = this.clock;
    const fur = PALETTE[1];
    const pink = PALETTE[6];
    this.shadowG.ellipse(0, 0, 13, 5).fill({ color: INK, alpha: 0.2 });
    if (p.moving) {
      const step = Math.sin(t / 90);
      for (const [lx, ph] of [
        [-7, 0],
        [-3, Math.PI],
        [5, Math.PI],
        [9, 0],
      ] as const) {
        g.moveTo(lx, -8).lineTo(lx + Math.sin(t / 90 + ph) * 2, -1).stroke({ width: 2.5, color: INK });
      }
      const tail = Math.sin(t / 200) * 4;
      g.moveTo(-10, -12).quadraticCurveTo(-18, -18 + tail, -14, -26 + tail).stroke({ width: 4, color: INK });
      g.moveTo(-10, -12).quadraticCurveTo(-18, -18 + tail, -14, -26 + tail).stroke({ width: 2.5, color: fur });
      g.ellipse(0, -12 - Math.abs(step), 12, 6).fill(fur).stroke({ width: 1.5, color: INK });
      this.kittyHead(g, 12, -20 - Math.abs(step), fur, pink, false);
    } else {
      // sitting, tail curled, slow blink and a little heart
      const tail = Math.sin(t / 500) * 3;
      g.moveTo(-6, -4).quadraticCurveTo(-16, -2 + tail, -12, -12).stroke({ width: 4, color: INK });
      g.moveTo(-6, -4).quadraticCurveTo(-16, -2 + tail, -12, -12).stroke({ width: 2.5, color: fur });
      g.ellipse(0, -11, 9, 11).fill(fur).stroke({ width: 1.5, color: INK });
      g.ellipse(0, -8, 5, 6).fill(PALETTE[2]);
      this.kittyHead(g, 1, -27, fur, pink, t % 2600 < 180);
      if (p.say) {
        const k = (t / 1400) % 1;
        const hx = 10;
        const hy = -36 - k * 12;
        g.circle(hx - 2, hy, 2.2).fill({ color: PALETTE[7], alpha: 1 - k });
        g.circle(hx + 2, hy, 2.2).fill({ color: PALETTE[7], alpha: 1 - k });
        g.poly([{ x: hx - 4.3, y: hy + 0.8 }, { x: hx + 4.3, y: hy + 0.8 }, { x: hx, y: hy + 5 }]).fill({ color: PALETTE[7], alpha: 1 - k });
      }
    }
  }

  /** Wonder Dome's bear in a bellhop jacket and tiny top hat, with a heart balloon; waves when greeting. */
  private drawMascot(g: Graphics, p: BotPose) {
    const t = this.clock;
    const fur = 0x9c6242;
    const furL = 0xe0b081;
    const red = 0xc43d34;
    const gold = 0xe2b24f;
    const step = p.moving ? Math.sin(t / 110) : 0;
    const bob = p.moving ? Math.abs(step) * 2 : Math.sin(t / 500) * 0.8;
    this.shadowG.ellipse(0, 0, 17, 6).fill({ color: INK, alpha: 0.22 });
    for (const [lx, ph] of [
      [-6, 1],
      [6, -1],
    ] as const) {
      const sw = step * ph * 4;
      g.roundRect(lx - 4 + sw, -18, 8, 16, 3).fill(fur).stroke({ width: 1.5, color: INK });
      g.ellipse(lx + sw, -2, 6, 3).fill(INK);
    }
    const y = -18 - bob;
    // heart balloon on a string from the raised paw
    const bx = 24 + Math.sin(t / 700) * 3;
    const by = y - 78 + Math.sin(t / 500) * 3;
    g.moveTo(18, y - 34).quadraticCurveTo(24, y - 55, bx, by + 10).stroke({ width: 1, color: INK });
    g.circle(bx - 4.5, by - 2, 6).fill(red).stroke({ width: 1.2, color: INK });
    g.circle(bx + 4.5, by - 2, 6).fill(red).stroke({ width: 1.2, color: INK });
    g.poly([{ x: bx - 10.2, y: by }, { x: bx + 10.2, y: by }, { x: bx, y: by + 11 }]).fill(red);
    g.circle(bx - 5, by - 4, 1.8).fill({ color: WHITE, alpha: 0.6 });
    // jacket
    g.roundRect(-14, y - 32, 28, 32, 9).fill(red).stroke({ width: 2, color: INK });
    g.poly([{ x: -5, y: y - 32 }, { x: 5, y: y - 32 }, { x: 0, y: y - 20 }]).fill(furL);
    for (const k of [0, 1, 2]) g.circle(0, y - 17 + k * 6, 1.6).fill(gold);
    g.moveTo(-14, y - 6).lineTo(14, y - 6).stroke({ width: 1.5, color: gold });
    // arms: one down, one up holding the balloon; waves hello at a stop
    const wave = !p.moving && p.say ? Math.sin(t / 140) * 6 : 0;
    g.moveTo(-12, y - 26).lineTo(-18 - wave * 0.2, y - 10 - Math.abs(wave)).stroke({ width: 8, color: INK, cap: 'round' });
    g.moveTo(-12, y - 26).lineTo(-18 - wave * 0.2, y - 10 - Math.abs(wave)).stroke({ width: 5.5, color: red, cap: 'round' });
    g.circle(-18 - wave * 0.2, y - 9 - Math.abs(wave), 3.5).fill(fur).stroke({ width: 1, color: INK });
    g.moveTo(12, y - 26).lineTo(18, y - 34).stroke({ width: 8, color: INK, cap: 'round' });
    g.moveTo(12, y - 26).lineTo(18, y - 34).stroke({ width: 5.5, color: red, cap: 'round' });
    g.circle(18, y - 35, 3.5).fill(fur).stroke({ width: 1, color: INK });
    // head
    const hy = y - 46;
    for (const s of [-1, 1]) {
      g.circle(s * 12, hy - 11, 6).fill(fur).stroke({ width: 1.5, color: INK });
      g.circle(s * 12, hy - 11, 3).fill(furL);
    }
    g.circle(0, hy, 15).fill(fur).stroke({ width: 2, color: INK });
    g.ellipse(0, hy + 5, 8, 6).fill(furL);
    g.ellipse(0, hy + 2.5, 2.8, 2).fill(INK);
    const blink = t % 3000 < 150;
    if (blink) {
      g.moveTo(-7, hy - 3).lineTo(-3, hy - 3).moveTo(3, hy - 3).lineTo(7, hy - 3).stroke({ width: 1.5, color: INK });
    } else {
      g.circle(-5, hy - 3, 2).fill(INK);
      g.circle(5, hy - 3, 2).fill(INK);
    }
    g.moveTo(-3, hy + 7).quadraticCurveTo(0, hy + 10, 3, hy + 7).stroke({ width: 1.2, color: INK });
    g.circle(-10, hy + 4, 2.5).fill({ color: 0xff6f91, alpha: 0.45 });
    g.circle(10, hy + 4, 2.5).fill({ color: 0xff6f91, alpha: 0.45 });
    // tiny top hat and a gold bow tie
    g.ellipse(4, hy - 13, 10, 3).fill(0x2f2a27).stroke({ width: 1, color: INK });
    g.rect(-2, hy - 27, 12, 14).fill(0x2f2a27).stroke({ width: 1, color: INK });
    g.rect(-2, hy - 17, 12, 3).fill(red);
    g.poly([{ x: 0, y: y - 31 }, { x: -7, y: y - 35 }, { x: -7, y: y - 27 }]).fill(gold).stroke({ width: 1, color: INK });
    g.poly([{ x: 0, y: y - 31 }, { x: 7, y: y - 35 }, { x: 7, y: y - 27 }]).fill(gold).stroke({ width: 1, color: INK });
  }

  private kittyHead(g: Graphics, x: number, y: number, fur: number, pink: number, blink: boolean) {
    for (const s of [-1, 1]) {
      g.poly([{ x: x + s * 3, y: y - 5 }, { x: x + s * 8, y: y - 12 }, { x: x + s * 8.5, y: y - 3 }]).fill(fur).stroke({ width: 1.2, color: INK });
      g.poly([{ x: x + s * 4.5, y: y - 5 }, { x: x + s * 7.5, y: y - 9.5 }, { x: x + s * 7.5, y: y - 4.5 }]).fill(pink);
    }
    g.circle(x, y, 8).fill(fur).stroke({ width: 1.5, color: INK });
    if (blink) {
      g.moveTo(x - 5, y - 1).lineTo(x - 2, y - 1).moveTo(x + 2, y - 1).lineTo(x + 5, y - 1).stroke({ width: 1.2, color: INK });
    } else {
      g.circle(x - 3, y - 1, 1.4).fill(INK);
      g.circle(x + 3, y - 1, 1.4).fill(INK);
    }
    g.poly([{ x: x - 1, y: y + 1.5 }, { x: x + 1, y: y + 1.5 }, { x, y: y + 2.8 }]).fill(pink);
    g.circle(x - 5, y + 2.5, 1.6).fill({ color: pink, alpha: 0.6 });
    g.circle(x + 5, y + 2.5, 1.6).fill({ color: pink, alpha: 0.6 });
  }
}

export class AmbientActors {
  private critters: Critter[];

  constructor(layer: Container, routes: BotRoute[]) {
    this.critters = routes.map((r) => new Critter(r));
    for (const c of this.critters) layer.addChild(c);
  }

  tick(dt: number) {
    const now = Date.now();
    for (const c of this.critters) c.tick(dt, now);
  }
}
