import { TILE_H, TILE_W, kitchen } from '@dovey/shared';

export interface Vec {
  x: number;
  y: number;
}

/** stick size used to turn a chef toward a station without really walking (just over the deadzone) */
export const NUDGE = 0.25;

export const AXES: readonly Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * A direction on screen (+y down, any length; lengths over 1 clamp) as a world
 * move vector with the same magnitude: screen up walks up the screen in iso.
 */
export function screenToWorldDir(sx: number, sy: number): Vec {
  const mag = Math.min(1, Math.hypot(sx, sy));
  if (mag < 1e-6) return { x: 0, y: 0 };
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  const wx = (a + b) / 2;
  const wy = (b - a) / 2;
  const l = Math.hypot(wx, wy);
  return { x: (wx / l) * mag, y: (wy / l) * mag };
}

/** unit screen direction for a world vector */
export function worldToScreenDir(wx: number, wy: number): Vec {
  const x = (wx - wy) * (TILE_W / 2);
  const y = (wx + wy) * (TILE_H / 2);
  const l = Math.hypot(x, y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
}

/** avatar sheet direction for a world facing: 0 up, 1 right, 2 down, 3 left (on screen) */
export function avatarDir(fx: number, fy: number): 0 | 1 | 2 | 3 {
  const s = worldToScreenDir(fx, fy);
  if (Math.abs(s.x) >= Math.abs(s.y)) return s.x >= 0 ? 1 : 3;
  return s.y >= 0 ? 2 : 0;
}

type StationLike = Pick<kitchen.Station, 'x' | 'y'>;

export function stationOn<T extends StationLike>(stations: readonly T[], tx: number, ty: number): T | undefined {
  return stations.find((s) => s.x === tx && s.y === ty);
}

/** the tile a chef's grab / chop reaches */
export function reachTile(pose: { x: number; y: number; fx: number; fy: number }): Vec {
  return { x: Math.floor(pose.x + pose.fx * kitchen.REACH), y: Math.floor(pose.y + pose.fy * kitchen.REACH) };
}

/**
 * Screen-relative keys give diagonal world facings that often reach no station.
 * When that happens, pick the station next to the chef (reachable along an axis)
 * that best matches where it faces. null when the facing already reaches one,
 * or nothing sensible is in reach.
 */
export function aimAssist(pose: { x: number; y: number; fx: number; fy: number }, stations: readonly StationLike[]): Vec | null {
  const r = reachTile(pose);
  if (stationOn(stations, r.x, r.y)) return null;
  let best: Vec | null = null;
  let bestScore = -0.3;
  for (const a of AXES) {
    const tx = Math.floor(pose.x + a.x * kitchen.REACH);
    const ty = Math.floor(pose.y + a.y * kitchen.REACH);
    if (tx === Math.floor(pose.x) && ty === Math.floor(pose.y)) continue;
    if (!stationOn(stations, tx, ty)) continue;
    const score = a.x * pose.fx + a.y * pose.fy;
    if (score > bestScore + 1e-6) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

type StationState = Pick<kitchen.Station, 'kind' | 'item' | 'count' | 'ing'>;

const HOLDS: Partial<Record<kitchen.StationKind, (i: kitchen.Item) => boolean>> = {
  counter: () => true,
  board: (i) => i.kind === 'ing',
  stove: (i) => i.kind === 'pot',
};

/** Client-side guess of whether a grab at this station does anything (mirrors shared stations.ts). */
export function predictGrab(st: StationState, held: kitchen.Item | null): boolean {
  switch (st.kind) {
    case 'crate':
      return !held && !!st.ing;
    case 'plates':
    case 'return':
      return !held && st.count > 0;
    case 'bin':
      return !!held;
    case 'window':
      return held?.kind === 'plate' && kitchen.plateDish(held) !== null;
  }
  const holds = HOLDS[st.kind];
  if (!holds) return false;
  if (!held) return !!st.item;
  if (!st.item) return holds(held);
  const r = kitchen.combine(held, st.item);
  return !!r && (!r.target || holds(r.target));
}

/** whether holding chop here would chop something */
export function predictChop(st: StationState, held: kitchen.Item | null): boolean {
  return st.kind === 'board' && !held && st.item?.kind === 'ing' && !st.item.chopped;
}
