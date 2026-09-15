import { Container, Graphics } from 'pixi.js';

/** a stuck indicator (lost "off") disappears on its own after this */
export const TYPING_DOTS_MS = 6000;

const W = 38;
const H = 22;
const TAIL = 6;
const OUTLINE = 0x3b2a2a;
const DOT = 0x8a7470;
const BOUNCE_MS = 1100;

/** One "…" bubble with three bouncing dots, in the same ink-and-white look as chat bubbles. */
class TypingBubble extends Container {
  private dots: Graphics[] = [];
  age = 0;
  owner = '';
  active = false;

  constructor() {
    super();
    const bg = new Graphics()
      .roundRect(-W / 2, -H - TAIL, W, H, H / 2)
      .fill(0xffffff)
      .stroke({ width: 2, color: OUTLINE })
      .moveTo(-5, -TAIL)
      .lineTo(0, 0)
      .lineTo(5, -TAIL)
      .fill(0xffffff);
    bg.rect(-4, -TAIL - 1, 8, 2).fill(0xffffff);
    bg.moveTo(-5, -TAIL).lineTo(0, 0).lineTo(5, -TAIL).stroke({ width: 2, color: OUTLINE });
    this.addChild(bg);
    for (let i = 0; i < 3; i++) {
      const d = new Graphics().circle(0, 0, 2.6).fill(DOT);
      d.position.set((i - 1) * 9, -TAIL - H / 2);
      this.dots.push(d);
      this.addChild(d);
    }
    this.visible = false;
  }

  show(id: string) {
    if (!this.active) {
      this.alpha = 0;
      this.scale.set(0.7);
    }
    this.owner = id;
    this.age = 0;
    this.active = true;
    this.visible = true;
  }

  hide() {
    this.active = false;
    this.visible = false;
    this.owner = '';
  }

  tick(dtMs: number, clock: number) {
    this.age += dtMs;
    if (this.age >= TYPING_DOTS_MS) return this.hide();
    // pop in over ~140 ms
    const k = Math.min(1, this.alpha + dtMs / 140);
    this.alpha = k;
    this.scale.set(0.7 + 0.3 * k);
    for (let i = 0; i < 3; i++) {
      const phase = ((clock / BOUNCE_MS - i * 0.16) % 1 + 1) % 1;
      // each dot hops once per cycle, resting the rest of the time
      const hop = phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0;
      const d = this.dots[i];
      d.y = -TAIL - H / 2 - hop * 3.5;
      d.alpha = 0.55 + 0.45 * hop;
    }
  }
}

/** Fixed pool of typing bubbles, at most one per player. */
export class TypingDots {
  private pool: TypingBubble[] = [];
  private clock = 0;

  constructor(private layer: Container, size = 12) {
    for (let i = 0; i < size; i++) {
      const b = new TypingBubble();
      layer.addChild(b);
      this.pool.push(b);
    }
  }

  /** @returns true when `id` was not already showing dots */
  show(id: string): boolean {
    let free: TypingBubble | null = null;
    for (const b of this.pool) {
      if (b.active && b.owner === id) {
        b.show(id);
        return false;
      }
      if (!b.active && !free) free = b;
    }
    // pool full: the oldest indicator gives way
    const b = free ?? this.pool.reduce((a, x) => (x.age > a.age ? x : a));
    b.show(id);
    this.layer.setChildIndex(b, this.layer.children.length - 1);
    return true;
  }

  hide(id: string) {
    for (const b of this.pool) if (b.active && b.owner === id) b.hide();
  }

  clear() {
    for (const b of this.pool) if (b.active) b.hide();
  }

  /** age and animate; `place` positions each active bubble (return false to hide it this frame) */
  tick(dtMs: number, place: (id: string, b: Container) => boolean) {
    this.clock += dtMs;
    for (const b of this.pool) {
      if (!b.active) continue;
      b.tick(dtMs, this.clock);
      if (b.active) b.visible = place(b.owner, b);
    }
  }
}
