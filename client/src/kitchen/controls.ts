import { kitchen } from '@dovey/shared';
import { NUDGE, Vec, aimAssist, predictChop, predictGrab, screenToWorldDir } from './aim';
import { TapPilot } from './tapControls';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight']);
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** a quick key tap still walks for this many input ticks (~100ms), even if it was released before the next sample */
export const KEY_TAP_TICKS = 3;
/** most inputs sent at once to catch up after a late timer (matches the server's input buffer) */
export const MAX_CATCHUP = 4;

export interface ControlContext {
  /** the predicted local chef */
  pose(): { x: number; y: number; fx: number; fy: number } | null;
  stations(): readonly kitchen.Station[];
  /** what the local chef holds (for aim assist) */
  held?(): kitchen.Item | null;
}

/**
 * How many input ticks are due at `now`. Timers fire late (busy frames,
 * throttled tabs); sending one input per timer call would slow the chef and
 * starve the tap pilot, so late calls catch up by up to MAX_CATCHUP ticks.
 */
export class InputClock {
  private last: number | null = null;
  private debt = 0.5;

  due(now: number): number {
    if (this.last === null) {
      this.last = now;
      return 1;
    }
    this.debt += (now - this.last) / (1000 / kitchen.K_TICK_HZ);
    this.last = now;
    const n = Math.min(MAX_CATCHUP, Math.floor(this.debt));
    this.debt = Math.min(this.debt - n, 1);
    return n;
  }
}

/**
 * Keyboard (WASD/arrows screen-relative, Space grab, E chop, Shift dash), touch
 * buttons, joystick and tap-to-walk, sampled at the sim rate into one input.
 */
export class Controls {
  readonly pilot = new TapPilot();
  context: ControlContext | null = null;
  private keys = new Set<string>();
  /** movement keys pressed recently, counted down per sample so taps between samples still move */
  private tapped = new Map<string, number>();
  private grabQ = false;
  private dashQ = false;
  private dashDir: Vec | null = null;
  private useKey = false;
  private useTouch = false;
  private stick = { mx: 0, my: 0 };
  private seq = 0;

  attach(target: Window = window): () => void {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.keyDown(e.code, e.repeat);
    };
    const up = (e: KeyboardEvent) => this.keyUp(e.code);
    const blur = () => {
      this.keys.clear();
      this.tapped.clear();
      this.useKey = false;
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  /** any key takes over from an active tap path */
  keyDown(code: string, repeat = false) {
    if (repeat) return;
    // game keys take over from a tap path; Meta/Tab/etc. don't
    if (GAME_KEYS.has(code)) this.pilot.cancel();
    this.keys.add(code);
    if (MOVE_KEYS.has(code)) this.tapped.set(code, KEY_TAP_TICKS);
    if (code === 'Space') this.grabQ = true;
    if (code === 'ShiftLeft' || code === 'ShiftRight') this.dashQ = true;
    if (code === 'KeyE') this.useKey = true;
  }

  keyUp(code: string) {
    this.keys.delete(code);
    if (code === 'KeyE') this.useKey = false;
  }

  pressGrab() {
    this.grabQ = true;
  }

  pressDash() {
    this.dashQ = true;
  }

  /** dash toward a world direction (double-tap / right-click) */
  dashToward(dir: Vec) {
    const l = Math.hypot(dir.x, dir.y);
    if (l < 1e-6) return;
    this.dashDir = { x: dir.x / l, y: dir.y / l };
    this.dashQ = true;
  }

  setUse(on: boolean) {
    this.useTouch = on;
  }

  /** world-space stick (the joystick converts from screen first) */
  setStick(mx: number, my: number) {
    this.stick = { mx, my };
  }

  next(): kitchen.KitchenInput {
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c) || (this.tapped.get(c) ?? 0) > 0) ? 1 : 0);
    const sx = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
    const sy = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
    for (const [code, left] of this.tapped) {
      if (left <= 1) this.tapped.delete(code);
      else this.tapped.set(code, left - 1);
    }
    let mx = 0;
    let my = 0;
    if (sx || sy) ({ x: mx, y: my } = screenToWorldDir(sx, sy));
    else {
      mx = this.stick.mx;
      my = this.stick.my;
    }
    const manual = Math.hypot(mx, my) > 0.01;
    let grab = this.grabQ;
    let use = this.useKey || this.useTouch;
    const dash = this.dashQ;
    const ctx = this.context;
    const pose = ctx?.pose() ?? null;
    if (manual) this.pilot.cancel();
    else {
      const auto = pose ? this.pilot.step(pose) : null;
      if (auto) {
        mx = auto.mx;
        my = auto.my;
        grab ||= auto.grab;
        use ||= auto.use;
      } else if ((grab || use) && pose && ctx) {
        const held = ctx.held?.() ?? null;
        const a = aimAssist(pose, ctx.stations(), (st) => (grab ? predictGrab(st, held) : predictChop(st, held)));
        if (a) {
          mx = a.x * NUDGE;
          my = a.y * NUDGE;
        }
      }
    }
    if (dash && this.dashDir) {
      mx = this.dashDir.x;
      my = this.dashDir.y;
    }
    const inp = { seq: ++this.seq, mx, my, grab, use, dash };
    this.grabQ = false;
    this.dashQ = false;
    this.dashDir = null;
    return inp;
  }
}
