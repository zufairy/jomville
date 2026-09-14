# Duel HD Implementation Plan (part 4 of 7: Tasks 9-11, particles, sfx, hand art)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Header, Global Constraints and File Map: `docs/superpowers/plans/2026-09-14-duel-hd.md`. Spec: `docs/superpowers/specs/2026-09-14-duel-hd-design.md`. Tasks 1-8 must be done first. Client tests run in vitest's **node** environment (no DOM); every unit-tested client module is pure TypeScript.

---

## Task 9: Canvas2D particle layer

**Files:**
- Create: `client/src/game/duelFx.ts`, `client/src/game/duelFx.test.ts`

**Interfaces:**
- Consumes: nothing (DOM types only in `drawFx` / `FxLayer`).
- Produces:
  - `type ParticleKind = 'spark' | 'confetti' | 'coin'`
  - `interface Particle { kind: ParticleKind; x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; life: number; ttl: number }`
  - `interface FxState { parts: Particle[]; shake: number }`
  - `MAX_PARTICLES = 260`, `MAX_SHAKE = 18`
  - `createFx(): FxState`
  - `burstSparks(s: FxState, x: number, y: number, rand?: () => number, n?: number): void`
  - `burstConfetti(s: FxState, width: number, rand?: () => number, n?: number): void`
  - `coinShower(s: FxState, x: number, y: number, rand?: () => number, n?: number): void`
  - `addShake(s: FxState, amount: number): void`
  - `stepFx(s: FxState, dtSeconds: number): FxState`, where dt is clamped to 0.05
  - `shakeOffset(s: FxState, rand?: () => number): { x: number; y: number }`
  - `drawFx(ctx: CanvasRenderingContext2D, s: FxState): void`
  - `class FxLayer { constructor(canvas: HTMLCanvasElement, stage: HTMLElement | null, reduced: boolean); resize(): void; sparks(x: number, y: number, n?: number): void; confetti(): void; coins(x: number, y: number): void; shake(amount: number): void; destroy(): void }`

- [ ] **Step 1: Write the failing test**

Create `client/src/game/duelFx.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, MAX_SHAKE, Particle, addShake, burstConfetti, burstSparks, coinShower, createFx, shakeOffset, stepFx } from './duelFx';

const fixed = (v: number) => () => v;
const part = (o: Partial<Particle>): Particle => ({ kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, size: 3, color: '#fff', life: 0, ttl: 1, ...o });

describe('duel particles', () => {
  it('sparks burst from the impact point', () => {
    const s = createFx();
    burstSparks(s, 100, 50, fixed(0.5), 10);
    expect(s.parts).toHaveLength(10);
    for (const p of s.parts) expect(p).toMatchObject({ kind: 'spark', x: 100, y: 50, life: 0 });
  });

  it('confetti starts above the top edge and coins fly upward', () => {
    const s = createFx();
    burstConfetti(s, 400, fixed(0.5), 5);
    coinShower(s, 200, 300, fixed(0.5), 5);
    expect(s.parts.filter((p) => p.kind === 'confetti').every((p) => p.y < 0 && p.x === 200)).toBe(true);
    expect(s.parts.filter((p) => p.kind === 'coin').every((p) => p.vy < 0)).toBe(true);
  });

  it('a step moves by velocity, gravity pulls down and drag slows', () => {
    const s = createFx();
    s.parts.push(part({ kind: 'coin', vx: 100, vy: 0 }));
    stepFx(s, 0.02);
    const p = s.parts[0];
    // vy += 1300*0.02 = 26, then drag exp(-0.4*0.02): vx 99.20, vy 25.79
    expect(p.vx).toBeCloseTo(99.2, 1);
    expect(p.vy).toBeCloseTo(25.79, 1);
    expect(p.x).toBeCloseTo(1.984, 2);
    expect(p.y).toBeGreaterThan(0);
    expect(p.life).toBeCloseTo(0.02, 5);
  });

  it('sparks point along their flight', () => {
    const s = createFx();
    s.parts.push(part({ kind: 'spark', vx: 0, vy: -200 }));
    stepFx(s, 0.01);
    expect(s.parts[0].rot).toBeCloseTo(Math.atan2(s.parts[0].vy, s.parts[0].vx), 5);
  });

  it('particles die at their ttl', () => {
    const s = createFx();
    s.parts.push(part({ ttl: 0.08 }));
    stepFx(s, 0.05);
    expect(s.parts).toHaveLength(1);
    stepFx(s, 0.05);
    expect(s.parts).toHaveLength(0);
  });

  it('a long frame hitch advances at most 50 ms', () => {
    const s = createFx();
    s.parts.push(part({ kind: 'confetti', vx: 100, ttl: 10 }));
    stepFx(s, 1);
    expect(s.parts[0].life).toBeCloseTo(0.05, 5);
    expect(s.parts[0].x).toBeLessThan(6);
  });

  it('never holds more than the cap', () => {
    const s = createFx();
    burstConfetti(s, 400, Math.random, 1000);
    expect(s.parts).toHaveLength(MAX_PARTICLES);
  });

  it('shake is capped, jitters within its size and decays to rest', () => {
    const s = createFx();
    addShake(s, 30);
    expect(s.shake).toBe(MAX_SHAKE);
    expect(shakeOffset(s, fixed(1))).toEqual({ x: MAX_SHAKE, y: MAX_SHAKE });
    for (let i = 0; i < 40; i++) stepFx(s, 0.05);
    expect(s.shake).toBe(0);
    expect(shakeOffset(s, fixed(1))).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @dovey/client exec vitest run src/game/duelFx.test.ts`
