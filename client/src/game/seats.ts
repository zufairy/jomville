/**
 * How someone sits on each seat kind, measured from the seat painters:
 * `z` is the seat surface in px above the floor (where the hips go), `legs`
 * whether bent legs show (hidden in water or deep cushions), `back` whether a
 * backrest stands behind the body.
 */
export interface SeatPose {
  z: number;
  legs: boolean;
  back: boolean;
}

const POSES: Record<string, Partial<SeatPose>> = {
  chair: { z: 14 },
  stool: { z: 16, back: false },
  armchair: { z: 16 },
  sofa: { z: 16 },
  bench: { z: 14 },
  bed: { z: 17 },
  hottub: { z: 6, legs: false, back: false },
  loveseat: { z: 15 },
  pod_bed: { z: 22 },
  egg_chair: { z: 14 },
  cabana: { z: 13 },
  sun_lounger: { z: 11 },
  hammock: { z: 24 },
  flamingo_pool: { z: 4, legs: false, back: false },
  canopy_bed: { z: 20 },
  heart_chair: { z: 12 },
  cloud_sofa: { z: 15 },
  swing_chair: { z: 17 },
  rattan_sofa: { z: 17 },
  rattan_pouf: { z: 17, back: false },
  park_bench: { z: 16 },
  game_chair: { z: 17 },
  bean_bag: { z: 10, back: false },
  trade_sofa: { z: 23 },
  throne: { z: 21 },
};

export function seatPose(kind: string): SeatPose {
  const p = POSES[kind] ?? {};
  return { z: p.z ?? 14, legs: p.legs ?? true, back: p.back ?? true };
}

/** Riders sit inside their horse, cup or car: hips just above the vehicle floor, legs tucked in. */
export const RIDE_SEAT_Z = 4;
