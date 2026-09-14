import { Placement, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * Trading Room (slug stays 'casino'): a high-roller hall split into zones by
 * egg walls, hedges and gold rails, always with walk-through gaps. A gold
 * runner leads in from the door; the dice alley (six dealer booths) runs down
 * the west side, the Wheel of Fortune sits on a railed gold stage in the
 * middle, high/low holodice tables line the south, the rare gallery shows off
 * egg towers and the Golden Throne in the north-east, and the trade lounge
 * has sofas in the east. System furni has no itemId: never tradeable.
 */
export const CASINO = {
  slug: 'casino',
  name: 'Trading Room',
  category: 'hangout',
  theme: 'gameroom' as RoomTheme,
  size: 24,
  featured: true,
} as const;

const S = CASINO.size;
const CHANCE = new Set(['dicemaster', 'holodice', 'wheel_fortune']);

type Tile = [number, number];

/** chair tile is (bx + 1, by + 1); dice sit left, right and behind it */
export const TRADING_BOOTHS: Tile[] = [
  [2, 8],
  [6, 8],
  [2, 11],
  [6, 11],
  [2, 14],
  [6, 14],
];

export interface ZoneDivider {
  name: string;
  /** the full line, gaps included */
  tiles: Tile[];
  /** tiles left open to walk through */
  gaps: Tile[];
  /** 'egg' fills runs of two with egg walls (a lone tile gets a hedge) */
  piece: 'egg' | 'hedge' | 'rail';
}

const row = (y: number, x0: number, x1: number): Tile[] => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);
const col = (x: number, y0: number, y1: number): Tile[] => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i]);
const divider = (name: string, tiles: Tile[], gaps: Tile[], piece: ZoneDivider['piece']): ZoneDivider => ({ name, tiles, gaps, piece });

export const TRADING_DIVIDERS: ZoneDivider[] = [
  divider('entrance / dice alley', row(6, 0, 9), [[1, 6], [2, 6], [5, 6]], 'egg'),
  divider('dice alley / wheel stage', col(10, 6, 17), [[10, 9], [10, 13]], 'egg'),
  divider('dice alley / high-low', row(17, 0, 9), [[1, 17], [5, 17], [9, 17]], 'egg'),
  divider('wheel stage north', row(9, 12, 17), [[14, 9], [15, 9]], 'rail'),
  divider('wheel stage south', row(14, 12, 17), [[14, 14], [15, 14]], 'rail'),
  divider('wheel stage west', col(12, 10, 13), [[12, 11], [12, 12]], 'rail'),
  divider('wheel stage east', col(17, 10, 13), [[17, 11], [17, 12]], 'rail'),
  divider('centre / high-low', row(17, 11, 18), [[13, 17], [14, 17], [15, 17]], 'rail'),
  divider('rare gallery west', col(18, 1, 6), [[18, 4]], 'rail'),
  divider('rare gallery south', row(7, 18, 23), [[20, 7]], 'rail'),
  divider('trade lounge west', col(19, 9, 16), [[19, 11], [19, 12]], 'hedge'),
  divider('trade lounge / high-low', row(17, 19, 23), [[21, 17]], 'hedge'),
];

export function casinoLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const next = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement => {
    const p: Placement = { id: `cs${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot };
    if (CHANCE.has(def)) p.state = '0';
    return p;
  };
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`trading room layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };
  const tryPut = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    if (!validatePlacement(p, S, out, null)) out.push(p);
  };
  const patch = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tryPut('gold_patch', x, y);
  };

  // ---- walls: banners flank the door (above tile 1,0), neon over the hall and down the west wall
  put('trading_banner', 5, 0);
  put('trading_banner', 0, 3, 1);
  put('neon_casino', 11, 0);
  put('neon_casino', 14, 0);
  put('neon_casino', 0, 12, 1);

  // ---- zone dividers
  for (const d of TRADING_DIVIDERS) {
    const gap = new Set(d.gaps.map(([x, y]) => `${x},${y}`));
    const open = (t: Tile | undefined) => !!t && !gap.has(`${t[0]},${t[1]}`);
    for (let i = 0; i < d.tiles.length; i++) {
      const t = d.tiles[i];
      if (!open(t)) continue;
      if (d.piece === 'egg' && open(d.tiles[i + 1])) {
        put('egg_wall', t[0], t[1], d.tiles[i + 1][0] === t[0] ? 1 : 0);
        i++;
      } else put(d.piece === 'rail' ? 'gold_rail' : 'leaf_hedge', t[0], t[1]);
    }
  }

  // ---- entrance: hedges flank the gold runner
  for (const [x, y] of [[0, 2], [0, 4], [3, 2], [3, 4]] as Tile[]) put('leaf_hedge', x, y);

  // ---- dice alley: six dealer booths, chair in the middle, dice left, right and behind
  for (const [bx, by] of TRADING_BOOTHS) {
    put('dicemaster', bx + 1, by);
    put('dicemaster', bx, by + 1);
    put('game_chair', bx + 1, by + 1, 2);
    put('dicemaster', bx + 2, by + 1);
  }
  for (const y of [9, 12, 15]) put('slot_prop', 0, y);

  // ---- wheel stage
  put('wheel_fortune', 14, 11);

  // ---- rare gallery
  put('egg_stack_3', 19, 1);
  put('throne_gold', 21, 1);
  put('egg_stack_3', 23, 1);
  put('dragon_egg', 19, 4);
  put('egg_stack_3', 21, 4);
  put('dragon_egg', 23, 4);
  put('egg_stack_2', 23, 6);

  // ---- trade lounge
  put('trade_sofa', 20, 9);
  put('trade_sofa', 22, 9);
  put('chip_stack', 21, 11);
  put('chip_stack', 22, 11);
  put('trade_sofa', 20, 13);
  put('trade_sofa', 22, 13);
  put('chip_stack', 21, 15);
  put('palm_planter', 23, 16);
  put('palm_planter', 20, 16);

  // ---- high/low tables
  for (const x of [3, 10, 17]) {
    put('felt_table', x, 20);
    put('holodice', x + 2, 20);
  }

  // ---- hall and perimeter props
  put('palm_planter', 11, 1);
  put('palm_planter', 17, 1);
  put('chip_stack', 13, 2);
  put('chip_stack', 16, 2);
  for (const y of [19, 22]) {
    put('slot_prop', 0, y);
    put('slot_prop', 23, y);
  }
  put('palm_planter', 23, 23);
  put('palm_planter', 8, 23);
  put('palm_planter', 15, 23);

  // ---- gold floors under each zone, red carpet everywhere else
  patch(1, 1, 2, 6); // the runner from the door
  patch(1, 7, 9, 16); // dice alley
  patch(12, 9, 17, 14); // wheel stage
  patch(19, 1, 23, 6); // rare gallery
  patch(20, 9, 23, 16); // trade lounge
  for (const x of [2, 9, 16]) patch(x, 19, x + 5, 21); // high/low tables
  for (let y = 1; y < S; y++) for (let x = 0; x < S; x++) tryPut('casino_carpet', x, y);

  return out;
}
