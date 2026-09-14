import { Placement, RoomMask, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * Harbor Walk: the second public room. A big irregular seafront — the floor
 * mask carves a curved coastline, two piers and a floating stage out of the
 * 36x36 square; everything else is water.
 */
export const HARBOR = {
  slug: 'harborwalk',
  name: 'Harbor Walk',
  category: 'chill',
  theme: 'harbor' as RoomTheme,
  size: 36,
} as const;

const S = HARBOR.size;

/** y of the last land row for a given x (coastline) */
function coastAt(x: number): number {
  return 21 + Math.round(3 * Math.sin(x / 5.5));
}

const PIER_A = { x0: 7, x1: 8, y1: 31 };
const PIER_B = { x0: 24, x1: 25, y1: 28 };
const STAGE = { x0: 20, x1: 31, y0: 29, y1: 34 };

export function harborMask(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < S; y++) {
    let row = '';
    for (let x = 0; x < S; x++) {
      const land = y <= coastAt(x);
      const pierA = x >= PIER_A.x0 && x <= PIER_A.x1 && y <= PIER_A.y1;
      const pierB = x >= PIER_B.x0 && x <= PIER_B.x1 && y <= PIER_B.y1;
      const stage = x >= STAGE.x0 && x <= STAGE.x1 && y >= STAGE.y0 && y <= STAGE.y1;
      const stageLink = x >= PIER_B.x0 && x <= PIER_B.x1 && y > PIER_B.y1 && y < STAGE.y0;
      // notch the top-left corner so the outline isn't a plain square
      const notch = x + y < 5;
      row += (land && !notch) || pierA || pierB || stage || stageLink ? '1' : '0';
    }
    rows.push(row);
  }
  return rows;
}

class Builder {
  readonly out: Placement[] = [];
  private n = 0;
  constructor(private mask: RoomMask) {}

