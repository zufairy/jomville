import type { KitchenRound } from './net';
import type { IsoRenderer } from './isoRenderer';
import { Vec, predictGrab, stationOn } from './aim';
import { FloatingStick } from './joystick';
import { planTap } from './tapControls';
import { ksfx } from './sounds';

/** a station press held this long becomes a chop hold */
export const HOLD_MS = 250;
const DOUBLE_MS = 320;
const DASH_COOLDOWN_MS = 1000;

export interface PointerOptions {
  /** floating joystick mode on */
  joystick: () => boolean;
  /** joystick visual: knob offset and origin in client px, null when released */
  onStick: (s: { knob: Vec; origin: Vec } | null) => void;
  onDash?: () => void;
}

interface Press {
  id: number;
  kind: 'station' | 'floor';
  tile: Vec;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Canvas pointer input: tap floor to walk, tap a station to use it, hold a
 * station to chop (pointer capture keeps the hold through finger drift),
 * double-tap / right-click to dash, optional floating joystick, pinch and
 * wheel zoom.
 */
export function bindPointer(canvas: HTMLCanvasElement, round: KitchenRound, renderer: IsoRenderer, opts: PointerOptions): () => void {
  const pilot = round.controls.pilot;
  const pointers = new Map<number, Vec>();
  const stick = new FloatingStick();
  let press: Press | null = null;
  let pinch: number | null = null;
  /** a pinch happened in this multi-touch sequence: no taps until every finger lifts */
  let pinched = false;
  let lastTap = { t: -Infinity, x: -99, y: -99 };
  let lastDash = -Infinity;

  const pose = () => round.predictor?.pose() ?? null;

  pilot.onArrive = (plan) => {
    const v = round.view;
    if (!v || !plan.station || plan.action !== 'grab') return;
    const st = stationOn(v.stations, plan.station.x, plan.station.y);
    const held = v.chefs.find((c) => c.id === round.me)?.held ?? null;
    if (st && !predictGrab(st, held)) {
      renderer.shake(st.x, st.y);
      ksfx.nope();
    }
  };

  const releaseStick = () => {
    if (stick.up()) round.controls.setStick(0, 0);
    opts.onStick(null);
  };

  const dashAt = (tile: Vec) => {
    const v = round.view;
    const p = pose();
    if (!v || !p) return;
    const now = performance.now();
    if (now - lastDash < DASH_COOLDOWN_MS) return;
    lastDash = now;
    round.controls.dashToward({ x: tile.x + 0.5 - p.x, y: tile.y + 0.5 - p.y });
    ksfx.dash();
    opts.onDash?.();
    const plan = planTap(v, p, tile);
    if (plan && !plan.station) pilot.start(plan);
  };

  const tapFloor = (tile: Vec) => {
    const v = round.view;
    const p = pose();
    if (!v || !p) return;
    const now = performance.now();
    if (now - lastTap.t < DOUBLE_MS && Math.abs(tile.x - lastTap.x) <= 1 && Math.abs(tile.y - lastTap.y) <= 1) {
      lastTap = { t: -Infinity, x: -99, y: -99 };
      dashAt(tile);
      return;
    }
    lastTap = { t: now, ...tile };
    const plan = planTap(v, p, tile);
    if (plan) pilot.start(plan);
    else ksfx.nope();
  };

  const down = (e: PointerEvent) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      // second finger: this is a pinch, drop whatever the first finger started
      if (press?.kind === 'station') pilot.cancel();
      if (press?.timer) clearTimeout(press.timer);
      press = null;
      releaseStick();
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      pinched = true;
      return;
    }
    const v = round.view;
    const p = pose();
    if (!v || !p) return;
    const tile = renderer.pickTile(e.clientX, e.clientY);
    if (e.button === 2) {
      dashAt(tile);
      return;
    }
    const st = stationOn(v.stations, tile.x, tile.y);
    if (st) {
      const plan = planTap(v, p, tile, 'pending');
      if (!plan) {
        renderer.shake(tile.x, tile.y);
        ksfx.nope();
        return;
      }
      pilot.start(plan);
      pilot.holding = true;
      press = { id: e.pointerId, kind: 'station', tile, timer: setTimeout(() => pilot.decide('hold'), HOLD_MS) };
      return;
    }
    press = { id: e.pointerId, kind: 'floor', tile, timer: null };
    if (opts.joystick()) stick.down(e.clientX, e.clientY);
  };

  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch !== null && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) renderer.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d;
      return;
    }
    if (press?.id !== e.pointerId || press.kind !== 'floor' || !stick.origin) return;
    const w = stick.move(e.clientX, e.clientY);
    if (!w) return;
    pilot.cancel();
    round.controls.setStick(w.x, w.y);
    opts.onStick({ knob: stick.knob, origin: stick.origin });
  };

  const up = (e: PointerEvent, cancelled: boolean) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pinched) {
      if (!pointers.size) pinched = false;
      return;
    }
    if (!press || press.id !== e.pointerId) return;
    const pr = press;
    press = null;
    if (pr.timer) clearTimeout(pr.timer);
    if (pr.kind === 'station') {
      if (cancelled && pilot.plan?.action === 'pending') pilot.cancel();
      else pilot.decide('grab');
      pilot.holding = false;
      return;
    }
    const steered = stick.active;
    releaseStick();
    if (!steered && !cancelled) tapFloor(pr.tile);
  };

  const onUp = (e: PointerEvent) => up(e, false);
  const onCancel = (e: PointerEvent) => up(e, true);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    renderer.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  };
  const menu = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('lostpointercapture', onCancel);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', menu);
  return () => {
    if (press?.timer) clearTimeout(press.timer);
    pilot.onArrive = null;
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('lostpointercapture', onCancel);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', menu);
  };
}
