import { Grid, Tile, WALK_SPEED, findPath } from '@dovey/shared';

/** Client-side prediction for own avatar. Same rules as server sim, but per-frame. */
export class LocalMover {
  x: number;
  y: number;
  dir = 2;
  private path: Tile[] = [];

  constructor(private grid: Grid, x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  setGrid(grid: Grid) {
    this.grid = grid;
    if (this.path.some((t) => !this.grid.walkable[t.y]?.[t.x])) this.path = [];
  }

  get moving() {
    return this.path.length > 0;
  }

  setTarget(t: Tile): boolean {
    const start = { x: Math.round(this.x), y: Math.round(this.y) };
    const p = findPath(this.grid, start, t);
    if (p === null) return false;
    this.path = p;
    return true;
  }

  /**
   * Server authoritative position arrived. While either side is still walking the
   * server lags the prediction by up to ~1 tile, so only hard-snap on large drift.
   * Once both are idle, any mismatch is corrected.
   */
  reconcile(sx: number, sy: number, serverMoving: boolean) {
    const d = Math.abs(sx - this.x) + Math.abs(sy - this.y);
    const bothIdle = !this.moving && !serverMoving;
    if ((bothIdle && d > 0.01) || d > 2.5) {
      this.x = sx;
      this.y = sy;
      this.path = [];
    }
  }

  update(dtMs: number) {
    let budget = (WALK_SPEED * dtMs) / 1000;
    while (budget > 1e-9 && this.path.length) {
      const n = this.path[0];
      const dx = n.x - this.x;
      const dy = n.y - this.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      this.dir = dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3;
      if (dist <= budget) {
        this.x = n.x;
        this.y = n.y;
        budget -= dist;
        this.path.shift();
      } else {
        this.x += Math.sign(dx) * budget;
        this.y += Math.sign(dy) * budget;
        budget = 0;
      }
    }
  }
}
