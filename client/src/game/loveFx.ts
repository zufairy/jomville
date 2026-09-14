import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { LOVE_CALL_MS, LOVE_METER_TILE, LOVE_READY_MS, LOVE_SEATS, PALETTE, loveLabel, tileToScreen } from '@dovey/shared';
import { heart } from './furnitureArt';
import { loveLeft, useLove } from '../love';

const INK = PALETTE[0];
const PINK = PALETTE[7];
const BLUSH = PALETTE[6];
const TAU = Math.PI * 2;
const REVEAL_FILL_MS = 2600;
const MAX_SPARKS = 140;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grav: number;
  age: number;
  life: number;
  r: number;
  c: number;
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const backOut = (k: number) => {
  const s = 1.70158;
  const t = k - 1;
  return t * t * ((s + 1) * t + s) + 1;
};

/**
 * In-world Love Meter effects, drawn over the booth: a countdown ring and
 * rising hearts while a couple is on the loveseat, then a giant heart that
 * fills to their score with a count-up and a heart burst everyone can see.
 */
export class LoveFx extends Container {
  private g = new Graphics();
  private pct: Text;
  private names: Text;
  private tag: Text;
  private sparks: Spark[] = [];
  private clock = 0;
  private phase: string | null = null;
  private phaseAt = 0;
  private burst = false;
  private emitAcc = 0;
  private readonly meter = tileToScreen(LOVE_METER_TILE.x + 1, LOVE_METER_TILE.y + 0.5);
  private readonly seats = tileToScreen((LOVE_SEATS[0].x + LOVE_SEATS[1].x) / 2 + 0.5, LOVE_SEATS[0].y + 0.5);
  private unsub: () => void;

  constructor() {
    super();
    const style = (size: number, fill: number, stroke: number, width: number) =>
      new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: size, fontWeight: '900', fill, stroke: { color: stroke, width }, align: 'center' });
    this.pct = new Text({ text: '', style: style(36, 0xffffff, INK, 7) });
    this.names = new Text({ text: '', style: style(15, INK, 0xffffff, 5) });
    this.tag = new Text({ text: '', style: style(17, PINK, 0xffffff, 5) });
    for (const t of [this.pct, this.names, this.tag]) {
      t.anchor.set(0.5);
      t.resolution = 2;
    }
    this.addChild(this.g, this.pct, this.names, this.tag);
    this.eventMode = 'none';
    this.unsub = useLove.subscribe((s) => this.onPhase(s.snap?.pair ? `${s.snap.pair.a}:${s.snap.pair.phase}` : null));
  }

  private onPhase(key: string | null) {
    if (key === this.phase) return;
    this.phase = key;
    this.phaseAt = this.clock;
    this.burst = false;
  }

  tick(dt: number) {
    this.clock += dt;
    this.g.clear();
    this.pct.visible = this.names.visible = this.tag.visible = false;
    const pair = useLove.getState().snap?.pair;
    if (pair?.phase === 'reveal' && pair.score !== null) this.drawReveal(pair.ah, pair.bh, pair.score);
    else if (pair) this.drawLive(pair.phase, dt);
    this.drawSparks(dt);
  }

  private drawLive(phase: string, dt: number) {
    const g = this.g;
    const { x, y } = this.seats;
    const total = phase === 'ready' ? LOVE_READY_MS : LOVE_CALL_MS;
    const left = loveLeft();
    const k = Math.max(0, Math.min(1, left / total));
    const cy = y - 118;
    g.circle(x, cy, 23).fill({ color: 0xffffff, alpha: 0.92 }).stroke({ width: 3, color: INK });
    if (k > 0) g.moveTo(x, cy).arc(x, cy, 18, -Math.PI / 2, -Math.PI / 2 + k * TAU).closePath().fill(phase === 'ready' ? PALETTE[16] : PINK);
    heart(g, x, cy, 8 * (1 + 0.15 * Math.sin(this.clock / 150)), 0xffffff);
    this.tag.text = phase === 'ready' ? 'matched!' : `${Math.ceil(left / 1000)}s`;
    this.tag.position.set(x, cy - 38);
    this.tag.visible = true;
    // hearts drift up off the loveseat
    this.emitAcc += dt;
    while (this.emitAcc > 260) {
      this.emitAcc -= 260;
      this.spawn(x + (Math.random() - 0.5) * 56, y - 30, (Math.random() - 0.5) * 20, -40 - Math.random() * 40, 0, 1800, Math.random() < 0.5 ? PINK : BLUSH);
    }
  }

  private drawReveal(ah: string, bh: string, score: number) {
    const g = this.g;
    const e = this.clock - this.phaseAt;
    const fill = Math.min(1, e / REVEAL_FILL_MS);
    const shown = Math.round(score * easeOut(fill));
    const pop = e < 450 ? 0.4 + 0.6 * backOut(e / 450) : 1 + (fill >= 1 ? 0.04 * Math.sin(this.clock / 110) : 0);
    const cx = this.meter.x;
    const cy = this.meter.y - 230;
    const R = 54 * pop;
    const spin = this.clock / 1400;
    const fade = Math.min(1, e / 400);
    for (let i = 0; i < 12; i++) {
      const a = spin + (i / 12) * TAU;
      const L = R * 2.1;
      g.moveTo(cx, cy)
        .lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L)
        .lineTo(cx + Math.cos(a + 0.13) * L, cy + Math.sin(a + 0.13) * L)
        .closePath()
        .fill({ color: i % 2 ? BLUSH : PALETTE[30], alpha: 0.3 * fade });
    }
    heart(g, cx, cy, R + 7, INK);
    heart(g, cx, cy, R, 0xffffff);
    // liquid fill grows from the heart's bottom tip
    const r = R * Math.max(0.06, shown / 100);
    heart(g, cx, cy + 0.95 * (R - r), r, PINK);
    heart(g, cx - R * 0.38, cy - R * 0.4, R * 0.16, 0xffffff, 0.7);
    this.pct.text = `${shown}%`;
    this.pct.position.set(cx, cy - 2);
    this.pct.scale.set(pop * (fill >= 1 ? 1.08 : 1));
    this.pct.visible = true;
    this.names.text = `${ah}  +  ${bh}`;
    this.names.position.set(cx, cy + R + 22);
    this.names.visible = true;
    if (fill < 1) return;
    this.tag.text = loveLabel(score);
    this.tag.position.set(cx, cy + R + 44);
    this.tag.visible = true;
    if (this.burst) return;
    this.burst = true;
    const n = 12 + Math.round(score / 3);
    const cols = [PINK, BLUSH, PALETTE[5], PALETTE[30]];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 90 + Math.random() * 220;
      this.spawn(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 120, 260, 1200 + Math.random() * 800, cols[i % cols.length]);
    }
  }

  private spawn(x: number, y: number, vx: number, vy: number, grav: number, life: number, c: number) {
    if (this.sparks.length >= MAX_SPARKS) return;
    this.sparks.push({ x, y, vx, vy, grav, age: 0, life, r: 4 + Math.random() * 5, c });
  }

  private drawSparks(dt: number) {
    const k = dt / 1000;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy += s.grav * k;
      s.x += s.vx * k + (s.grav ? 0 : Math.sin(s.age / 200) * 0.4);
      s.y += s.vy * k;
      const t = s.age / s.life;
      heart(this.g, s.x, s.y, s.r * (1 - 0.3 * t), s.c, 1 - t);
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.unsub();
    super.destroy(options);
  }
}
