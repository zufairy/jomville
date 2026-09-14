import { Graphics } from 'pixi.js';
import { FurnitureDef, ROLLING, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { HOLO_IDLE_FRAMES, casinoMap, holoKey } from './casinoPixels';
import { PixelMap, drawPixelMap } from './pixelArt';

/**
 * Casino and Trading Room furniture, drawn as crisp pixel art (see casinoPixels
 * and tradingPixels). Chance furni read `c.state` (see artStateKey): '0'
 * closed, '-1' rolling (animated), else a face; the dicemaster also accepts
 * client-only lid keys ('open1'..) and the holodice lock-in keys ('lock1:42'..).
 */

type Painter = (g: Graphics, c: ArtCtx) => void;

/** the state part of the atlas key; the holodice keeps its exact number so each one bakes its own (lazy) strip */
export function artStateKey(def: FurnitureDef, state: string | undefined): string {
  if (!def.interaction) return '';
  const s = state || '0';
  return def.interaction === 'dice100' ? holoKey(s) : s;
}

/** a holodice showing a settled number (loops its idle hologram) */
function holoIdle(def: FurnitureDef, sk: string): boolean {
  return def.interaction === 'dice100' && /^\d+$/.test(sk) && sk !== '0';
}

/** frames to bake for an art state: shown faces are stills, except the holodice's idle loop */
export function artFrameCount(def: FurnitureDef, sk: string): number {
  if (!def.interaction || sk === ROLLING) return def.anim;
  return holoIdle(def, sk) ? HOLO_IDLE_FRAMES : 1;
}

/** playback speed override for an art state, or null for the item's normal loop speed */
export function artFps(def: FurnitureDef, sk: string): number | null {
  return holoIdle(def, sk) ? 4 : null;
}

/** mirrored for odd rotations, anchored on the footprint centre */
const sprite =
  (kind: string): Painter =>
  (g, c) => {
    const map = casinoMap({ kind, state: c.state, frame: c.frame, on: c.on });
    if (map) drawPixelMap(g, map, c.cx, c.cy, c.rot % 2 === 1);
  };

/**
 * Wall piece: hangs along whichever axis the footprint runs. `flatTop` is
 * how high above the floor the top of the unsheared art sits at its centre.
 */
function hang(g: Graphics, c: ArtCtx, map: PixelMap, flatTop: number) {
  const onX = c.rot % 2 === 0;
  const mid = onX ? tileToScreen(c.w / 2, 0) : tileToScreen(0, c.h / 2);
  const w = map.rows[0].length;
  // the shear drops the centre column by w/4 art rows
  // never mirror: wall pieces carry lettering that must read left-to-right on either wall
  drawPixelMap(g, map, mid.x, mid.y - flatTop - Math.floor(w / 4) * 2 + map.rows.length * 2, false);
}

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
  egg_stack_2: sprite('egg_stack_2'),
  egg_stack_3: sprite('egg_stack_3'),
  egg_wall: sprite('egg_wall'),
  gold_patch: sprite('gold_patch'),
  leaf_hedge: sprite('leaf_hedge'),
  palm_planter: sprite('palm_planter'),
  gold_rail: sprite('gold_rail'),
  trade_sofa: sprite('trade_sofa'),

  neon_casino(g, c) {
    // wall sign: hangs high along whichever axis the footprint runs
    const map = casinoMap({ kind: 'neon_casino', state: '', frame: c.frame, on: c.on });
    if (!map) return;
    const onX = c.rot % 2 === 0;
    const mid = onX ? tileToScreen(c.w / 2, 0) : tileToScreen(0, c.h / 2);
    const rows = map.rows.length;
    // never mirror: the sign carries lettering that must read left-to-right on either wall
    drawPixelMap(g, map, mid.x, mid.y - 82 + rows, false);
  },

  trading_banner(g, c) {
    const map = casinoMap({ kind: 'trading_banner', state: '', frame: c.frame, on: c.on });
    if (map) hang(g, c, map, 124);
  },
};
