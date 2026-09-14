import { Placement, buildGrid, validatePlacement } from './furniture';
import { RoomTheme } from './constants';
import type { BotRoute } from './rocketLab';

/**
 * Wonder Dome: a huge indoor theme park under a glass-and-brass dome. Walnut
 * floors and slatted wood walls, a wooden roller coaster looping the back of
 * the hall (board it at the station), a grand carousel, star swings, teacups
 * and a drop tower you can ride, a dancing fountain plaza, vintage snack carts,
 * an arcade alley and rattan lounges to hang out in.
 */
export const WONDER_DOME = {
  slug: 'wonderdome',
  name: 'Wonder Dome',
  category: 'showcase',
  theme: 'funpark' as RoomTheme,
  size: 28,
  featured: true,
} as const;

const S = WONDER_DOME.size;

// ---- roller coaster track (continuous floor coords: tile i spans i..i+1, so i + 0.5 is its centre)

export interface TrackPoint {
  x: number;
  y: number;
  /** rail height above the floor, px */
  z: number;
  /** arc distance from the station along the loop, tiles */
  d: number;
  lift: boolean;
}

export interface CoasterTrack {
  points: TrackPoint[];
  length: number;
  /** ms into the ride at which the train head passes each point */
  times: number[];
  rideMs: number;
  /** boarding time at the station between rides */
  dwellMs: number;
  cars: number;
  /** tiles between car centres */
  gap: number;
  /** station gate origin: car i waits over the track in front of gate tile x + i */
  gate: { x: number; y: number };
}

export interface TrackPose {
  x: number;
  y: number;
  z: number;
  /** unit heading on the floor plane */
  hx: number;
  hy: number;
  /** px of rise per tile travelled */
  slope: number;
}

/** track above this height leaves room to walk underneath; anything lower gets a trestle footing */
export const TRACK_CLEARANCE = 110;

type Piece =
  | { kind: 'line'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'arc'; cx: number; cy: number; r: number; from: number; to: number };

const HP = Math.PI / 2;

/** a rounded rectangle around the back-right of the hall, starting at the station heading +x */
const PIECES: Piece[] = [
  { kind: 'line', ax: 22.5, ay: 9.5, bx: 24, by: 9.5 },
  { kind: 'arc', cx: 24, cy: 8, r: 1.5, from: HP, to: 0 },
  { kind: 'line', ax: 25.5, ay: 8, bx: 25.5, by: 3 },
  { kind: 'arc', cx: 24, cy: 3, r: 1.5, from: 0, to: -HP },
  { kind: 'line', ax: 24, ay: 1.5, bx: 17, by: 1.5 },
  { kind: 'arc', cx: 17, cy: 3, r: 1.5, from: -HP, to: -Math.PI },
  { kind: 'line', ax: 15.5, ay: 3, bx: 15.5, by: 8 },
  { kind: 'arc', cx: 17, cy: 8, r: 1.5, from: Math.PI, to: HP },
  { kind: 'line', ax: 17, ay: 9.5, bx: 22.5, by: 9.5 },
];

const pieceLength = (p: Piece) => (p.kind === 'line' ? Math.hypot(p.bx - p.ax, p.by - p.ay) : Math.abs(p.to - p.from) * p.r);

function pieceAt(p: Piece, k: number) {
  if (p.kind === 'line') return { x: p.ax + (p.bx - p.ax) * k, y: p.ay + (p.by - p.ay) * k };
  const a = p.from + (p.to - p.from) * k;
  return { x: p.cx + Math.cos(a) * p.r, y: p.cy + Math.sin(a) * p.r };
}

const ease = (k: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, k)))) / 2;
const mod = (a: number, m: number) => ((a % m) + m) % m;

function buildTrack(): CoasterTrack {
  const ends: number[] = [];
  let acc = 0;
  for (const p of PIECES) {
    acc += pieceLength(p);
    ends.push(acc);
  }
  const L = acc;
  // [distance, height]: roll out of the station, chain lift up the right side, big drop along the
  // back wall, an airtime hill, a high pass down the left side (walk under it), dip, brake home
  const keys: Array<[number, number]> = [
    [0, 14],
    [ends[0] + 1, 16],
    [ends[2] + 0.4, 150],
    [ends[3] - 0.9, 160],
    [ends[3] + 2.4, 30],
    [ends[3] + 5.4, 128],
    [ends[5] - 0.4, 120],
    [ends[5] + 2.8, 118],
    [ends[6] - 0.4, 56],
    [ends[7] + 1.2, 14],
    [L, 14],
  ];
  const liftFrom = ends[0] + 1;
  const liftTo = ends[2] + 0.4;
  const brakeFrom = ends[7] + 1.2;
  const heightAt = (d: number) => {
    for (let i = 0; i < keys.length - 1; i++) {
      const [d0, z0] = keys[i];
      const [d1, z1] = keys[i + 1];
      if (d <= d1) return z0 + (z1 - z0) * ease((d - d0) / (d1 - d0));
    }
    return keys[keys.length - 1][1];
  };

  const step = 0.1;
  const points: TrackPoint[] = [];
  let base = 0;
  for (const p of PIECES) {
    const len = pieceLength(p);
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < n; s++) {
      const d = base + (len * s) / n;
      const { x, y } = pieceAt(p, s / n);
      points.push({ x, y, z: heightAt(d), d, lift: d >= liftFrom && d <= liftTo });
    }
    base += len;
  }

  // tiles per second: slow chain, gravity everywhere else, gentle at the station
  const speed = (pt: TrackPoint) => {
    if (pt.lift) return 1.3;
    if (pt.d < liftFrom || pt.d > brakeFrom) return 1.8;
    return 1.8 + Math.sqrt(Math.max(0, 165 - pt.z)) * 0.3;
  };
  const times = [0];
  for (let i = 1; i < points.length; i++) times.push(times[i - 1] + ((points[i].d - points[i - 1].d) / speed(points[i - 1])) * 1000);
  const last = points[points.length - 1];
  const rideMs = times[times.length - 1] + ((L - last.d) / speed(last)) * 1000;

  return { points, length: L, times, rideMs, dwellMs: 8000, cars: 4, gap: 1, gate: { x: 19, y: 10 } };
}

