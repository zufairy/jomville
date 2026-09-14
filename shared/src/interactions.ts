import { Placement, distanceTo, tilesOf } from './furniture';

export type InteractionKind = 'dice6' | 'dice100' | 'wheel';

/** furniture state while the server is rolling */
export const ROLLING = '-1';
/** blank face: fresh, closed or picked up */
export const CLOSED = '0';

export interface Interaction {
  /** adjacent = touching a footprint tile incl. diagonals; near = within 2 tiles (Manhattan) */
  reach: 'adjacent' | 'near';
  rollMs: number;
  /** rand(n) returns an integer in [0, n) */
  roll(rand: (n: number) => number): string;
}

export const INTERACTIONS: Record<InteractionKind, Interaction> = {
  dice6: { reach: 'adjacent', rollMs: 1500, roll: (rand) => String(rand(6) + 1) },
  dice100: { reach: 'adjacent', rollMs: 2000, roll: (rand) => String(rand(100) + 1) },
  wheel: { reach: 'near', rollMs: 3000, roll: (rand) => String(rand(8) + 1) },
};

export function inReach(kind: InteractionKind, x: number, y: number, p: Placement): boolean {
  if (INTERACTIONS[kind].reach === 'near') return distanceTo(x, y, p) <= 2;
  const tiles = tilesOf(p) ?? [];
  if (tiles.some(([tx, ty]) => tx === x && ty === y)) return false;
  return tiles.some(([tx, ty]) => Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1);
}
