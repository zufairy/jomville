/**
 * Room look: floor, wall and background colours plus whether walls show.
 * Owners pick from curated palettes so every room stays on-brand.
 */
export interface RoomStyle {
  floor: number;
  wall: number;
  bg: number;
  walls: boolean;
}

export const STYLE_FLOORS = [0xf3d9a4, 0xd9c4b0, 0xb59e88, 0xa6d977, 0xffb3c6, 0xd6a3ff, 0x7ecbff, 0x8fe3d2, 0xe6e2ea, 0x2c3e50, 0xf9d66b, 0xf0a35e] as const;
export const STYLE_WALLS = [0xfff7e6, 0xffd6a5, 0xffb3c6, 0xd6a3ff, 0xa8e6ff, 0x8fe3d2, 0xb8e986, 0xf9d66b, 0xe6e2ea, 0xb7b3c4, 0x7d7a91, 0x2c3e50] as const;
export const STYLE_BGS = [0xf6ecd9, 0xfff1a8, 0xffd6a5, 0xffb3c6, 0xd6a3ff, 0xa8e6ff, 0x8fe3d2, 0xb8e986, 0xe6e2ea, 0x7d7a91, 0x2c3e50, 0x1c1c1c] as const;

export const DEFAULT_STYLE: RoomStyle = { floor: 0xf3d9a4, wall: 0xffd6a5, bg: 0xf6ecd9, walls: true };

const pick = (raw: unknown, allowed: readonly number[], fallback: number) =>
  typeof raw === 'number' && Number.isInteger(raw) && allowed.includes(raw) ? raw : fallback;

/** Coerce untrusted input (client message, db json) to a valid style. */
export function normalizeStyle(raw: unknown, base: RoomStyle = DEFAULT_STYLE): RoomStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof RoomStyle, unknown>>;
  return {
    floor: pick(r.floor, STYLE_FLOORS, base.floor),
    wall: pick(r.wall, STYLE_WALLS, base.wall),
    bg: pick(r.bg, STYLE_BGS, base.bg),
    walls: typeof r.walls === 'boolean' ? r.walls : base.walls,
  };
}

export function parseStyle(s: string): RoomStyle {
  try {
    return normalizeStyle(JSON.parse(s));
  } catch {
    return { ...DEFAULT_STYLE };
  }
}
