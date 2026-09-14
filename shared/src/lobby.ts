import { Placement, tilesOf, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * The Main Lobby: a big public park everyone lands in. Owned by the system
 * user, never editable by players. The layout is generated here so the
 * server can (re)seed it at boot and tests can validate it.
 *
 * Zones (40x40): central fountain plaza with avenues; NW hedge maze with a
 * star pad prize at its heart; NE picnic lawn; SW dance floor + duel arena;
 * SE café terrace; pond garden along the west avenue.
 */
export const MAIN_LOBBY = {
  slug: 'mainlobby',
  name: 'Main Lobby',
  category: 'hangout',
  theme: 'park' as RoomTheme,
  size: 40,
} as const;

export const SYSTEM_HANDLE = 'dovey';

/** the maze prize pad: standing here pays coins (server-verified, cooldown per user) */
export const LOBBY_MAZE_PRIZE = { x: 8, y: 8 };
export const MAZE_REWARD = 60;
export const MAZE_COOLDOWN_MS = 10 * 60 * 1000;

class Builder {
  readonly out: Placement[] = [];
  private n = 0;
  constructor(private size: number) {}

  private next(def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement {
    return { id: `lb${(this.n++).toString(36).padStart(3, '0')}`, def, x, y, rot };
  }

  put(def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) {
    const p = this.next(def, x, y, rot);
    const err = validatePlacement(p, this.size, this.out);
    if (err) throw new Error(`lobby layout: ${def}@${x},${y} ${err} vs ${JSON.stringify(this.out.filter((o) => (tilesOf(o) ?? []).some(([tx, ty]) => tx >= x && tx < x + 2 && ty >= y && ty < y + 2)))}`);
    this.out.push(p);
  }

  /** place only if the tiles are free (filler like paving) */
  tryPut(def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): boolean {
    const p = this.next(def, x, y, rot);
    if (validatePlacement(p, this.size, this.out)) return false;
    this.out.push(p);
    return true;
  }

  rect(def: string, x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.tryPut(def, x, y);
  }
}

/** tiny seeded PRNG so the maze is the same on every boot */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Hedge maze on an odd-sized cell grid via recursive backtracking.
 * Returns wall tiles (relative to the maze origin). Cells sit on odd coords;
 * the prize is at the centre cell, the entrance is cut on the south edge.
 */
export function mazeWalls(cells: number, seed = 7): { walls: Array<[number, number]>; entrance: [number, number]; centre: [number, number] } {
  const N = cells * 2 + 1;
  const wall: boolean[][] = [];
  for (let y = 0; y < N; y++) wall.push(new Array<boolean>(N).fill(true));
  const rand = rng(seed);
  const stack: Array<[number, number]> = [[1, 1]];
  wall[1][1] = false;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options: Array<[number, number]> = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && wall[ny][nx]) options.push([nx, ny]);
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = options[Math.floor(rand() * options.length)];
    wall[cy + (ny - cy) / 2][cx + (nx - cx) / 2] = false;
    wall[ny][nx] = false;
    stack.push([nx, ny]);
  }
  const centre: [number, number] = [cells % 2 ? cells : cells + 1, cells % 2 ? cells : cells + 1];
  // open a little room around the prize
  for (let y = centre[1] - 1; y <= centre[1] + 1; y++) for (let x = centre[0] - 1; x <= centre[0] + 1; x++) wall[y][x] = false;
  // entrance: bottom edge below the first open cell in the last row
  let ex = 1;
  for (let x = 1; x < N - 1; x++) if (!wall[N - 2][x]) { ex = x; break; }
  wall[N - 1][ex] = false;
  const walls: Array<[number, number]> = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (wall[y][x]) walls.push([x, y]);
  return { walls, entrance: [ex, N - 1], centre };
}

