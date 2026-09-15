import type { Placement } from '@dovey/shared';

/**
 * What a tap on the floor means. The tile under the finger always wins:
 * tall sprites (benches, lamps, stalls) overlap many tiles on screen, so a
 * sprite-bounds hit only counts when the tapped tile itself can't be walked on.
 */
export type TapAction =
  | { kind: 'walk'; x: number; y: number }
  | { kind: 'use'; item: Placement }
  | { kind: 'seat'; item: Placement }
  | { kind: 'none' };

export interface TapWorld {
  walkable: (x: number, y: number) => boolean;
  /** seat whose footprint covers this tile */
  seatAt: (x: number, y: number) => Placement | null;
  /** usable item whose footprint covers this tile */
  usableAt: (x: number, y: number) => Placement | null;
  /** topmost usable or sittable sprite under the pointer, and whether it is a seat */
  spriteHit: () => { item: Placement; sit: boolean } | null;
  /**
   * topmost usable item whose drawn (opaque) art is under the pointer. Unlike
   * spriteHit's padded bounds this is exact, so it may beat the floor tile: a
   * holodice cube is drawn over walkable tiles behind it.
   */
  artHit?: () => { item: Placement; sit: boolean } | null;
}

export function resolveTap(tile: { x: number; y: number }, w: TapWorld): TapAction {
  const { x, y } = tile;
  if (w.seatAt(x, y) && w.walkable(x, y)) return { kind: 'walk', x, y };
  const item = w.usableAt(x, y);
  if (item) return { kind: 'use', item };
  const art = w.artHit?.();
  if (art) return art.sit ? { kind: 'seat', item: art.item } : { kind: 'use', item: art.item };
  if (w.walkable(x, y)) return { kind: 'walk', x, y };
  const hit = w.spriteHit();
  if (hit) return hit.sit ? { kind: 'seat', item: hit.item } : { kind: 'use', item: hit.item };
  return { kind: 'none' };
}
