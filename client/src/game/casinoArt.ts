import { Graphics } from 'pixi.js';
import { FurnitureDef, ROLLING, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { casinoMap } from './casinoPixels';
import { drawPixelMap } from './pixelArt';

/**
 * Casino furniture, drawn as crisp pixel art (see casinoPixels). Chance furni
 * read `c.state` (see artStateKey): '0' closed, '-1' rolling (animated), else a
 * face; the dicemaster also accepts client-only lid keys ('open1'.., 'close1'..).
 */

type Painter = (g: Graphics, c: ArtCtx) => void;

export function artStateKey(def: FurnitureDef, state: string | undefined): string {
  if (!def.interaction) return '';
  const s = state || '0';
  if (def.interaction !== 'dice100' || s === ROLLING || s === '0') return s;
  const n = Number(s);
  return n <= 33 ? 'lo' : n <= 66 ? 'mid' : 'hi';
}

/** mirrored for odd rotations, anchored on the footprint centre */
const sprite =
  (kind: string): Painter =>
  (g, c) => {
    const map = casinoMap({ kind, state: c.state, frame: c.frame, on: c.on });
    if (map) drawPixelMap(g, map, c.cx, c.cy, c.rot % 2 === 1);
  };

export const CASINO_PAINTERS: Record<string, Painter> = {
  dicemaster: sprite('dicemaster'),
  holodice: sprite('holodice'),
  wheel_fortune: sprite('wheel_fortune'),
  dragon_egg: sprite('dragon_egg'),
  throne: sprite('throne'),
  felt_table: sprite('felt_table'),
  chip_stack: sprite('chip_stack'),
  casino_carpet: sprite('casino_carpet'),
  slot_prop: sprite('slot_prop'),
  velvet_rope_gold: sprite('velvet_rope_gold'),

  neon_casino(g, c) {
    // wall sign: hangs high along whichever axis the footprint runs
    const map = casinoMap({ kind: 'neon_casino', state: '', frame: c.frame, on: c.on });
    if (!map) return;
    const onX = c.rot % 2 === 0;
    const mid = onX ? tileToScreen(c.w / 2, 0) : tileToScreen(0, c.h / 2);
    const rows = map.rows.length;
    drawPixelMap(g, map, mid.x, mid.y - 82 + rows, !onX);
  },
};
