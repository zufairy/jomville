import { Placement } from './furniture';
import { WONDER_COASTER, carDistance, trackAt, trainHead } from './wonderDome';

/**
 * Rideable furniture. A player "rides" by sitting on the ride's footprint; the
 * server only knows they're seated. Vehicles and riders are posed from
 * wall-clock time, so every visitor sees the same horse carry the same person.
 *
 * All positions are continuous floor coords (tile i spans i..i+1) plus a lift
 * in px above the floor.
 */

export type RideKind = 'carousel' | 'swings' | 'teacup' | 'drop' | 'coaster';

const RIDES: Record<string, RideKind> = {
  carousel: 'carousel',
  swing_ride: 'swings',
  teacup_ride: 'teacup',
  drop_tower: 'drop',
  coaster_gate: 'coaster',
};

export function rideKind(defId: string): RideKind | null {
  return RIDES[defId] ?? null;
}

export interface RideVehicle {
  x: number;
  y: number;
  lift: number;
  /** unit heading on the floor plane */
  hx: number;
  hy: number;
  /** ride-specific phase: spin angle for carousel and cups, speed 0..1 for swings, height for the drop */
  spin: number;
  /** coaster pitch, px of rise per tile */
  slope: number;
}

export interface RiderPose {
  x: number;
  y: number;
  lift: number;
  /** avatar facing: 0 up, 1 right, 2 down, 3 left */
  dir: number;
  vehicle: number;
}

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const mod = (a: number, m: number) => ((a % m) + m) % m;

/** seat slot for each tile of a 3x3 ring ride (clockwise from the back corner); the hub rides slot 0 */
const RING3: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
];
const RING2: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export function facing(hx: number, hy: number): number {
  return Math.abs(hx) >= Math.abs(hy) ? (hx >= 0 ? 1 : 3) : hy >= 0 ? 2 : 0;
}

function slotOf(ring: Array<[number, number]>, dx: number, dy: number): number {
  const i = ring.findIndex(([x, y]) => x === dx && y === dy);
  return i < 0 ? 0 : i;
}

// ---- swings: rest, spin up, fly, spin down

const SWING = { rest: 5000, up: 3000, full: 10000, down: 4000, revMs: 3500 };
const SWING_CYCLE = SWING.rest + SWING.up + SWING.full + SWING.down;
/** time-integral of the speed curve over one whole cycle */
const SWING_AREA = SWING.up / 2 + SWING.full + SWING.down / 2;

export function swingSpeed(now: number): number {
  const t = mod(now, SWING_CYCLE);
  if (t < SWING.rest) return 0;
  if (t < SWING.rest + SWING.up) return (t - SWING.rest) / SWING.up;
  if (t < SWING.rest + SWING.up + SWING.full) return 1;
  return 1 - (t - SWING.rest - SWING.up - SWING.full) / SWING.down;
}

function swingAngle(now: number): number {
  const cycles = Math.floor(now / SWING_CYCLE);
  const t = mod(now, SWING_CYCLE);
  let area = 0;
  if (t > SWING.rest) {
    const a = Math.min(t - SWING.rest, SWING.up);
    area += (a * a) / (2 * SWING.up);
  }
  if (t > SWING.rest + SWING.up) area += Math.min(t - SWING.rest - SWING.up, SWING.full);
  if (t > SWING.rest + SWING.up + SWING.full) {
    const a = t - SWING.rest - SWING.up - SWING.full;
    area += a - (a * a) / (2 * SWING.down);
  }
  // keep the numbers small: whole cycles only matter modulo one revolution
  const carried = mod(cycles * mod(SWING_AREA, SWING.revMs), SWING.revMs);
  return (mod(carried + area, SWING.revMs) / SWING.revMs) * TAU;
}

// ---- drop tower: wait, climb, hang, fall, bounce

const DROP = { rest: 5000, climb: 7000, hang: 1500, fall: 800, settle: 1700, low: 10, high: 196, catch: 34 };
const DROP_CYCLE = DROP.rest + DROP.climb + DROP.hang + DROP.fall + DROP.settle;

export function dropHeight(now: number): number {
  let t = mod(now, DROP_CYCLE);
  if (t < DROP.rest) return DROP.low;
  t -= DROP.rest;
  if (t < DROP.climb) return DROP.low + (DROP.high - DROP.low) * (1 - Math.cos((Math.PI * t) / DROP.climb)) * 0.5;
  t -= DROP.climb;
  if (t < DROP.hang) return DROP.high + Math.sin(t / 30) * 1.2;
  t -= DROP.hang;
  if (t < DROP.fall) {
    const k = t / DROP.fall;
    return DROP.high - (DROP.high - DROP.catch) * k * k;
  }
  t -= DROP.fall;
  const k = t / DROP.settle;
  return DROP.low + (DROP.catch - DROP.low) * (1 - k) * Math.abs(Math.cos(k * Math.PI * 3));
}

