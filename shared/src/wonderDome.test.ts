import { describe, expect, it } from 'vitest';
import { furnitureDef } from './furniture';
import { TRACK_CLEARANCE, WONDER_COASTER, carDistance, coasterTiles, trackAt, trainHead, wonderDomeLayout } from './wonderDome';
import { riderPose, rideVehicles } from './rides';

const track = WONDER_COASTER;

describe('wonder dome coaster track', () => {
  it('is one continuous closed loop', () => {
    const pts = track.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      expect(Math.hypot(b.x - a.x, b.y - a.y), `gap after point ${i}`).toBeLessThan(0.15);
    }
    expect(pts[0]).toMatchObject({ x: 22.5, y: 9.5 });
  });

  it('stays inside the room and above the floor', () => {
    for (const p of track.points) {
      expect(p.x > 0 && p.y > 0 && p.x < 28 && p.y < 28).toBe(true);
      expect(p.z).toBeGreaterThanOrEqual(10);
      expect(p.z).toBeLessThanOrEqual(170);
    }
  });

  it('times only move forward and a ride takes a satisfying while', () => {
    for (let i = 1; i < track.times.length; i++) expect(track.times[i]).toBeGreaterThan(track.times[i - 1]);
    expect(track.rideMs).toBeGreaterThan(10000);
    expect(track.rideMs).toBeLessThan(40000);
  });

  it('parks each car over its gate tile while boarding', () => {
    const head = trainHead(track, 1000);
    expect(head.moving).toBe(false);
    for (let i = 0; i < track.cars; i++) {
      const p = trackAt(track, carDistance(track, head.d, i));
      expect(Math.floor(p.x)).toBe(track.gate.x + i);
      expect(Math.floor(p.y)).toBe(track.gate.y - 1);
    }
  });

  it('leaves the station, and comes back to it', () => {
    const start = trainHead(track, track.dwellMs + 10);
    expect(start.moving).toBe(true);
    const end = trainHead(track, track.dwellMs + track.rideMs - 1);
    expect(end.d).toBeGreaterThan(track.length - 0.1);
    expect(trainHead(track, track.dwellMs + track.rideMs + 5).moving).toBe(false);
  });

  it('puts a trestle footing under every low stretch and nowhere else', () => {
    const layout = wonderDomeLayout();
    const beds = new Set(layout.filter((p) => p.def === 'track_bed').map((p) => `${p.x},${p.y}`));
    for (const [key, z] of coasterTiles(track)) expect(beds.has(key), key).toBe(z < TRACK_CLEARANCE);
  });
});

describe('wonder dome rides', () => {
  const layout = wonderDomeLayout();
  const rides = layout.filter((p) => ['carousel', 'swing_ride', 'teacup_ride', 'drop_tower', 'coaster_gate'].includes(p.def));

  it('has every ride kind', () => {
    expect(new Set(rides.map((r) => r.def))).toEqual(new Set(['carousel', 'swing_ride', 'teacup_ride', 'drop_tower', 'coaster_gate']));
  });

  for (const now of [0, 4321, 12000, 17777, 30000, 123456789]) {
    it(`poses every seat of every ride at t=${now}`, () => {
      for (const r of rides) {
        const d = furnitureDef(r.def)!;
        expect(rideVehicles(r, now).length).toBeGreaterThan(0);
        for (let dy = 0; dy < d.h; dy++)
          for (let dx = 0; dx < d.w; dx++) {
            const pose = riderPose(r, r.x + dx, r.y + dy, now);
            expect(pose, `${r.def} ${dx},${dy}`).not.toBeNull();
            for (const v of [pose!.x, pose!.y, pose!.lift]) expect(Number.isFinite(v)).toBe(true);
            expect(pose!.lift).toBeGreaterThan(0);
          }
      }
    });
  }

  it('rider moves with their vehicle', () => {
    const carousel = rides.find((r) => r.def === 'carousel')!;
    const pose = riderPose(carousel, carousel.x + 2, carousel.y, 5000)!;
    const horse = rideVehicles(carousel, 5000)[pose.vehicle];
    expect(pose.x).toBeCloseTo(horse.x);
    expect(pose.y).toBeCloseTo(horse.y);
  });
});