export const WONDER_COASTER: CoasterTrack = buildTrack();

/** index i with arr[i] <= v < arr[i + 1] (arr ascending, v >= arr[0]) */
function bracket(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const DISTANCES = new WeakMap<CoasterTrack, number[]>();
function distances(track: CoasterTrack): number[] {
  let ds = DISTANCES.get(track);
  if (!ds) {
    ds = track.points.map((p) => p.d);
    DISTANCES.set(track, ds);
  }
  return ds;
}

export function trackAt(track: CoasterTrack, d: number): TrackPose {
  const L = track.length;
  const dd = mod(d, L);
  const pts = track.points;
  const i = bracket(distances(track), dd);
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const span = (i + 1 < pts.length ? b.d : L) - a.d;
  const k = span > 0 ? (dd - a.d) / span : 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: a.x + dx * k,
    y: a.y + dy * k,
    z: a.z + (b.z - a.z) * k,
    hx: dx / len,
    hy: dy / len,
    slope: span > 0 ? (b.z - a.z) / span : 0,
  };
}

/** Where the train head is at wall-clock `now`. Every visitor derives the same ride from the clock. */
export function trainHead(track: CoasterTrack, now: number): { d: number; moving: boolean; k: number } {
  const cycle = track.dwellMs + track.rideMs;
  const t = mod(now, cycle);
  if (t < track.dwellMs) return { d: 0, moving: false, k: t / track.dwellMs };
  const r = t - track.dwellMs;
  const i = bracket(track.times, r);
  const pts = track.points;
  const t0 = track.times[i];
  const t1 = i + 1 < pts.length ? track.times[i + 1] : track.rideMs;
  const d0 = pts[i].d;
  const d1 = i + 1 < pts.length ? pts[i + 1].d : track.length;
  const k = t1 > t0 ? (r - t0) / (t1 - t0) : 0;
  return { d: d0 + (d1 - d0) * k, moving: true, k: r / track.rideMs };
}

/** car 0 is the rear car, car `cars - 1` leads */
export function carDistance(track: CoasterTrack, head: number, car: number): number {
  return mod(head - (track.cars - 1 - car) * track.gap, track.length);
}

/** lowest rail height over each tile the track crosses, keyed "x,y" */
export function coasterTiles(track: CoasterTrack): Map<string, number> {
  const out = new Map<string, number>();
  for (let d = 0; d < track.length; d += 0.04) {
    const p = trackAt(track, d);
    const key = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    out.set(key, Math.min(out.get(key) ?? Infinity, p.z));
  }
  return out;
}

// ---- layout

