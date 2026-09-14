import { Placement, validatePlacement } from './furniture';
import { LOVE_LANES, LOVE_METER_TILE, LOVE_ROOM, LOVE_SEATS } from './loveMeter';

const S = LOVE_ROOM.size;

/**
 * Love Meter layout. Back wall: the giant meter with the loveseat booth in
 * front of it. Two roped queue lanes run down from the booth with a moving
 * belt and a heart pulley at the head of each. Spectator loveseats face the
 * booth from the front of the room.
 */
export function loveLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const next = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement => ({
    id: `lv${(n++).toString(36).padStart(3, '0')}`,
    def,
    x,
    y,
    rot,
  });
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`love layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };
  const tryPut = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    if (!validatePlacement(p, S, out, null)) out.push(p);
  };
  const rect = (def: string, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tryPut(def, x, y);
  };

  // ---- booth: giant meter, loveseat, candles and balloons
  put('love_meter', LOVE_METER_TILE.x, LOVE_METER_TILE.y);
  put('loveseat', LOVE_SEATS[0].x, LOVE_SEATS[0].y, 0);
  put('balloons', LOVE_METER_TILE.x - 2, 0);
  put('balloons', LOVE_METER_TILE.x + 3, 0);
  put('candle', LOVE_SEATS[0].x - 1, 2);
  put('candle', LOVE_SEATS[1].x + 1, 2);
  put('rose_bush', LOVE_METER_TILE.x - 1, 0);
  put('rose_bush', LOVE_METER_TILE.x + 2, 0);

  // ---- queue lanes: velvet ropes either side, belt down the middle, pulley + sign
  LOVE_LANES.forEach((l, side) => {
    const back = l.front + l.len - 1;
    for (let y = l.front; y <= back; y++) {
      put('rope_post', l.x - 1, y);
      put('rope_post', l.x + 1, y);
      put('conveyor', l.x, y);
    }
    put('pulley', side === 0 ? l.x - 1 : l.x + 1, l.front - 1);
    put(side === 0 ? 'sign_blue' : 'sign_pink', side === 0 ? l.x - 1 : l.x + 1, back + 1);
  });

  // ---- carpets: stage and the aisle between the lanes
  rect('love_carpet', 8, 0, 13, 4);
  rect('love_carpet', 10, 5, 11, 17);

  // ---- back wall décor
  put('neon', 3, 0);
  put('neon', 17, 0);
  for (let x = 0; x < S; x++) tryPut(x % 2 ? 'rose_bush' : 'tree_pink', x, 0);
  for (let y = 1; y < S - 2; y += 2) {
    tryPut('rose_bush', 0, y);
    tryPut('plant', S - 1, y);
  }

  // ---- side lounges: pink sofas facing the lanes, rugs, lamps
  put('sofa_pink', 1, 8, 3);
  put('sofa_pink', 1, 12, 3);
  put('table_round', 3, 10);
  put('rug', 2, 9);
  put('lamp', 2, 6);
  put('sofa_pink', 20, 8, 1);
  put('sofa_pink', 20, 12, 1);
  put('table_round', 18, 10);
  put('rug', 18, 9);
  put('lamp', 19, 6);
  put('jukebox', 19, 2);
  put('disco', 3, 16);

  // ---- spectator row: loveseats facing the booth
  for (const x of [2, 6, 14, 18]) put('loveseat', x, 19, 2);
  put('rug_small', 10, 19);
  put('rug_small', 11, 19);
  for (const x of [1, 5, 9, 12, 16, 20]) tryPut('candle', x, 21);
  for (const x of [0, 4, 8, 13, 17, 21]) tryPut('balloons', x, 21);

  return out;
}
