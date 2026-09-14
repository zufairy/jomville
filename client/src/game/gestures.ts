/**
 * Pure pointer/wheel gesture recognizer for camera pan/zoom/fling. No Pixi
 * import so it can be unit tested in isolation and wired to any event source.
 */

export interface PointerEvt {
  pointerId: number;
  x: number;
  y: number;
  button?: number;
  t: number;
}

export interface WheelEvt {
  deltaY: number;
  x: number;
  y: number;
}

export interface GestureCallbacks {
  onPan: (dx: number, dy: number) => void;
  onPinch: (scaleFactor: number, cx: number, cy: number) => void;
  onFling: (vx: number, vy: number) => void;
  onWheelZoom: (factor: number, x: number, y: number) => void;
}

/** total screen-px displacement from pointerdown before it counts as a drag */
const DRAG_THRESHOLD = 8;
/** only fling-history samples within this many ms of pointerup are used */
const FLING_WINDOW_MS = 100;
/** wheel notch -> zoom factor */
const WHEEL_STEP = 1.08;

interface PointerState {
  x: number;
  y: number;
  startX: number;
  startY: number;
  history: { x: number; y: number; t: number }[];
}

export class GestureController {
  private pts = new Map<number, PointerState>();
  private twoPointerPrev: { dist: number; mid: { x: number; y: number } } | null = null;
  private sequenceDragged = false;
  private hadPinch = false;
  private tapConsumable = false;

  constructor(private cb: GestureCallbacks) {}

  down(e: PointerEvt) {
    if (this.pts.size === 0) {
      this.sequenceDragged = false;
      this.hadPinch = false;
    }
    this.pts.set(e.pointerId, { x: e.x, y: e.y, startX: e.x, startY: e.y, history: [{ x: e.x, y: e.y, t: e.t }] });
    if (this.pts.size >= 2) this.twoPointerPrev = null;
  }

  move(e: PointerEvt) {
    const p = this.pts.get(e.pointerId);
    if (!p) return;
    p.history.push({ x: e.x, y: e.y, t: e.t });
    while (p.history.length > 1 && e.t - p.history[0].t > FLING_WINDOW_MS) p.history.shift();

    if (this.pts.size >= 2) {
      p.x = e.x;
      p.y = e.y;
      this.hadPinch = true;
      this.sequenceDragged = true;
      const [a, b] = [...this.pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.twoPointerPrev) {
        const dx = mid.x - this.twoPointerPrev.mid.x;
        const dy = mid.y - this.twoPointerPrev.mid.y;
        if (dx !== 0 || dy !== 0) this.cb.onPan(dx, dy);
        if (this.twoPointerPrev.dist > 0 && dist !== this.twoPointerPrev.dist) {
          this.cb.onPinch(dist / this.twoPointerPrev.dist, mid.x, mid.y);
        }
      }
      this.twoPointerPrev = { dist, mid };
      return;
    }

    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const total = Math.hypot(e.x - p.startX, e.y - p.startY);
    if (!this.sequenceDragged && total > DRAG_THRESHOLD) this.sequenceDragged = true;
    if (this.sequenceDragged) this.cb.onPan(dx, dy);
    p.x = e.x;
    p.y = e.y;
  }

  up(e: PointerEvt) {
    const p = this.pts.get(e.pointerId);
    this.pts.delete(e.pointerId);
    if (this.pts.size < 2) this.twoPointerPrev = null;
    if (this.pts.size > 0) return; // sequence continues (other finger still down)

    if (this.sequenceDragged && !this.hadPinch && p) {
      const hist = p.history.filter((h) => e.t - h.t <= FLING_WINDOW_MS);
      if (hist.length >= 2) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const dt = last.t - first.t;
        if (dt > 0) this.cb.onFling((last.x - first.x) / dt, (last.y - first.y) / dt);
      }
    }
    this.tapConsumable = this.sequenceDragged;
    this.sequenceDragged = false;
    this.hadPinch = false;
  }

  cancel(e: PointerEvt) {
    this.up(e);
  }

  wheel(e: WheelEvt) {
    const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
    this.cb.onWheelZoom(factor, e.x, e.y);
  }

  /** true if the last completed pointer sequence was a drag/pinch — the
   *  caller's tap handler should bail out. Reading this consumes it. */
  consumeTap(): boolean {
    const v = this.tapConsumable;
    this.tapConsumable = false;
    return v;
  }
}
