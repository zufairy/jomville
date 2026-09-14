import { Placement, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * Casino: Habbo-style dice hall. Five dealer booths (a chair with three
 * Dicemasters in reach), a Wheel of Fortune stage, two Holodice high/low
 * tables, a Golden Throne on show, red-and-gold carpet everywhere.
 * System furni has no itemId: it belongs to the room and is never tradeable.
 */
export const CASINO = {
  slug: 'casino',
  name: 'Casino',
  category: 'hangout',
  theme: 'gameroom' as RoomTheme,
  size: 20,
  featured: true,
} as const;

const S = CASINO.size;
const CHANCE = new Set(['dicemaster', 'holodice', 'wheel_fortune']);

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
    if (err) throw new Error(`casino layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };
  const tryPut = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    if (!validatePlacement(p, S, out, null)) out.push(p);
  };

  // ---- back wall neon (row 0, x 0-4 stays clear for the door, as in Game Den)
  put('neon_casino', 6, 0);
  put('neon_casino', 12, 0);

  // ---- throne on show in the far corner, gold ropes either side
  put('throne_gold', 18, 1);
  put('velvet_rope_gold', 17, 1);
  put('velvet_rope_gold', 18, 2);

  // ---- five dealer booths: chair in the middle, dice left, right and behind
  const booths: Array<[number, number]> = [
    [3, 4],
    [8, 4],
    [13, 4],
    [3, 10],
    [13, 10],
  ];
  for (const [bx, by] of booths) {
    put('dicemaster', bx + 1, by);
    put('dicemaster', bx, by + 1);
    put('game_chair', bx + 1, by + 1, 2);
    put('dicemaster', bx + 2, by + 1);
  }

  // ---- wheel stage in the middle
  put('wheel_fortune', 9, 10);

  // ---- holodice high/low tables at the front
  put('felt_table', 4, 15);
  put('holodice', 6, 15);
  put('felt_table', 12, 15);
  put('holodice', 14, 15);

  // ---- props along the side walls
  for (const y of [3, 7, 13]) put('slot_prop', 0, y);
  for (const y of [5, 9, 13]) put('chip_stack', 19, y);

  // ---- carpet under everything walkable
  for (let y = 1; y < S; y++) for (let x = 0; x < S; x++) tryPut('casino_carpet', x, y);

  return out;
}