export function wonderDomeLayout(): Placement[] {
  const out: Placement[] = [];
  let n = 0;
  const next = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3): Placement => ({ id: `wd${(n++).toString(36).padStart(3, '0')}`, def, x, y, rot });
  const put = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    const err = validatePlacement(p, S, out, null);
    if (err) throw new Error(`wonder dome layout: ${def}@${x},${y} ${err}`);
    out.push(p);
  };
  const tryPut = (def: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => {
    const p = next(def, x, y, rot);
    if (!validatePlacement(p, S, out, null)) out.push(p);
  };

  // ---- roller coaster: trestle footings under every low stretch of track, the station, a queue lane
  for (const [key, z] of coasterTiles(WONDER_COASTER)) {
    if (z >= TRACK_CLEARANCE) continue;
    const [x, y] = key.split(',').map(Number);
    put('track_bed', x, y);
  }
  const gate = WONDER_COASTER.gate;
  put('coaster_gate', gate.x, gate.y);
  for (const y of [11, 12]) {
    put('brass_stanchion', gate.x - 1, y);
    put('brass_stanchion', gate.x + 4, y);
  }

  // ---- the coaster infield: drop tower in a little garden (walk in under the high track)
  put('drop_tower', 19, 4);
  tryPut('potted_fern', 17, 3);
  tryPut('potted_fern', 23, 3);
  tryPut('flower_basket', 17, 7);
  tryPut('flower_basket', 23, 7);
  tryPut('bulb_tree', 18, 6);
  tryPut('bulb_tree', 22, 6);

  // ---- back wall: marquee, clock, vintage posters; arched garden windows peek out behind the coaster
  // (row 0, x 0-4 stays clear: the door and capsule machine hang there)
  put('marquee_sign', 5, 0);
  put('wall_clock', 9, 0);
  put('framed_posters', 10, 0);
  tryPut('arched_window', 17, 0);
  tryPut('arched_window', 24, 0);

  // ---- arcade alley under the marquee
  put('claw_machine', 5, 1);
  put('claw_machine', 6, 1);
  put('claw_machine', 7, 1);
  put('high_striker', 9, 1);
  put('arcade', 11, 1);
  put('arcade', 12, 1);

  // ---- left wall: garden windows and more posters
  put('arched_window', 0, 2, 1);
  put('framed_posters', 0, 8, 1);
  put('arched_window', 0, 14, 1);
  put('arched_window', 0, 19, 1);
  put('arched_window', 0, 24, 1);

  // ---- grand carousel ringed with edison lamps
  put('carousel', 3, 4);
  put('bulb_tree', 2, 3);
  put('bulb_tree', 6, 3);
  put('bulb_tree', 2, 7);
  put('bulb_tree', 6, 7);

  // ---- promenades: a boulevard across the hall and an avenue down to the lounges
  for (let x = 1; x < S; x++) tryPut('queue_path', x, 11);
  for (let y = 12; y < S; y++) tryPut('queue_path', 13, y);

  // ---- snack corner on the left: bar with stools, popcorn and cotton candy carts
  put('snack_bar', 1, 13, 1);
  put('stool', 2, 13, 1);
  put('stool', 2, 14, 1);
  put('popcorn_cart', 3, 12);
  put('candy_cart', 3, 16);

  // ---- dancing fountain plaza with benches facing the water
  put('dancing_fountain', 8, 14);
  put('park_bench', 8, 12, 0);
  put('park_bench', 9, 18, 2);
  put('park_bench', 6, 14, 3);
  put('park_bench', 12, 15, 1);
  put('park_lamp', 7, 13);
  put('park_lamp', 11, 13);
  put('park_lamp', 7, 17);
  put('park_lamp', 11, 17);
  put('balloon_cart', 15, 13);

  // ---- star swings
  put('swing_ride', 21, 15);
  put('park_lamp', 20, 14);
  put('park_lamp', 24, 14);
  put('park_lamp', 20, 18);
  put('park_lamp', 24, 18);

  // ---- teacups
  put('teacup_ride', 16, 20);
  put('teacup_ride', 19, 23);
  put('teacup_ride', 22, 20);
  tryPut('flower_basket', 18, 20);
  tryPut('flower_basket', 21, 23);
  tryPut('flower_basket', 24, 22);

  // ---- rattan lounges (front left): sofa, walnut table with tea, poufs on a jute rug
  const lounge = (ox: number, oy: number) => {
    put('woven_rug', ox + 1, oy + 1);
    put('rattan_sofa', ox + 1, oy, 0);
    put('coffee_table', ox + 1, oy + 1);
    put('rattan_pouf', ox + 1, oy + 2, 2);
    put('rattan_pouf', ox + 2, oy + 2, 2);
    tryPut('bulb_tree', ox, oy);
    tryPut('potted_fern', ox + 3, oy);
    tryPut('flower_basket', ox, oy + 2);
  };
  lounge(1, 19);
  lounge(6, 19);
  lounge(1, 23);
  lounge(6, 23);

  // ---- ticket booth and benches by the front
  put('ticket_booth', 24, 25);
  tryPut('potted_fern', 23, 25);
  tryPut('potted_fern', 26, 25);
  tryPut('park_bench', 16, 26, 2);
  tryPut('park_bench', 19, 26, 2);
  tryPut('bulb_tree', 15, 25);
  tryPut('bulb_tree', 21, 25);
  tryPut('potted_fern', 27, 1);
  tryPut('potted_fern', 27, 9);

  // ---- any pocket of floor the coaster fenced off from the plaza gets planted instead of left dead
  const grid = buildGrid(S, out, null);
  const seen = new Set<string>();
  const c = Math.floor(S / 2);
  const q: Array<[number, number]> = grid.walkable[c][c] ? [[c, c]] : [];
  for (const [x, y] of q) seen.add(`${x},${y}`);
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.walkable[ny]?.[nx] || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (grid.walkable[y][x] && !seen.has(`${x},${y}`)) tryPut('potted_fern', x, y);
  return out;
}

export const WONDER_CRITTERS: BotRoute[] = [
  {
    id: 'mascot',
    kind: 'mascot',
    speed: 0.8,
    stops: [
      { x: 2, y: 11, dwell: 3200, say: 'welcome to Wonder Dome!' },
      { x: 13, y: 11, dwell: 1800 },
      { x: 13, y: 22, dwell: 3400, say: 'the coaster boards up north ✦' },
      { x: 13, y: 11, dwell: 1400, say: 'wave hi!' },
    ],
  },
];
