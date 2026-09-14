import { findPath, kitchen, makeGrid } from '@dovey/shared';
import { AXES, NUDGE, Vec } from './aim';

export type TapAction = 'walk' | 'grab' | 'hold' | 'pending';

export interface TapPlan {
  /** tile the chef walks to */
  goal: Vec;
  /** tile centres to steer through, excluding the start tile */
  path: Vec[];
  /** station tile acted on (null for plain walks) */
  station: Vec | null;
  /** axis from goal to station */
  face: Vec | null;
  action: TapAction;
}

export interface LevelGrid {
  solid: readonly boolean[];
  w: number;
  h: number;
}

const solidAt = (lv: LevelGrid, x: number, y: number) => x < 0 || y < 0 || x >= lv.w || y >= lv.h || lv.solid[y * lv.w + x];

function gridOf(lv: LevelGrid) {
  const blocked: Array<[number, number]> = [];
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (lv.solid[y * lv.w + x]) blocked.push([x, y]);
  return makeGrid(lv.w, lv.h, blocked);
}

/**
 * Where a tap on `tile` sends a chef standing at `from`: straight there for
 * floor, or to the nearest free tile beside a solid tile (facing it). null
 * when nothing reachable fits.
 */
export function planTap(lv: LevelGrid, from: { x: number; y: number }, tile: Vec, action: TapAction = 'grab'): TapPlan | null {
  if (tile.x < 0 || tile.y < 0 || tile.x >= lv.w || tile.y >= lv.h) return null;
  const grid = gridOf(lv);
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) };
  if (!solidAt(lv, tile.x, tile.y)) {
    const path = findPath(grid, start, tile);
    return path && { goal: tile, path, station: null, face: null, action: 'walk' };
  }
  let best: TapPlan | null = null;
  let bestCost = Infinity;
  for (const a of AXES) {
    const stand = { x: tile.x + a.x, y: tile.y + a.y };
    if (solidAt(lv, stand.x, stand.y)) continue;
    const path = findPath(grid, start, stand);
    if (!path) continue;
    const cost = path.length + Math.hypot(stand.x + 0.5 - from.x, stand.y + 0.5 - from.y) * 0.01;
    if (cost < bestCost) {
      bestCost = cost;
      best = { goal: stand, path, station: tile, face: { x: 0 - a.x, y: 0 - a.y }, action };
    }
  }
  return best;
}

export interface PilotStep {
  mx: number;
  my: number;
  grab: boolean;
  use: boolean;
}

const WAYPOINT = 0.3;
const ARRIVE = 0.12;
const STUCK_TICKS = 45;

/**
 * Steers a chef along a tap plan one sim tick at a time, producing stick
 * input for the normal prediction path; the server stays authoritative.
 */
export class TapPilot {
  plan: TapPlan | null = null;
  /** true while the pointer that started a hold is still down */
  holding = false;
  onArrive: ((plan: TapPlan) => void) | null = null;
  private i = 0;
  private best = Infinity;
  private stuck = 0;
  private arrived = false;

  get active() {
    return !!this.plan;
  }

  start(plan: TapPlan) {
    this.plan = plan;
    this.i = 0;
    this.best = Infinity;
    this.stuck = 0;
    this.arrived = false;
  }

  cancel() {
    this.plan = null;
    this.holding = false;
  }

  /** a pending press became a tap (grab) or a hold (chop) */
  decide(action: 'grab' | 'hold') {
    if (this.plan?.action === 'pending') this.plan.action = action;
  }

  step(pose: { x: number; y: number }): PilotStep | null {
    const plan = this.plan;
    if (!plan) return null;
    const idle = { mx: 0, my: 0, grab: false, use: false };
    if (!this.arrived) {
      const last = plan.path.length - 1;
      while (this.i < last && this.dist(pose, plan.path[this.i]) < WAYPOINT) this.nextWaypoint();
      const target = plan.path[this.i] ?? plan.goal;
      const d = this.dist(pose, target);
      const atGoal = this.i >= last && (plan.station ? Math.floor(pose.x) === plan.goal.x && Math.floor(pose.y) === plan.goal.y && this.reaches(pose, plan) : d < ARRIVE);
      if (!atGoal) {
        if (d < this.best - 0.01) {
          this.best = d;
          this.stuck = 0;
        } else if (++this.stuck > STUCK_TICKS) {
          this.cancel();
          return idle;
        }
        const k = Math.min(1, Math.max(0.35, d * 4)) / Math.max(d, 1e-6);
        return { ...idle, mx: (target.x + 0.5 - pose.x) * k, my: (target.y + 0.5 - pose.y) * k };
      }
      this.arrived = true;
      this.onArrive?.(plan);
    }
    const face = plan.face ?? { x: 0, y: 0 };
    const nudge = { ...idle, mx: face.x * NUDGE, my: face.y * NUDGE };
    switch (plan.action) {
      case 'walk':
        this.cancel();
        return idle;
      case 'grab':
        this.cancel();
        return { ...nudge, grab: true };
      case 'hold':
        if (!this.holding) {
          this.cancel();
          return idle;
        }
        return { ...nudge, use: true };
      case 'pending':
        return nudge;
    }
  }

  private nextWaypoint() {
    this.i++;
    this.best = Infinity;
    this.stuck = 0;
  }

  private dist(pose: { x: number; y: number }, t: Vec) {
    return Math.hypot(t.x + 0.5 - pose.x, t.y + 0.5 - pose.y);
  }

  private reaches(pose: { x: number; y: number }, plan: TapPlan) {
    if (!plan.face || !plan.station) return true;
    return Math.floor(pose.x + plan.face.x * kitchen.REACH) === plan.station.x && Math.floor(pose.y + plan.face.y * kitchen.REACH) === plan.station.y;
  }
}