export function mainLobbyLayout(): Placement[] {
  const S = MAIN_LOBBY.size; // 40
  const b = new Builder(S);
  const C = 18; // fountain top-left; fountain covers 18..20, plaza centre ~19.5

  // ---- central plaza: fountain, benches, lamps, flowers, paving
  b.put('fountain', C, C);
  b.put('bench', C - 1, C - 2, 0);
  b.put('bench', C + 1, C - 2, 0);
  b.put('bench', C - 1, C + 4, 2);
  b.put('bench', C + 1, C + 4, 2);
  b.put('bench', C - 2, C, 1);
  b.put('bench', C - 2, C + 2, 1);
  b.put('bench', C + 4, C, 3);
  b.put('bench', C + 4, C + 2, 3);
  for (const [x, y] of [[C - 4, C - 4], [C + 6, C - 4], [C - 4, C + 6], [C + 6, C + 6]] as const) b.put('lamppost', x, y);
  for (const [x, y] of [[C - 4, C - 3], [C - 3, C - 4], [C + 6, C - 3], [C + 5, C - 4], [C - 4, C + 5], [C - 3, C + 6], [C + 6, C + 5], [C + 5, C + 6]] as const) b.put('flowers', x, y);
  b.rect('path', C - 4, C - 4, C + 6, C + 6);

  // ---- avenues (2 wide) from the plaza to each edge
  b.rect('path', C, 0, C + 1, C - 5);
  b.rect('path', C, C + 7, C + 1, S - 1);
  b.rect('path', 0, C, C - 5, C + 1);
  b.rect('path', C + 7, C, S - 1, C + 1);

  // ---- NW: hedge maze (15x15 tiles at origin 1,1), prize pad in the middle, arch at the entrance
  const M = mazeWalls(7, 7); // 15x15
  const MX = 1;
  const MY = 1;
  for (const [x, y] of M.walls) b.put('hedge', MX + x, MY + y);
  b.put('pad_star', MX + M.centre[0], MY + M.centre[1]);
  b.put('torch', MX + M.centre[0] - 1, MY + M.centre[1] - 1);
  b.put('torch', MX + M.centre[0] + 1, MY + M.centre[1] - 1);
  const ent: [number, number] = [MX + M.entrance[0], MY + M.entrance[1]];
  b.put('arch', ent[0] - 1, ent[1] + 1, 0); // arch straddles the tile below the gap
  b.put('sign', ent[0] + 2, ent[1] + 1);
  b.rect('path', ent[0], ent[1] + 1, ent[0], C - 1); // trail from the arch to the west avenue

  // ---- NE: picnic lawn with pines and blossoms
  const NE = 24;
  for (const [x, y] of [[NE + 1, 2], [NE + 6, 2], [NE + 11, 2], [NE + 1, 7], [NE + 6, 7], [NE + 11, 7], [NE + 3, 12], [NE + 9, 12]] as const) b.put('picnic', x, y);
  for (const [x, y] of [[NE + 4, 5], [NE + 9, 5], [NE + 14, 5], [NE, 10], [NE + 14, 10]] as const) b.put('tree_pink', x, y);
  for (const [x, y] of [[NE + 5, 10], [NE + 8, 10], [NE + 13, 13]] as const) b.put('tree_pine', x, y);
  b.rect('flowers', NE + 1, 4, NE + 3, 4);
  b.rect('flowers', NE + 6, 4, NE + 8, 4);
  b.rect('flowers', NE + 11, 4, NE + 13, 4);
  b.put('lamppost', NE + 6, 9);
  b.put('lamppost', NE + 12, 9);
  b.put('stall', NE + 1, 11);
  b.put('vending', NE + 13, 15);

  // ---- SW: dance floor (glow tiles + disco + jukebox) and the duel arena
  const SY = 25;
  b.rect('glowtile', 3, SY, 9, SY + 6);
  b.put('disco', 6, SY + 3);
  b.put('jukebox', 2, SY + 1);
  b.put('neon', 4, SY - 1, 0);
  b.put('torch', 2, SY + 7);
  b.put('torch', 10, SY + 7);
  b.put('torch', 2, SY - 1);
  b.put('torch', 10, SY - 1);
  // arena: paved ring, duel pad in the middle, benches for spectators
  b.put('pad_duel', 7, SY + 11);
  b.rect('path', 3, SY + 9, 12, SY + 14);
  b.put('bench', 4, SY + 9, 0);
  b.put('bench', 9, SY + 9, 0);
  b.put('bench', 4, SY + 14, 2);
  b.put('bench', 9, SY + 14, 2);
  b.put('lamppost', 3, SY + 11);
  b.put('lamppost', 12, SY + 11);
  b.put('sign', 13, SY + 8);

  // ---- SE: café terrace with palms and a hot tub corner
  const SE = 26;
  for (const [x, y] of [[SE + 1, SY + 1], [SE + 6, SY + 1], [SE + 1, SY + 6], [SE + 6, SY + 6]] as const) {
    b.put('table', x, y);
    b.put('chair', x, y - 1, 0);
    b.put('chair', x + 1, y - 1, 0);
    b.put('chair', x, y + 1, 2);
    b.put('chair', x + 1, y + 1, 2);
  }
  for (const [x, y] of [[SE + 11, SY + 2], [SE + 11, SY + 6]] as const) {
    b.put('table_round', x, y);
    b.put('stool', x - 1, y);
    b.put('stool', x + 1, y);
  }
  b.put('sofa', SE + 1, SY + 10, 0);
  b.put('sofa_pink', SE + 5, SY + 10, 0);
  b.put('armchair', SE + 9, SY + 10);
  b.put('tv', SE + 3, SY + 12, 2);
  b.put('hottub', SE + 10, SY + 12);
  b.put('aquarium', SE + 6, SY + 13, 0);
  b.put('lamp', SE, SY + 12);
  b.put('lamppost', SE + 4, SY + 4);
  b.put('plant', SE + 8, SY + 8);
  b.put('plant', SE, SY + 8);
  b.rect('deck', SE, SY, SE + 12, SY + 14);
  for (const [x, y] of [[SE + 13, SY - 1], [SE + 13, SY + 6], [SE + 13, SY + 13]] as const) b.put('tree_palm', x, y);

  // ---- W: pond garden beside the west avenue
  b.put('pond', 3, C + 3);
  b.put('bench', 6, C + 3, 1);
  b.put('bush', 8, C + 2);
  b.put('bush', 1, C + 5);
  b.put('tree', 9, C + 5);
  b.put('tree', 12, C + 3);
  b.put('flowers', 3, C + 5);
  b.put('flowers', 4, C + 5);

  // ---- E: quiet grove between the lawn and the terrace
  for (const [x, y] of [[NE + 2, C + 2], [NE + 11, C + 2], [NE + 14, C + 4], [NE + 3, C + 5]] as const) b.put('tree', x, y);
  b.put('bench', NE + 4, C + 2, 0);
  b.put('bench', NE + 9, C + 2, 0);
  b.put('campfire', NE + 7, C + 4);
  for (const [x, y] of [[NE + 6, C + 3], [NE + 8, C + 3], [NE + 6, C + 5], [NE + 8, C + 5]] as const) b.put('stool', x, y);

  // ---- perimeter: hedge with trees every third tile, gaps where the avenues leave
  const isAvenue = (x: number, y: number) => (x >= C && x <= C + 1) || (y >= C && y <= C + 1);
  for (let i = 0; i < S; i++) {
    for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]] as const) {
      if (isAvenue(x, y)) continue;
      b.tryPut(i % 3 === 0 ? (i % 6 === 0 ? 'tree' : 'tree_pine') : 'bush', x, y);
    }
  }
  b.put('sign', C - 1, 1);
  b.put('sign', C + 2, 1);

  return b.out;
}
