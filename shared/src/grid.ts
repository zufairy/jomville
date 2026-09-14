export interface Grid {
  width: number;
  height: number;
  /** walkable[y][x] */
  walkable: boolean[][];
}

export function makeGrid(width: number, height: number, blocked: Array<[number, number]> = []): Grid {
  const walkable: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    walkable.push(new Array<boolean>(width).fill(true));
  }
  for (const [bx, by] of blocked) {
    if (inBounds({ width, height, walkable }, bx, by)) walkable[by][bx] = false;
  }
  return { width, height, walkable };
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function isWalkable(g: Grid, x: number, y: number): boolean {
  return inBounds(g, x, y) && g.walkable[y][x];
}
