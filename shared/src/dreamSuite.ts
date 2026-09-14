import { Placement, validatePlacement } from './furniture';
import { RoomTheme } from './constants';
import type { BotRoute } from './rocketLab';

/**
 * Dream Suite: a pastel "main character" bedroom built for photos. Neon angel
 * wings over a cloud rug (the photo spot), a canopy bed with fairy lights,
 * heart vanity, boba bar, flower swings, heart disco ball, and a kitty plus
 * butterflies drifting around.
 */
export const DREAM_SUITE = {
  slug: 'dreamsuite',
  name: 'Dream Suite',
  category: 'hangout',
  theme: 'dream' as RoomTheme,
  size: 14,
} as const;

const S = DREAM_SUITE.size;

export function dreamSuiteLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const next = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement => ({ id: `ds${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot });
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`dream suite layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };

  // ---- photo spot: neon wings on the back wall over a cloud rug, star lamps either side
  // (row 0, x 0-4 stays clear: the door and capsule machine hang there)
  put('neon_wings', 6, 0);
  put('fluffy_rug', 6, 1);
  put('star_lamp', 5, 1);
  put('star_lamp', 9, 1);
  put('photo_wall', 10, 0);
  put('heart_mirror', 0, 8, 1);

  // ---- canopy bed corner (right) with balloons and a giant teddy
  put('canopy_bed', 11, 2);
  put('balloons', 12, 1);
  put('teddy_giant', 13, 5);

  // ---- vanity along the left wall with a heart chair
  put('vanity', 1, 2, 1);
  put('heart_chair', 2, 3, 1);

  // ---- heart runway from the lounge up to the photo spot, disco heart overhead
  for (let y = 3; y <= 7; y++) {
    put('love_carpet', 6, y);
    put('love_carpet', 7, y);
  }
  put('heart_disco', 7, 5);

  // ---- flower swings
  put('swing_chair', 3, 5);
  put('swing_chair', 10, 5);

  // ---- lounge: cloud rug, cloud sofas facing the runway, cake stand between them
  put('fluffy_rug', 6, 8);
  put('cloud_sofa', 4, 11, 2);
  put('cake_stand', 6, 11);
  put('cloud_sofa', 8, 11, 2);

  // ---- boba bar with heart chairs (right)
  put('boba_bar', 11, 8, 1);
  put('heart_chair', 10, 8, 3);
  put('heart_chair', 10, 9, 3);

  // ---- plushies, lamp, balloons, candles
  put('bunny_plush', 1, 12);
  put('bunny_plush', 12, 12);
  put('star_lamp', 13, 10);
  put('balloons', 1, 10);
  put('candle', 13, 7);

  // ---- a flower border along the front edge
  for (let x = 2; x <= 11; x++) put('flowers', x, 13);
  return out;
}

export const DREAM_CRITTERS: BotRoute[] = [
  {
    id: 'kitty',
    kind: 'kitty',
    speed: 0.6,
    stops: [
      { x: 3, y: 12, dwell: 4200, say: 'purr…' },
      { x: 10, y: 12, dwell: 3200, say: 'mew ♡' },
    ],
  },
  {
    id: 'butterfly-a',
    kind: 'butterfly',
    speed: 1.2,
    stops: [
      { x: 2, y: 4, dwell: 600 },
      { x: 12, y: 4, dwell: 600 },
      { x: 12, y: 10, dwell: 600 },
      { x: 2, y: 10, dwell: 600 },
    ],
  },
  {
    id: 'butterfly-b',
    kind: 'butterfly',
    speed: 0.9,
    stops: [
      { x: 4, y: 6, dwell: 900 },
      { x: 9, y: 6, dwell: 900 },
      { x: 9, y: 9, dwell: 900 },
      { x: 4, y: 9, dwell: 900 },
    ],
  },
];
