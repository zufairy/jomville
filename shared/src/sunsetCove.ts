import { Placement, RoomMask, validatePlacement } from './furniture';
import { RoomTheme } from './constants';
import type { BotRoute } from './rocketLab';

/**
 * Sunset Cove: a golden-hour island. Curved sandy shoreline with animated
 * foam, a wooden pier to a sunset deck, tiki bar, cabana, lifeguard tower,
 * flamingo pool, hammock between palms, and crabs + a gull wandering about.
 */
export const SUNSET_COVE = {
  slug: 'sunsetcove',
  name: 'Sunset Cove',
  category: 'chill',
  theme: 'beach' as RoomTheme,
  size: 18,
} as const;

const S = SUNSET_COVE.size;

const shoreY = (x: number) => 12 + Math.round(1.5 * Math.sin(x / 2.6));
const shoreX = (y: number) => 13 + Math.round(1.5 * Math.sin(y / 2.2));

function isLand(x: number, y: number) {
  return y <= shoreY(x) && x <= shoreX(y);
}

/** pier out over the water plus the sunset deck at its end */
function isPier(x: number, y: number) {
  const walk = x >= 6 && x <= 7 && y > shoreY(x) && y <= 15;
  const deck = x >= 5 && x <= 8 && y >= 14 && y <= 16;
  return walk || deck;
}

export function sunsetCoveMask(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < S; y++) {
    let row = '';
    for (let x = 0; x < S; x++) row += isLand(x, y) || isPier(x, y) ? '1' : '0';
    rows.push(row);
  }
  return rows;
}

export function sunsetCoveLayout(): Placement[] {
  const mask: RoomMask = sunsetCoveMask();
  const out: Placement[] = [];
  let n = 0;
  const next = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement => ({ id: `sc${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot });
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    const err = validatePlacement(p, S, out, mask);
    if (err) throw new Error(`sunset cove layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };
  const tryPut = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    if (!validatePlacement(p, S, out, mask)) out.push(p);
  };

  // ---- the pier and sunset deck
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (isPier(x, y)) put('deck', x, y);
  put('lamppost', 5, 16);
  put('lamppost', 8, 16);
  put('boombox', 6, 16);
  put('sun_lounger', 7, 14, 0);

  // ---- tiki bar with stools (back right), palms framing it
  put('tiki_bar', 8, 1);
  put('stool', 8, 3);
  put('stool', 9, 3);
  put('tree_palm', 7, 0);
  put('tree_palm', 11, 0);
  put('shell_lamp', 10, 3);

  // ---- cabana + surf corner (left). Row 0, x 0-4 stays low: the door and capsule machine hang there.
  put('cabana', 3, 3);
  put('sandcastle', 2, 1);
  put('surf_rack', 0, 4);
  put('surf_rack', 0, 5);
  put('tree_palm', 0, 7);

  // ---- flamingo pool and beach ball in the middle
  put('flamingo_pool', 5, 5);
  put('beach_ball', 8, 7);
  put('shell_lamp', 2, 6);

  // ---- lifeguard tower watching the water (right)
  put('lifeguard_tower', 11, 6);

  // ---- loungers under an umbrella facing the sea
  put('sun_lounger', 1, 9, 0);
  put('umbrella', 3, 9);
  put('sun_lounger', 4, 9, 0);

  // ---- hammock strung between two palms
  put('tree_palm', 8, 9);
  put('hammock', 9, 9);
  put('tree_palm', 11, 9);

  // ---- bonfire circle near the shore
  put('campfire', 2, 11);
  put('stool', 1, 11);
  put('stool', 3, 11);
  put('stool', 2, 10);

  // ---- towels, sandcastle and a lamp by the water
  put('beach_towel', 6, 10);
  put('beach_towel', 7, 10);
  put('sandcastle', 10, 11);
  put('shell_lamp', 12, 10);

  // ---- foam runs along every sand tile whose seaward side is water
  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && (isLand(x, y) || isPier(x, y));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!isLand(x, y)) continue;
      if (!floor(x, y + 1) || !floor(x + 1, y)) tryPut('shore_foam', x, y);
    }
  return out;
}

export const BEACH_CRITTERS: BotRoute[] = [
  {
    id: 'crab-a',
    kind: 'crab',
    speed: 0.9,
    stops: [
      { x: 4, y: 12, dwell: 1600 },
      { x: 9, y: 12, dwell: 2400, say: 'pinch pinch' },
    ],
  },
  {
    id: 'crab-b',
    kind: 'crab',
    speed: 0.7,
    stops: [
      { x: 13, y: 2, dwell: 2200 },
      { x: 13, y: 5, dwell: 1800 },
    ],
  },
  {
    id: 'gull',
    kind: 'gull',
    speed: 2.2,
    stops: [
      { x: 1, y: 2, dwell: 300 },
      { x: 15, y: 2, dwell: 300 },
      { x: 15, y: 15, dwell: 300 },
      { x: 1, y: 15, dwell: 300 },
    ],
  },
];