  private next(def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement {
    return { id: `hb${(this.n++).toString(36).padStart(3, '0')}`, def, x, y, rot };
  }

  put(def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) {
    const p = this.next(def, x, y, rot);
    const err = validatePlacement(p, S, this.out, this.mask);
    if (err) throw new Error(`harbor layout: ${def}@${x},${y} ${err}`);
    this.out.push(p);
  }

  tryPut(def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): boolean {
    const p = this.next(def, x, y, rot);
    if (validatePlacement(p, S, this.out, this.mask)) return false;
    this.out.push(p);
    return true;
  }

  rect(def: string, x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.tryPut(def, x, y);
  }
}

export function harborLayout(): Placement[] {
  const mask = harborMask();
  const b = new Builder(mask);

  // ---- piers and stage are wooden decking
  b.rect('deck', PIER_A.x0, 18, PIER_A.x1, PIER_A.y1);
  b.rect('deck', PIER_B.x0, 18, PIER_B.x1, STAGE.y1);
  b.rect('deck', STAGE.x0, STAGE.y0, STAGE.x1, STAGE.y1);
  // promenade: the two land rows above the coast get decking too
  for (let x = 0; x < S; x++) {
    const c = coastAt(x);
    b.tryPut('deck', x, c);
    b.tryPut('deck', x, c - 1);
  }

  // ---- pier A: fishing pier — benches, lamps, a hot tub at the end
  b.put('hottub', PIER_A.x0, PIER_A.y1 - 1);
  b.put('lamppost', PIER_A.x0, 24);
  b.put('bench', PIER_A.x1, 26, 1);
  b.put('bench', PIER_A.x0, 21, 1);
  b.put('crate_stack', PIER_A.x1, 29);

  // ---- pier B + floating stage: party deck — jukebox, disco ball, sofas, neon
  b.put('lamppost', PIER_B.x1, 26);
  b.put('jukebox', STAGE.x0 + 1, STAGE.y0 + 1);
  b.put('disco', STAGE.x0 + 6, STAGE.y0 + 2);
  b.put('neon', STAGE.x0 + 7, STAGE.y0);
  b.put('sofa', STAGE.x0 + 2, STAGE.y1 - 1, 0);
  b.put('sofa_pink', STAGE.x0 + 8, STAGE.y1 - 1, 0);
  b.put('sofa', STAGE.x1 - 1, STAGE.y0 + 2, 1);
  b.put('armchair', STAGE.x0 + 1, STAGE.y0 + 4);
  b.put('table_round', STAGE.x0 + 5, STAGE.y1 - 2);
  b.put('stool', STAGE.x0 + 4, STAGE.y1 - 2);
  b.put('stool', STAGE.x0 + 6, STAGE.y1 - 2);
  b.put('lamppost', STAGE.x1, STAGE.y1);
  b.put('lamppost', STAGE.x0, STAGE.y1);
  b.put('campfire', STAGE.x0 + 9, STAGE.y0 + 1);

  // ---- market square (top-left): stalls, crates, vending
  b.put('stall', 3, 4);
  b.put('stall', 3, 9);
  b.put('stall', 8, 3, 1);
  b.put('crate_stack', 6, 6);
  b.put('crate', 7, 6);
  b.put('crate', 6, 7);
  b.put('vending', 12, 2);
  b.put('vending', 13, 2);
  b.put('arcade', 15, 2);
  b.put('arcade', 16, 2);
  b.put('sign', 2, 12);
  b.rect('path', 2, 3, 13, 12);
  b.rect('path', 14, 4, 17, 4);

  // ---- fountain plaza (top-centre)
  b.put('fountain', 20, 4);
  b.put('bench', 19, 8, 0);
  b.put('bench', 22, 8, 0);
  b.put('bench', 19, 2, 0);
  b.put('bench', 22, 2, 0);
  b.put('bench', 18, 4, 1);
  b.put('bench', 24, 4, 1);
  for (const [x, y] of [
    [17, 1],
    [25, 1],
    [17, 9],
    [25, 9],
  ] as const) {
    b.put('lamppost', x, y);
  }
  b.rect('flowers', 18, 1, 18, 1);
  b.rect('flowers', 24, 1, 24, 1);
  b.rect('flowers', 18, 9, 18, 9);
  b.rect('flowers', 24, 9, 24, 9);
  b.rect('path', 17, 1, 25, 9);
  b.rect('path', 20, 10, 22, 17); // walkway from the plaza down to the promenade

  // ---- seaside café (top-right): tables, aquarium, tv lounge
  b.put('aquarium', 30, 2);
  b.put('tv', 30, 6);
  b.put('sofa', 30, 8, 0);
  b.put('sofa', 32, 8, 0);
  b.put('armchair', 29, 8);
  b.put('armchair', 34, 8);
  for (const [x, y] of [
    [28, 12],
    [32, 12],
    [28, 15],
    [32, 15],
  ] as const) {
    b.put('table_round', x, y);
    b.put('stool', x - 1, y);
    b.put('stool', x + 1, y);
    b.put('stool', x, y + 1);
  }
  b.put('plant', 28, 2);
  b.put('plant', 34, 2);
  b.put('lamp', 29, 6);
  b.put('lamp', 34, 6);
  b.put('neon', 31, 4);
  b.rect('rug_navy', 30, 8, 33, 9);
  b.rect('path', 27, 1, 35, 17);

  // ---- beach lounge (bottom-left of the land): umbrellas + stools on the sand, campfire circle
  for (const [x, y] of [
    [2, 15],
    [5, 17],
    [11, 15],
    [14, 17],
  ] as const) {
    b.put('umbrella', x, y);
    b.put('stool', x + 1, y);
    b.put('stool', x + 1, y + 1);
  }
  b.put('campfire', 8, 14);
  for (const [x, y] of [
    [7, 13],
    [9, 13],
    [7, 15],
    [9, 15],
  ] as const) {
    b.put('stool', x, y);
  }

  // ---- promenade furniture along the coast
  const pierCol = (x: number) => (x >= PIER_A.x0 && x <= PIER_A.x1) || (x >= PIER_B.x0 && x <= PIER_B.x1);
  for (let x = 1; x < S; x += 5) {
    const c = coastAt(x);
    if (!pierCol(x)) b.tryPut('lamppost', x, c);
    if (x + 3 < S && !pierCol(x + 2) && !pierCol(x + 3)) b.tryPut('bench', x + 2, coastAt(x + 2) - 1, 0);
  }

  // ---- trees along the top edge, bushes as hedges
  for (let x = 0; x < S; x++) {
    if (x >= 17 && x <= 25) continue; // plaza opening
    b.tryPut(x % 3 === 0 ? 'tree' : x % 3 === 1 ? 'bush' : 'tree_pink', x, 0);
  }
  for (let y = 0; y < 13; y++) b.tryPut(y % 2 ? 'bush' : 'tree', 0, y);
  for (let y = 0; y < 18; y++) b.tryPut(y % 2 ? 'bush' : 'tree', S - 1, y);

  return b.out;
}