Expected: FAIL, `Failed to resolve import "./duelFx"`.

- [ ] **Step 3: Implement `client/src/game/duelFx.ts`**

```ts
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

const pickOf = <T>(xs: T[], rand: Rand) => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))];

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
```

- [ ] **Step 4: Run tests and types**

Run: `pnpm --filter @dovey/client exec vitest run src/game/duelFx.test.ts`
Expected: `Tests  8 passed (8)`

Run: `pnpm --filter @dovey/client typecheck`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add client/src/game/duelFx.ts client/src/game/duelFx.test.ts
git commit -F - <<'MSG'
feat(client): Canvas2D duel particles (sparks, confetti, coins) and screen shake

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

## Task 10: Duel sfx and a mute flag

**Files:**
- Modify: `client/src/audio.ts`

**Interfaces:**
- Consumes: the existing private `tone(freq, dur, type, gain?, at?, slideTo?)` and `noise(dur, gain?, at?, hp?)`.
- Produces:
  - `sfxMuted(): boolean` and `setSfxMuted(v: boolean): void`, persisted in `localStorage['dovey.sfxMuted']` as `'1'`/`'0'`
  - new members on `sfx`: `duelTick(i: 0 | 1 | 2)`, `whoosh()`, `clash()`, `roundWin()`, `roundLose()`, `roundDraw()`, `fanfare()`, `defeat()`, `coinCount()`

No existing mute setting exists (checked: `grep -rn "mute" client/src` only finds the chat-mute list and video element `.muted`), so this adds one.

- [ ] **Step 1: Add the mute flag**

In `client/src/audio.ts`, directly after `let ctx: AudioContext | null = null;` add:
```ts
const MUTE_KEY = 'dovey.sfxMuted';
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

/** true while UI sound effects are switched off (persisted per device) */
export function sfxMuted(): boolean {
  return muted;
}

export function setSfxMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* storage unavailable: the choice lasts this session */
  }
}
```

In `function tone(...)`, replace its first line `  const a = ac();` with:
```ts
  if (muted) return;
  const a = ac();
```
In `function noise(...)`, replace its first line `  const a = ac();` with:
```ts
  if (muted) return;
  const a = ac();
```

- [ ] **Step 2: Add the duel sounds**

Inside `export const sfx = { … }`, after the `nope()` member (before the closing `};`), add:
```ts
  /** "rock… paper… scissors…" beat; climbs with i */
  duelTick(i: 0 | 1 | 2) {
    tone(520 + i * 140, 0.09, 'square', 0.05);
    noise(0.03, 0.03, 0, 3000);
  },
  /** both hands fly to the centre */
  whoosh() {
    noise(0.28, 0.06, 0, 500);
    tone(180, 0.25, 'sine', 0.03, 0, 620);
  },
  /** hands collide */
  clash() {
    noise(0.18, 0.12, 0, 200);
    tone(110, 0.22, 'square', 0.09, 0, 55);
    tone(1400, 0.08, 'triangle', 0.04, 0.01, 700);
  },
  /** you took the round */
  roundWin() {
    tone(660, 0.1, 'triangle', 0.07);
    tone(880, 0.1, 'triangle', 0.07, 0.09);
    tone(1320, 0.22, 'triangle', 0.06, 0.18);
  },
  /** they took the round */
  roundLose() {
    tone(392, 0.16, 'sawtooth', 0.045, 0, 330);
    tone(294, 0.3, 'sawtooth', 0.045, 0.15, 220);
  },
  /** nobody took the round */
  roundDraw() {
    tone(440, 0.12, 'sine', 0.05);
    tone(440, 0.12, 'sine', 0.05, 0.14);
  },
  /** duel won */
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.045, i * 0.11));
    tone(1047, 0.7, 'triangle', 0.06, 0.44);
    tone(1319, 0.7, 'triangle', 0.04, 0.44);
    noise(0.5, 0.02, 0.44, 4000);
  },
  /** duel lost */
  defeat() {
    tone(330, 0.25, 'triangle', 0.05, 0, 300);
    tone(262, 0.25, 'triangle', 0.05, 0.22, 240);
    tone(196, 0.5, 'triangle', 0.05, 0.44, 150);
  },
  /** one tick of the result coin counter */
  coinCount() {
    tone(2200 + Math.random() * 400, 0.04, 'square', 0.025);
  },
```

