import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CHAT_BUBBLE_MS } from '@dovey/shared';

const STYLE = new TextStyle({
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 14,
  fontWeight: '600',
  fill: 0x3b2a2a,
  wordWrap: true,
  wordWrapWidth: 200, // ~40 chars at 14px
  breakWords: true,
  lineHeight: 18,
});

/** Server-issued dice/wheel results: gold and heavier, so typed chat cannot pass for one. */
const ROLL_STYLE = STYLE.clone();
ROLL_STYLE.fontWeight = '800';
ROLL_STYLE.fill = 0x7a4f00;
const ROLL_BG = 0xfff1b8;
const ROLL_OUTLINE = 0xc9941a;

const PAD = 8;
const RADIUS = 10;
const TAIL = 8;
const OUTLINE = 0x3b2a2a;

/** One speech bubble. Pooled; call `show` to (re)use. */
export class Bubble extends Container {
  private bg = new Graphics();
  private text = new Text({ text: '', style: STYLE });
  age = 0;
  active = false;

  constructor() {
    super();
    this.addChild(this.bg, this.text);
    this.text.resolution = 2;
  }

  show(msg: string, roll = false) {
    const fill = roll ? ROLL_BG : 0xffffff;
    const outline = roll ? ROLL_OUTLINE : OUTLINE;
    this.text.style = roll ? ROLL_STYLE : STYLE;
    this.text.text = msg;
    const w = Math.ceil(this.text.width) + PAD * 2;
    const h = Math.ceil(this.text.height) + PAD * 2;
    this.text.position.set(-w / 2 + PAD, -h - TAIL + PAD);
    this.bg
      .clear()
      .roundRect(-w / 2, -h - TAIL, w, h, RADIUS)
      .fill(fill)
      .stroke({ width: 2, color: outline })
      // tail
      .moveTo(-6, -TAIL)
      .lineTo(0, 0)
      .lineTo(6, -TAIL)
      .fill(fill);
    // cover the outline seam under the tail
    this.bg.rect(-5, -TAIL - 1, 10, 2).fill(fill);
    this.bg.moveTo(-6, -TAIL).lineTo(0, 0).lineTo(6, -TAIL).stroke({ width: 2, color: outline });
    this.age = 0;
    this.active = true;
    this.visible = true;
    this.alpha = 1;
    this.scale.set(0.6);
  }

  /** @returns false when expired */
  tick(dtMs: number): boolean {
    this.age += dtMs;
    // bounce in over 180ms: overshoot then settle
    if (this.age < 180) {
      const t = this.age / 180;
      const s = 0.6 + 0.4 * (1 + Math.sin(t * Math.PI * 0.5) * 0.25 - 0.25 * t) * t; // rough overshoot
      this.scale.set(Math.min(1.08, s));
    } else if (this.age < 260) {
      this.scale.set(1.08 - 0.08 * ((this.age - 180) / 80));
    } else {
      this.scale.set(1);
    }
    const fadeStart = CHAT_BUBBLE_MS - 500;
    if (this.age > fadeStart) this.alpha = Math.max(0, 1 - (this.age - fadeStart) / 500);
    if (this.age >= CHAT_BUBBLE_MS) {
      this.active = false;
      this.visible = false;
      return false;
    }
    return true;
  }
}

/** Fixed pool of bubbles; oldest is recycled when exhausted. */
export class BubblePool {
  private pool: Bubble[] = [];
  private owner = new Map<Bubble, string>();

  constructor(private layer: Container, size = 24) {
    for (let i = 0; i < size; i++) {
      const b = new Bubble();
      b.visible = false;
      layer.addChild(b);
      this.pool.push(b);
    }
  }

  /** Show a bubble for `id`; replaces that player's previous bubble. */
  say(id: string, msg: string, roll = false): Bubble {
    let b = this.pool.find((x) => this.owner.get(x) === id && x.active);
    if (!b) b = this.pool.find((x) => !x.active);
    if (!b) b = this.pool.reduce((a, x) => (x.age > a.age ? x : a));
    this.owner.set(b, id);
    b.show(msg, roll);
    this.layer.setChildIndex(b, this.layer.children.length - 1);
    return b;
  }

  /** Update ages; caller positions active bubbles via `forEachActive`. */
  tick(dtMs: number) {
    for (const b of this.pool) if (b.active) b.tick(dtMs);
  }

  forEachActive(fn: (id: string, b: Bubble) => void) {
    for (const b of this.pool) if (b.active) fn(this.owner.get(b)!, b);
  }

  drop(id: string) {
    for (const b of this.pool) {
      if (this.owner.get(b) === id) {
        b.active = false;
        b.visible = false;
      }
    }
  }
}
