import { Placement, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * Kitchen: the lobby for co-op cooking. Four crew rugs; stand on one with friends
 * and press Start to cook a round together.
 */
export const KITCHEN_WORLD = {
  slug: 'kitchen',
  name: 'Kitchen',
  category: 'games',
  theme: 'indoor' as RoomTheme,
  size: 14,
  featured: true,
} as const;

const S = KITCHEN_WORLD.size;

/** top-left tile of each 2x2 crew rug */
export const KITCHEN_PADS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 2, y: 3 },
  { x: 10, y: 3 },
  { x: 2, y: 9 },
  { x: 10, y: 9 },
];

export function padAt(x: number, y: number): number {
  return KITCHEN_PADS.findIndex((p) => x >= p.x && x < p.x + 2 && y >= p.y && y < p.y + 2);
}

export function padTiles(pad: number): Array<[number, number]> {
  const p = KITCHEN_PADS[pad];
  if (!p) return [];
  return [
    [p.x, p.y],
    [p.x + 1, p.y],
    [p.x, p.y + 1],
    [p.x + 1, p.y + 1],
  ];
}

export function kitchenWorldLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p: Placement = { id: `kw${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot };
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`kitchen world layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };

  // crew rugs, each with a sign
  for (const p of KITCHEN_PADS) put('woven_rug', p.x, p.y);
  put('sign', 4, 3);
  put('sign', 12, 3);
  put('sign', 4, 9);
  put('sign', 12, 9);

  // market stalls on the back wall, crates in the corners
  put('stall', 5, 0);
  put('stall', 8, 0);
  for (const [x, y] of [
    [0, 0],
    [13, 0],
    [0, 13],
    [13, 13],
  ] as const)
    put('crate_stack', x, y);
  for (const [x, y] of [
    [3, 0],
    [11, 0],
    [3, 13],
    [11, 13],
  ] as const)
    put('plant', x, y);
  put('shelf', 5, 13);
  put('shelf', 8, 13);
  put('lamp', 0, 6);
  put('lamp', 13, 6);

  // café corner
  put('table_round', 7, 11);
  put('stool', 6, 11);
  put('stool', 8, 11);

  // stone paths: across the middle and up to the stalls
  for (let x = 1; x <= 12; x++) put('path', x, 7);
  for (let y = 2; y <= 6; y++) put('path', 7, y);

  return out;
}