- [ ] **Step 3: Types and tests**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test`
Expected: no type errors; all client tests pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/audio.ts
git commit -F - <<'MSG'
feat(client): duel synth sfx and a persisted sound mute flag

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

## Task 11: SVG hand art

**Files:**
- Create: `client/src/ui/duel/HandIcon.tsx`

**Interfaces:**
- Consumes: React `useId`.
- Produces:
  - `type HandPick = 0 | 1 | 2`
  - `HAND_NAMES: readonly ['rock', 'paper', 'scissors']`
  - `HandIcon(props: { pick: HandPick; cracked?: boolean; className?: string }): JSX.Element`

The hands are drawn upright (fingers up) in a 120×120 viewBox with a cartoon outline, a skin gradient, a highlight and a sleeve cuff. The arena rotates and mirrors them with CSS. With `cracked`, a jagged crack overlay is drawn; CSS (Task 13) animates it. Visual check happens in Task 16.

- [ ] **Step 1: Create `client/src/ui/duel/HandIcon.tsx`**

```tsx
import { useId } from 'react';

export type HandPick = 0 | 1 | 2;
export const HAND_NAMES = ['rock', 'paper', 'scissors'] as const;

const OUTLINE = '#4a2412';
const CUFF = '#8b5cf6';
const CUFF_EDGE = '#e8c26a';

/**
 * Vector rock / paper / scissors hands, drawn upright (fingers up) so the arena
 * can rotate them toward the centre. Gradient ids are per instance.
 */
export function HandIcon({ pick, cracked = false, className }: { pick: HandPick; cracked?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const skin = `dhd-skin-${uid}`;
  const shine = `dhd-shine-${uid}`;
  const part = { fill: `url(#${skin})`, stroke: OUTLINE, strokeWidth: 4, strokeLinejoin: 'round' as const };

  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label={HAND_NAMES[pick]} data-pick={HAND_NAMES[pick]}>
      <defs>
        <linearGradient id={skin} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffe3c7" />
          <stop offset="0.55" stopColor="#f6b98a" />
          <stop offset="1" stopColor="#d98a5c" />
        </linearGradient>
        <radialGradient id={shine} cx="0.35" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {pick === 0 && (
        <g>
          {[26, 43, 60, 77].map((x) => (
            <rect key={x} x={x} y={30} width={17} height={30} rx={8.5} {...part} />
          ))}
          <rect x={24} y={42} width={72} height={58} rx={22} {...part} />
          <path d="M38 58 v10 M55 58 v10 M72 58 v10" stroke={OUTLINE} strokeWidth={3} strokeLinecap="round" opacity={0.45} />
          <rect x={18} y={64} width={54} height={19} rx={9.5} {...part} />
          <ellipse cx={52} cy={60} rx={26} ry={16} fill={`url(#${shine})`} />
        </g>
      )}

      {pick === 1 && (
        <g>
          <rect x={30} y={20} width={15} height={48} rx={7.5} {...part} />
          <rect x={46} y={10} width={15} height={58} rx={7.5} {...part} />
          <rect x={62} y={14} width={15} height={54} rx={7.5} {...part} />
          <rect x={78} y={28} width={14} height={42} rx={7} {...part} />
          <rect x={4} y={58} width={44} height={16} rx={8} transform="rotate(-38 26 66)" {...part} />
          <rect x={28} y={52} width={66} height={50} rx={21} {...part} />
          <ellipse cx={56} cy={70} rx={24} ry={16} fill={`url(#${shine})`} />
        </g>
      )}

      {pick === 2 && (
        <g>
          <rect x={30} y={6} width={15} height={62} rx={7.5} transform="rotate(-15 37 64)" {...part} />
          <rect x={48} y={4} width={15} height={64} rx={7.5} transform="rotate(12 55 64)" {...part} />
          <rect x={62} y={46} width={16} height={24} rx={8} {...part} />
          <rect x={77} y={50} width={15} height={22} rx={7.5} {...part} />
          <rect x={26} y={56} width={68} height={46} rx={21} {...part} />
          <rect x={20} y={70} width={48} height={17} rx={8.5} {...part} />
          <ellipse cx={54} cy={72} rx={24} ry={14} fill={`url(#${shine})`} />
        </g>
      )}

      <rect x={34} y={98} width={52} height={20} rx={6} fill={CUFF} stroke={OUTLINE} strokeWidth={4} />
      <rect x={34} y={98} width={52} height={6} rx={3} fill={CUFF_EDGE} opacity={0.9} />

      {cracked && (
        <g className="dhd-crack" fill="none" stroke="#1b0d06" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M60 22 L52 44 L64 56 L50 76 L60 96" />
          <path d="M52 44 L38 50" />
          <path d="M64 56 L80 60 L86 74" />
          <path d="M50 76 L36 84" />
        </g>
      )}
    </svg>
  );
}
```

- [ ] **Step 2: Types**

Run: `pnpm --filter @dovey/client typecheck`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add client/src/ui/duel/HandIcon.tsx
git commit -F - <<'MSG'
feat(client): vector rock/paper/scissors hands with crack overlay

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

Continue with `docs/superpowers/plans/2026-09-14-duel-hd-part5.md`.
