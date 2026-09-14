import { Grid, inBounds, isWalkable } from './grid';

export interface Tile {
  x: number;
  y: number;
}

const DIRS: ReadonlyArray<Tile> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * 4-neighbour A* with Manhattan heuristic.
 * Returns path excluding start, including goal. Empty array if start===goal.
 * Returns null if unreachable or goal not walkable.
 */
export function findPath(grid: Grid, start: Tile, goal: Tile): Tile[] | null {
  // start may be blocked (e.g. furniture placed under a player); goal must be walkable
  if (!isWalkable(grid, goal.x, goal.y) || !inBounds(grid, start.x, start.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const key = (x: number, y: number) => y * grid.width + x;
  const n = grid.width * grid.height;
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const sk = key(start.x, start.y);
  gScore[sk] = 0;
  fScore[sk] = h(start.x, start.y);

  // simple open list; grid is small (max 400 cells), linear scan is fine
  const open: number[] = [sk];

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
    const cur = open[bi];
    open.splice(bi, 1);

    const cx = cur % grid.width;
    const cy = Math.floor(cur / grid.width);
    if (cx === goal.x && cy === goal.y) {
      const path: Tile[] = [];
      let k = cur;
      while (k !== sk) {
        path.push({ x: k % grid.width, y: Math.floor(k / grid.width) });
        k = cameFrom[k];
      }
      return path.reverse();
    }
    closed[cur] = 1;

    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!isWalkable(grid, nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;
      const tentative = gScore[cur] + 1;
      if (tentative < gScore[nk]) {
        cameFrom[nk] = cur;
        gScore[nk] = tentative;
        fScore[nk] = tentative + h(nx, ny);
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return null;
}
