import { Vec, screenToWorldDir } from './aim';

/** full deflection at this many screen px from where the finger went down */
export const STICK_RADIUS = 56;
/** a press that moves less than this stays a tap */
export const STICK_START = 12;

/**
 * Floating joystick: the stick centres wherever the finger lands; dragging
 * past STICK_START steers (screen-relative, converted to world axes).
 */
export class FloatingStick {
  origin: Vec | null = null;
  /** knob offset from origin in screen px, clamped to the radius */
  knob: Vec = { x: 0, y: 0 };
  active = false;

  down(x: number, y: number) {
    this.origin = { x, y };
    this.knob = { x: 0, y: 0 };
    this.active = false;
  }

  /** world move vector while steering, null while it is still a possible tap */
  move(x: number, y: number): Vec | null {
    if (!this.origin) return null;
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (!this.active && d < STICK_START) return null;
    this.active = true;
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    this.knob = { x: dx, y: dy };
    return screenToWorldDir(dx / STICK_RADIUS, dy / STICK_RADIUS);
  }

  /** ends the press; true when it was steering (so it is not a tap) */
  up(): boolean {
    const was = this.active;
    this.origin = null;
    this.knob = { x: 0, y: 0 };
    this.active = false;
    return was;
  }
}