function isStation(p: Placement) {
  return p.def === 'coaster_gate' && p.rot === 0 && p.x === WONDER_COASTER.gate.x && p.y === WONDER_COASTER.gate.y;
}

// ---- vehicles

export function rideVehicles(p: Placement, now: number): RideVehicle[] {
  const kind = rideKind(p.def);
  if (kind === 'carousel') {
    const cx = p.x + 1.5;
    const cy = p.y + 1.5;
    const phase = (mod(now, 16000) / 16000) * TAU;
    return RING3.map((_, i) => {
      const a = (i / 8) * TAU - phase;
      return {
        x: cx + Math.cos(a) * 1.08,
        y: cy + Math.sin(a) * 1.08,
        lift: 18 + 7 * Math.sin((mod(now, 2600) / 2600) * TAU + i * HALF_PI),
        hx: Math.sin(a),
        hy: -Math.cos(a),
        spin: a,
        slope: 0,
      };
    });
  }
  if (kind === 'swings') {
    const cx = p.x + 1.5;
    const cy = p.y + 1.5;
    const s = swingSpeed(now);
    const phase = swingAngle(now);
    return RING3.map((_, i) => {
      const a = (i / 8) * TAU + phase;
      const r = 0.95 + 0.8 * s;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, lift: 26 + 46 * s, hx: -Math.sin(a), hy: Math.cos(a), spin: s, slope: 0 };
    });
  }
  if (kind === 'teacup') {
    const table = (mod(now, 9000) / 9000) * TAU;
    const spin = (mod(now, 2800) / 2800) * TAU;
    return [
      {
        x: p.x + 1 + Math.cos(table) * 0.16,
        y: p.y + 1 + Math.sin(table) * 0.16,
        lift: 8,
        hx: Math.cos(spin),
        hy: Math.sin(spin),
        spin,
        slope: 0,
      },
    ];
  }
  if (kind === 'drop') {
    const z = dropHeight(now);
    return RING2.map((_, i) => {
      const a = (i / 4) * TAU - Math.PI * 0.75;
      const hx = Math.cos(a);
      const hy = Math.sin(a);
      return { x: p.x + 1 + hx * 0.66, y: p.y + 1 + hy * 0.66, lift: z, hx, hy, spin: z, slope: 0 };
    });
  }
  if (kind === 'coaster' && isStation(p)) {
    const track = WONDER_COASTER;
    const head = trainHead(track, now).d;
    const cars: RideVehicle[] = [];
    for (let i = 0; i < track.cars; i++) {
      const t = trackAt(track, carDistance(track, head, i));
      cars.push({ x: t.x, y: t.y, lift: t.z, hx: t.hx, hy: t.hy, spin: 0, slope: t.slope });
    }
    return cars;
  }
  return [];
}

/** Where someone seated on tile (tx, ty) of a ride is right now, or null if the item isn't moving them. */
export function riderPose(p: Placement, tx: number, ty: number, now: number): RiderPose | null {
  const kind = rideKind(p.def);
  if (!kind) return null;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const cars = rideVehicles(p, now);
  if (!cars.length) return null;
  if (kind === 'carousel' || kind === 'swings') {
    const slot = slotOf(RING3, dx, dy);
    const v = cars[slot];
    return { x: v.x, y: v.y, lift: v.lift + (kind === 'carousel' ? 14 : 2), dir: facing(v.hx, v.hy), vehicle: slot };
  }
  if (kind === 'teacup') {
    const cup = cars[0];
    const slot = slotOf(RING2, dx, dy);
    const a = cup.spin + (slot / 4) * TAU;
    const x = cup.x + Math.cos(a) * 0.26;
    const y = cup.y + Math.sin(a) * 0.26;
    return { x, y, lift: 12, dir: facing(cup.x - x, cup.y - y), vehicle: 0 };
  }
  if (kind === 'drop') {
    const slot = slotOf(RING2, dx, dy);
    const v = cars[slot];
    return { x: v.x, y: v.y, lift: v.lift + 4, dir: facing(v.hx, v.hy), vehicle: slot };
  }
  const slot = Math.max(0, Math.min(cars.length - 1, dx));
  const v = cars[slot];
  return { x: v.x, y: v.y, lift: v.lift + 10, dir: facing(v.hx, v.hy), vehicle: slot };
}
