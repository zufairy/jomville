import { TILE_H, TILE_W } from './constants';

export interface Point {
  x: number;
  y: number;
}

/** Tile coords (may be fractional) -> screen px, origin at tile (0,0) top corner. */
export function tileToScreen(tx: number, ty: number): Point {
  return {
    x: (tx - ty) * (TILE_W / 2),
    y: (tx + ty) * (TILE_H / 2),
  };
}

/** Screen px -> fractional tile coords. */
export function screenToTile(sx: number, sy: number): Point {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Screen px -> integer tile that contains the point (diamond-accurate). */
export function screenToTileIndex(sx: number, sy: number): Point {
  const t = screenToTile(sx, sy);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}
