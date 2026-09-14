import { Placement, tilesOf, validatePlacement } from './furniture';
import { RoomTheme } from './constants';
import type { TableGameKind } from './tableGames';

/**
 * Game Den: a neon board-game lounge. Eight game tables (Connect Four,
 * Tic-Tac-Toe, Reversi, Dots & Boxes), each with a gaming chair either side:
 * sit down opposite someone and a match starts. Arcade cabinets, a pool table,
 * a trophy case, a scoreboard and a bean-bag corner round it out.
 */
export const GAME_DEN = {
  slug: 'gameden',
  name: 'Game Den',
  category: 'hangout',
  theme: 'gameroom' as RoomTheme,
  size: 20,
  featured: true,
} as const;

const S = GAME_DEN.size;

/** which game each table furniture plays */
export const GAME_TABLE_KIND: Record<string, TableGameKind> = {
  gt_c4: 'c4',
  gt_ttt: 'ttt',
  gt_reversi: 'reversi',
  gt_dots: 'dots',
};

/** Gaming chairs belonging to a table: any that touch its footprint (including diagonals). */
export function tableChairs(table: Placement, placements: Iterable<Placement>): Placement[] {
  const tiles = tilesOf(table) ?? [];
  const out: Placement[] = [];
  for (const p of placements) {
    if (p.def !== 'game_chair') continue;
    const near = (tilesOf(p) ?? []).some(([x, y]) => tiles.some(([tx, ty]) => Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1));
    if (near) out.push(p);
  }
  return out;
}

export function gameDenLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const next = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement => ({ id: `gd${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot });
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`game den layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };
  const tryPut = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    if (!validatePlacement(p, S, out, null)) out.push(p);
  };

  // ---- back wall: GAME ON neon, the scoreboard and a dartboard (row 0, x 0-4 is the door)
  put('neon_game', 5, 0);
  put('scoreboard', 9, 0);
  put('dartboard', 13, 0);
  put('dartboard', 0, 6, 1);
  put('scoreboard', 0, 9, 1);

  // ---- arcade row and trophy cases under the back wall
  for (const x of [15, 16, 17, 18]) put('arcade', x, 1);
  put('trophy_case', 8, 1);
  put('trophy_case', 12, 1);

  // ---- eight game tables, a gaming chair either side facing the board
  const tables: Array<[string, number, number]> = [
    ['gt_c4', 5, 6],
    ['gt_ttt', 10, 6],
    ['gt_reversi', 15, 6],
    ['gt_dots', 5, 10],
    ['gt_c4', 10, 10],
    ['gt_ttt', 15, 10],
    ['gt_reversi', 5, 14],
    ['gt_dots', 10, 14],
  ];
  for (const [def, x, y] of tables) {
    put(def, x, y);
    put('game_chair', x - 1, y, 3); // faces +x, toward the table
    put('game_chair', x + 1, y, 1); // faces -x
  }

  // ---- pool table and side décor
  put('pool_table', 14, 14);
  put('chess_king', 18, 4);
  put('giant_dice', 18, 9);
  put('giant_dice', 1, 4);
  put('game_shelf', 1, 12, 1);
  put('game_shelf', 1, 15, 1);

  // ---- bean-bag corner on a dice rug
  put('dice_rug', 3, 17);
  put('bean_bag', 3, 17, 0);
  put('bean_bag', 4, 18, 3);
  put('bean_bag', 7, 18, 1);

  // ---- neon aisles between the table rows
  for (const y of [8, 12]) for (let x = 3; x <= 17; x++) tryPut('glowtile', x, y);
  for (let y = 3; y <= 16; y++) tryPut('glowtile', 8, y);

  // ---- lights, vending and a few plants
  for (const [x, y] of [
    [3, 3],
    [13, 3],
    [8, 12],
    [13, 12],
    [18, 17],
    [12, 18],
  ] as const)
    tryPut('pixel_lamp', x, y);
  tryPut('vending', 18, 12);
  tryPut('plant', 19, 1);
  tryPut('plant', 1, 19);
  tryPut('plant', 19, 19);

  // every table must have both chairs
  for (const t of out.filter((p) => GAME_TABLE_KIND[p.def])) {
    if (tableChairs(t, out).length < 2) throw new Error(`game den layout: ${t.def}@${t.x},${t.y} is missing chairs`);
  }
  return out;
}
