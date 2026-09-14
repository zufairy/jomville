/**
 * Duel arena particles on a plain Canvas2D layer (no pixi: a second pixi
 * Application would break the game's shared textures). The simulation is pure
 * and unit-tested; FxLayer is the thin DOM driver.
 */
export type ParticleKind = 'spark' | 'confetti' | 'coin';
export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  /** seconds lived */
  life: number;
  /** seconds to live */
  ttl: number;
}
export interface FxState {
  parts: Particle[];
  /** screen shake amplitude in CSS px */
  shake: number;
}

export const MAX_PARTICLES = 260;
export const MAX_SHAKE = 18;
const MAX_DT = 0.05;
const GRAVITY: Record<ParticleKind, number> = { spark: 900, confetti: 380, coin: 1300 };
const DRAG: Record<ParticleKind, number> = { spark: 3.2, confetti: 1.4, coin: 0.4 };
const SPARK_COLORS = ['#fff6c2', '#ffd35a', '#ff9f43', '#ffffff'];
const CONFETTI_COLORS = ['#ff4fa3', '#e8c26a', '#8b5cf6', '#4fd1ff', '#7dff9a'];
type Rand = () => number;

const pickOf = <T,>(xs: T[], rand: Rand) => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))];

export function createFx(): FxState {
  return { parts: [], shake: 0 };
}

function push(s: FxState, p: Particle) {
  if (s.parts.length >= MAX_PARTICLES) s.parts.shift();
  s.parts.push(p);
}

/** Impact sparks fanning out from (x, y). */
export function burstSparks(s: FxState, x: number, y: number, rand: Rand = Math.random, n = 22) {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const sp = 220 + rand() * 420;
    const vx = Math.cos(a) * sp;
    const vy = Math.sin(a) * sp - 120;
    push(s, { kind: 'spark', x, y, vx, vy, rot: Math.atan2(vy, vx), vr: 0, size: 2 + rand() * 3, color: pickOf(SPARK_COLORS, rand), life: 0, ttl: 0.35 + rand() * 0.25 });
  }
}

/** Confetti drifting down across the whole width. */
export function burstConfetti(s: FxState, width: number, rand: Rand = Math.random, n = 90) {
  for (let i = 0; i < n; i++) {
    push(s, {
      kind: 'confetti',
      x: rand() * width,
      y: -10 - rand() * 60,
      vx: (rand() - 0.5) * 160,
      vy: 60 + rand() * 120,
      rot: rand() * Math.PI * 2,
      vr: (rand() - 0.5) * 12,
      size: 5 + rand() * 5,
      color: pickOf(CONFETTI_COLORS, rand),
      life: 0,
      ttl: 2.2 + rand() * 0.8,
    });
  }
}

/** Gold coins thrown up from (x, y), spinning as they fall. */
export function coinShower(s: FxState, x: number, y: number, rand: Rand = Math.random, n = 26) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.4;
    const sp = 380 + rand() * 300;
    push(s, { kind: 'coin', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, vr: (rand() - 0.5) * 14 || 6, size: 7 + rand() * 3, color: '#ffd35a', life: 0, ttl: 1.4 + rand() * 0.4 });
  }
}

export function addShake(s: FxState, amount: number) {
  s.shake = Math.min(MAX_SHAKE, s.shake + amount);
}

/** Advance the simulation by dt seconds (clamped, so a stalled tab never explodes). */
export function stepFx(s: FxState, dtSeconds: number): FxState {
  const dt = Math.min(Math.max(0, dtSeconds), MAX_DT);
  for (const p of s.parts) {
    p.vy += GRAVITY[p.kind] * dt;
    const k = Math.exp(-DRAG[p.kind] * dt);
    p.vx *= k;
    p.vy *= k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot = p.kind === 'spark' ? Math.atan2(p.vy, p.vx) : p.rot + p.vr * dt;
    p.life += dt;
  }
  s.parts = s.parts.filter((p) => p.life < p.ttl);
  s.shake *= Math.exp(-12 * dt);
  if (s.shake < 0.25) s.shake = 0;
  return s;
}

export function shakeOffset(s: FxState, rand: Rand = Math.random): { x: number; y: number } {
  if (!s.shake) return { x: 0, y: 0 };
  return { x: (rand() * 2 - 1) * s.shake, y: (rand() * 2 - 1) * s.shake };
}

export function drawFx(ctx: CanvasRenderingContext2D, s: FxState) {
  for (const p of s.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, (1 - p.life / p.ttl) * 1.4));
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === 'spark') {
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = '#ffb84d';
      ctx.shadowBlur = 8;
      ctx.fillRect(-p.size * 2.5, -p.size / 2, p.size * 5, p.size);
    } else if (p.kind === 'confetti') {
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else {
      // a spinning coin reads as an ellipse whose width breathes
      const w = p.size * Math.abs(Math.cos(p.rot)) + 1;
      ctx.fillStyle = '#9c6b12';
      ctx.beginPath();
      ctx.ellipse(0, 0, w + 1.5, p.size + 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(-w * 0.3, -p.size * 0.55, Math.max(1, w * 0.25), p.size * 0.5);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * Drives an FxState on a canvas overlay and shakes `stage` (a sibling element,
 * so the particles themselves stay steady). With reduced motion it does nothing.
 */
export class FxLayer {
  readonly state = createFx();
  private raf = 0;
  private last = 0;
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement | null,
    private reduced: boolean,
  ) {
    this.ctx = canvas.getContext('2d');
  }

  /** Match the backing store to the CSS box at device pixel ratio (capped at 2) for crisp HD particles. */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  sparks(x: number, y: number, n = 22) {
    if (this.reduced) return;
    burstSparks(this.state, x, y, Math.random, n);
    this.kick();
  }

  confetti() {
    if (this.reduced) return;
    burstConfetti(this.state, this.canvas.getBoundingClientRect().width);
    this.kick();
  }

  coins(x: number, y: number) {
    if (this.reduced) return;
    coinShower(this.state, x, y);
    this.kick();
  }

  shake(amount: number) {
    if (this.reduced) return;
    addShake(this.state, amount);
    this.kick();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.state.parts = [];
    this.state.shake = 0;
    if (this.stage) this.stage.style.transform = '';
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (t: number) => {
    stepFx(this.state, (t - this.last) / 1000);
    this.last = t;
    const r = this.canvas.getBoundingClientRect();
    if (this.ctx) {
      this.ctx.clearRect(0, 0, r.width, r.height);
      drawFx(this.ctx, this.state);
    }
    if (this.stage) {
      const o = shakeOffset(this.state);
      this.stage.style.transform = o.x || o.y ? `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px)` : '';
    }
    this.raf = this.state.parts.length || this.state.shake ? requestAnimationFrame(this.frame) : 0;
  };
}
