import type { KitchenRound } from './net';
import type { IsoRenderer } from './isoRenderer';
import { Vec, predictGrab, stationOn } from './aim';
import { FloatingStick, STICK_START } from './joystick';
import { TapAction, planTap } from './tapControls';
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
  tile: Vec;
  station: boolean;
  start: Vec;
  /** crossed STICK_START px: never a tap */
  moved: boolean;
  /** the station walk/hold has begun (pilot owns the press) */
  begun: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Canvas pointer input: tap floor to walk, tap a station to use it, hold a
 * station to chop (pointer capture keeps the hold through finger drift),
 * double-tap / right-click to dash, optional floating joystick (starts on any
 * press, stations included), pinch and wheel zoom.
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

  // controls aim from the sim position, never the smoothed display pose
  const pose = () => round.predictor?.simPose() ?? null;

  const nope = (tile?: Vec | null) => {
    if (tile) renderer.shake(tile.x, tile.y);
    ksfx.nope();
  };

  pilot.onArrive = (plan) => {
    const v = round.view;
    if (!v || !plan.station || plan.action !== 'grab') return;
    const st = stationOn(v.stations, plan.station.x, plan.station.y);
    const held = v.chefs.find((c) => c.id === round.me)?.held ?? null;
    if (st && !predictGrab(st, held)) nope(st);
  };

  // someone in the way: replan once from where we are, then give up audibly
  pilot.onBlocked = (plan, holding) => {
    const v = round.view;
    const p = pose();
    if (v && p && !plan.retried) {
      const again = planTap(v, p, plan.target, plan.action);
      if (again) {
        again.retried = true;
        pilot.start(again);
        pilot.holding = holding;
        return;
      }
    }
    nope(plan.station);
  };

  const releaseStick = () => {
    if (stick.up()) round.controls.setStick(0, 0);
    opts.onStick(null);
  };

  const beginStation = (pr: Press, action: TapAction) => {
    const v = round.view;
    const p = pose();
    if (!v || !p) return;
    pr.begun = true;
    const plan = planTap(v, p, pr.tile, action);
    if (!plan) return nope(pr.tile);
    pilot.start(plan);
    if (action === 'pending') {
      pilot.holding = true;
      pr.timer = setTimeout(() => pilot.decide('hold'), HOLD_MS);
    }
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
    else nope();
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
      if (press?.begun && press.station) pilot.cancel();
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
    const station = !!stationOn(v.stations, tile.x, tile.y);
    const pr: Press = { id: e.pointerId, tile, station, start: { x: e.clientX, y: e.clientY }, moved: false, begun: false, timer: null };
    press = pr;
    if (opts.joystick()) {
      stick.down(e.clientX, e.clientY);
      // the press might become a drag: only a still hold on a station starts chopping
      if (station)
        pr.timer = setTimeout(() => {
          if (press === pr && !pr.moved) {
            beginStation(pr, 'hold');
            pilot.holding = true;
          }
        }, HOLD_MS);
      return;
    }
    if (station) beginStation(pr, 'pending');
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
    const pr = press;
    if (pr?.id !== e.pointerId) return;
    if (!pr.moved && Math.hypot(e.clientX - pr.start.x, e.clientY - pr.start.y) > STICK_START) pr.moved = true;
    // a started station hold survives finger drift; everything else may steer
    if (!stick.origin || (pr.begun && pr.station)) return;
    const w = stick.move(e.clientX, e.clientY);
    if (!w) return;
    if (pr.timer) clearTimeout(pr.timer);
    pr.timer = null;
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
    const pr = press;
    if (!pr || pr.id !== e.pointerId) return;
    press = null;
    if (pr.timer) clearTimeout(pr.timer);
    const steered = stick.active;
    releaseStick();
    if (pr.station && pr.begun) {
      if (cancelled && pilot.plan?.action === 'pending') pilot.cancel();
      else pilot.decide('grab');
      pilot.holding = false;
      return;
    }
    if (steered || cancelled || pr.moved) return;
    if (pr.station) beginStation(pr, 'grab');
    else tapFloor(pr.tile);
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
    press = null;
    pilot.onArrive = null;
    pilot.onBlocked = null;
    pilot.cancel();
    round.controls.setStick(0, 0);
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('lostpointercapture', onCancel);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', menu);
  };
}
