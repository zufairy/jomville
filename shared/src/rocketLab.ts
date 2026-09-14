import { Placement, validatePlacement } from './furniture';
import { RoomTheme } from './constants';

/**
 * Along Rocket Lab: a small featured showcase room. Dark space theme, wall
 * art that moves, a porthole onto Earth, a pod bed, holo desk, server rack,
 * hover shelves, alien rugs, and two robots that patrol the floor.
 */
export const ROCKET_LAB = {
  slug: 'rocketlab',
  name: 'Along Rocket Lab',
  category: 'showcase',
  theme: 'lab' as RoomTheme,
  size: 12,
  featured: true,
} as const;

const S = ROCKET_LAB.size;

export function rocketLabLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p: Placement = { id: `rl${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot };
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`rocket lab layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };

  // ---- back walls: moving art and a porthole onto Earth
  // (x 0-4 of the y=0 wall belongs to the exit door and capsule machine fixtures)
  put('art_planet', 5, 0);
  put('space_window', 7, 0);
  put('art_wave', 10, 0);
  put('art_rocket', 0, 2, 1);
  put('art_circuit', 0, 7, 1);

  // ---- sleep + work corner
  put('pod_bed', 1, 1);
  put('lava_lamp', 3, 1);
  put('holo_desk', 5, 1);
  put('egg_chair', 5, 2, 2); // faces the desk
  put('server_rack', 7, 1);
  put('lava_lamp', 9, 1);
  put('rocket_model', 10, 1);

  // ---- left wall: hover shelf, orb light, alien plant
  put('holo_shelf', 1, 4, 1);
  put('orb_light', 1, 7);
  put('alien_plant', 1, 10);

  // ---- centre: alien rug; front: saturn rug lounge with egg chairs + telescope
  put('rug_alien', 4, 5);
  put('rug_saturn', 7, 8);
  put('egg_chair', 6, 9, 3);
  put('egg_chair', 9, 9, 1);
  put('telescope', 10, 10);
  put('orb_light', 4, 10);

  // ---- right side: robot dock, plant, lava lamp
  put('robot_dock', 11, 8);
  put('alien_plant', 10, 4);
  put('lava_lamp', 11, 5);

  // ---- glowing hex floor panels
  for (const [x, y] of [
    [3, 3],
    [5, 3],
    [6, 3],
    [8, 3],
    [8, 6],
    [3, 9],
    [2, 9],
    [9, 11],
  ] as const) {
    put('hex_panel', x, y);
  }
  return out;
}

// ---- robots: decorative, client-drawn, pose derived from wall-clock time so every visitor sees the same patrol

export interface BotStop {
  x: number;
  y: number;
  /** ms spent at this stop before moving on */
  dwell: number;
  say?: string;
}

export interface BotRoute {
  id: string;
  kind: 'rover' | 'drone' | 'crab' | 'gull' | 'butterfly' | 'kitty' | 'mascot';
  /** tiles per second */
  speed: number;
  /** consecutive stops (and last -> first) share an x or a y */
  stops: BotStop[];
}

export interface BotPose {
  x: number;
  y: number;
  /** 0 up, 1 right, 2 down, 3 left */
  dir: number;
  moving: boolean;
  say: string | null;
  /** 0..1 progress through the current dwell or move */
  k: number;
}

export const LAB_BOTS: BotRoute[] = [
  {
    id: 'rover',
    kind: 'rover',
    speed: 1.1,
    stops: [
      { x: 10, y: 8, dwell: 3200, say: 'charging… beep boop' },
      { x: 10, y: 5, dwell: 1800 },
      { x: 3, y: 5, dwell: 2600, say: 'scanning ✦' },
      { x: 3, y: 8, dwell: 2200, say: 'all systems go' },
    ],
  },
  {
    id: 'drone',
    kind: 'drone',
    speed: 0.9,
    stops: [
      { x: 2, y: 3, dwell: 2200, say: 'hello, astronaut' },
      { x: 9, y: 3, dwell: 1500 },
      { x: 9, y: 6, dwell: 2600, say: 'mapping stars…' },
      { x: 2, y: 6, dwell: 1500 },
    ],
  },
];

const dist = (a: BotStop, b: BotStop) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
const dirOf = (a: BotStop, b: BotStop) => (b.x > a.x ? 1 : b.x < a.x ? 3 : b.y > a.y ? 2 : 0);

export function routeLength(r: BotRoute): number {
  let ms = 0;
  r.stops.forEach((a, i) => {
    ms += a.dwell + (dist(a, r.stops[(i + 1) % r.stops.length]) / r.speed) * 1000;
  });
  return ms;
}

export function botPose(r: BotRoute, nowMs: number): BotPose {
  const total = routeLength(r);
  let t = ((nowMs % total) + total) % total;
  const n = r.stops.length;
  for (let i = 0; i < n; i++) {
    const a = r.stops[i];
    const b = r.stops[(i + 1) % n];
    if (t < a.dwell) return { x: a.x, y: a.y, dir: dirOf(a, b), moving: false, say: a.say ?? null, k: t / a.dwell };
    t -= a.dwell;
    const ms = (dist(a, b) / r.speed) * 1000;
    if (t < ms) {
      const f = t / ms;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dir: dirOf(a, b), moving: true, say: null, k: f };
    }
    t -= ms;
  }
  const first = r.stops[0];
  return { x: first.x, y: first.y, dir: dirOf(first, r.stops[1 % n]), moving: false, say: first.say ?? null, k: 0 };
}
