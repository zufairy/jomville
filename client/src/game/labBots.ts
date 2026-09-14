import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BotPose, BotRoute, LAB_BOTS, PALETTE, botPose, tileToScreen } from '@dovey/shared';

const INK = PALETTE[0];
const CYAN = 0x7ef9ff;

/**
 * A decorative Rocket Lab robot. Its pose comes from wall-clock time (shared
 * route math), so every visitor sees it at the same spot without any network
 * traffic. Lives in the actor layer so avatars and furniture sort around it.
 */
class LabBot extends Container {
  private shadowG = new Graphics();
  private body = new Graphics();
  private tag: Text;
  private clock = Math.random() * 1000;

  constructor(readonly route: BotRoute) {
    super();
    this.tag = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1c1640, width: 4 } }),
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
    this.zIndex = p.x + p.y + 0.2;
    this.body.clear();
    this.shadowG.clear();
    if (this.route.kind === 'rover') this.drawRover(this.body, p);
    else this.drawDrone(this.body, p);
    const show = !!p.say && p.k > 0.08 && p.k < 0.92;
    this.tag.visible = show;
    if (show) {
      this.tag.text = p.say ?? '';
      this.tag.position.set(0, this.route.kind === 'drone' ? -74 : -54);
      this.tag.alpha = Math.min(1, Math.min(p.k, 1 - p.k) * 8);
    }
  }

  private drawRover(g: Graphics, p: BotPose) {
    const t = this.clock;
    const bob = p.moving ? Math.abs(Math.sin(t / 90)) * 2 : Math.sin(t / 400) * 0.8;
    this.shadowG.ellipse(0, 0, 15, 7).fill({ color: INK, alpha: 0.28 });
    // treads
    g.roundRect(-13, -9, 26, 9, 4).fill(0x2c3350).stroke({ width: 2, color: INK });
    for (let i = 0; i < 4; i++) {
      const k = ((i + (p.moving ? t / 120 : 0)) % 4) / 4;
      g.circle(-10 + k * 20, -4.5, 1.6).fill(0x7d7a91);
    }
    const y0 = -9 - bob;
    const swing = p.moving ? Math.sin(t / 110) * 4 : Math.sin(t / 300) * 2;
    g.moveTo(-12, y0 - 10).lineTo(-17, y0 - 4 + swing).stroke({ width: 2.5, color: INK });
    g.moveTo(12, y0 - 10).lineTo(17, y0 - 4 - swing).stroke({ width: 2.5, color: INK });
    g.roundRect(-12, y0 - 18, 24, 18, 6).fill(0xe6e2ea).stroke({ width: 2, color: INK });
    g.circle(0, y0 - 9, 3).fill(p.moving ? PALETTE[13] : PALETTE[16]);
    // head with a screen face; eyes glance where it's heading
    const hy = y0 - 36;
    g.roundRect(-13, hy, 26, 17, 7).fill(0xffffff).stroke({ width: 2, color: INK });
    g.roundRect(-10, hy + 3, 20, 11, 4).fill(0x14122b);
    const look = [
      [0, -1],
      [2, 0],
      [0, 1],
      [-2, 0],
    ][p.dir] ?? [0, 0];
    const blink = t % 3200 < 140;
    for (const sx of [-4.5, 4.5]) {
      const ex = sx + look[0];
      const ey = hy + 8.5 + look[1] * 0.8;
      if (blink) g.rect(ex - 2.5, ey, 5, 1.2).fill(CYAN);
      else if (p.say) g.circle(ex, ey, 2.4).fill(PALETTE[7]);
      else g.roundRect(ex - 2, ey - 2.5, 4, 5, 2).fill(CYAN);
    }
    g.moveTo(0, hy).lineTo(0, hy - 7).stroke({ width: 1.8, color: INK });
    const on = Math.floor(t / 350) % 2 === 0;
    if (on) g.circle(0, hy - 8, 6).fill({ color: PALETTE[5], alpha: 0.3 });
    g.circle(0, hy - 8, 2.8).fill(on ? PALETTE[5] : PALETTE[13]).stroke({ width: 1, color: INK });
    if (!p.moving && p.say) {
      const a = Math.sin(t / 250) * 0.5;
      g.moveTo(0, hy + 10).lineTo(-22 + a * 20, 6).lineTo(22 + a * 20, 6).closePath().fill({ color: CYAN, alpha: 0.12 });
    }
  }

  private drawDrone(g: Graphics, p: BotPose) {
    const t = this.clock;
    const alt = 44 + Math.sin(t / 380) * 4;
    const tilt = p.moving ? ([0, 3, 0, -3][p.dir] ?? 0) : 0;
    this.shadowG.ellipse(0, 0, 10, 5).fill({ color: INK, alpha: 0.18 });
    const cy = -alt;
    const fl = 0.6 + 0.4 * Math.sin(t / 60);
    g.ellipse(tilt * 0.3, cy + 12, 4, 6 * fl).fill({ color: CYAN, alpha: 0.5 });
    for (const sx of [-12, 12]) {
      g.moveTo(sx, cy - 10).lineTo(sx * 0.6, cy - 4).stroke({ width: 1.5, color: INK });
      g.ellipse(sx, cy - 11, 8, 2).fill({ color: 0xffffff, alpha: 0.35 + 0.25 * Math.sin(t / 30 + sx) });
    }
    g.circle(tilt, cy, 11).fill(0xe6e2ea).stroke({ width: 2, color: INK });
    g.roundRect(tilt - 9, cy - 4, 18, 8, 4).fill(0x14122b);
    const ex = tilt + (p.moving ? ([0, 4, 0, -4][p.dir] ?? 0) : Math.sin(t / 500) * 5);
    g.circle(ex, cy, 5).fill({ color: PALETTE[7], alpha: 0.3 });
    g.circle(ex, cy, 2.6).fill(PALETTE[7]);
    g.ellipse(tilt, cy + 2, 15, 3 + 2 * Math.abs(Math.sin(t / 200))).stroke({ width: 1.5, color: PALETTE[9], alpha: 0.8 });
    if (!p.moving && p.say) {
      // hologram projected onto the floor
      g.moveTo(tilt - 3, cy + 10).lineTo(-14, -2).lineTo(14, -2).lineTo(tilt + 3, cy + 10).closePath().fill({ color: CYAN, alpha: 0.1 });
      const hy = -16 + Math.sin(t / 300) * 2;
      g.circle(0, hy, 5).stroke({ width: 1.2, color: CYAN, alpha: 0.8 });
      g.ellipse(0, hy, Math.abs(Math.cos(t / 300)) * 5 + 0.3, 5).stroke({ width: 1, color: CYAN, alpha: 0.6 });
    }
  }
}

export class LabBots {
  private bots: LabBot[];

  constructor(layer: Container) {
    this.bots = LAB_BOTS.map((r) => new LabBot(r));
    for (const b of this.bots) layer.addChild(b);
  }

  tick(dt: number) {
    const now = Date.now();
    for (const b of this.bots) b.tick(dt, now);
  }
}
