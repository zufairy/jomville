import { Grid, Tile, TILES_PER_TICK, findPath } from '@dovey/shared';

export interface Mover {
  x: number;
  y: number;
  dir: number;
  moving: boolean;
}

export function dirBetween(from: Tile, to: Tile): number {
  if (to.y < from.y) return 0;
  if (to.x > from.x) return 1;
  if (to.y > from.y) return 2;
  return 3;
}

/** Pure movement sim. Holds per-mover path; advances along it at fixed speed. */
export class MovementSim {
  private paths = new Map<string, Tile[]>();

  constructor(private grid: Grid) {}

  setGrid(grid: Grid) {
    this.grid = grid;
    // paths through newly blocked tiles are dropped; players re-path on next tap
    for (const [id, path] of this.paths) {
      if (path.some((t) => !this.grid.walkable[t.y]?.[t.x])) this.paths.delete(id);
    }
  }

  /** Returns false if target invalid/unreachable. Path starts from the mover's nearest tile. */
  requestMove(id: string, m: Mover, target: Tile): boolean {
    const start = { x: Math.round(m.x), y: Math.round(m.y) };
    const path = findPath(this.grid, start, target);
    if (path === null) return false;
    if (path.length === 0) {
      this.paths.delete(id);
      return true;
    }
    this.paths.set(id, path);
    return true;
  }

  remove(id: string) {
    this.paths.delete(id);
  }

  /** Advance one tick (TILES_PER_TICK). Mutates mover. */
  step(id: string, m: Mover, budget = TILES_PER_TICK) {
    const path = this.paths.get(id);
    if (!path || path.length === 0) {
      m.moving = false;
      return;
    }
    let remaining = budget;
    while (remaining > 1e-9 && path.length) {
      const next = path[0];
      const dx = next.x - m.x;
      const dy = next.y - m.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      m.dir = dirBetween({ x: m.x, y: m.y }, next);
      if (dist <= remaining) {
        m.x = next.x;
        m.y = next.y;
        remaining -= dist;
        path.shift();
      } else {
        m.x += Math.sign(dx) * remaining;
        m.y += Math.sign(dy) * remaining;
        remaining = 0;
      }
    }
    m.moving = path.length > 0;
    if (!m.moving) this.paths.delete(id);
  }
}
