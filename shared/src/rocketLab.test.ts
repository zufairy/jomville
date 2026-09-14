import { describe, expect, it } from 'vitest';
import { buildGrid } from './furniture';
import { LAB_BOTS, ROCKET_LAB, botPose, rocketLabLayout, routeLength } from './rocketLab';

describe('rocket lab robots', () => {
  const grid = buildGrid(ROCKET_LAB.size, rocketLabLayout(), null);

  for (const r of LAB_BOTS) {
    it(`${r.id} route is axis-aligned and never drives through furniture`, () => {
      r.stops.forEach((a, i) => {
        const b = r.stops[(i + 1) % r.stops.length];
        expect(a.x === b.x || a.y === b.y, `${a.x},${a.y} -> ${b.x},${b.y}`).toBe(true);
        const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        for (let k = 0; k <= steps; k++) {
          const x = a.x + Math.sign(b.x - a.x) * k;
          const y = a.y + Math.sign(b.y - a.y) * k;
          expect(grid.walkable[y][x], `${r.id} blocked at ${x},${y}`).toBe(true);
        }
      });
    });

    it(`${r.id} pose is continuous and loops`, () => {
      const total = routeLength(r);
      expect(botPose(r, 0)).toMatchObject({ x: r.stops[0].x, y: r.stops[0].y, moving: false });
      expect(botPose(r, total)).toMatchObject({ x: r.stops[0].x, y: r.stops[0].y });
      let prev = botPose(r, 0);
      for (let t = 50; t < total; t += 50) {
        const p = botPose(r, t);
        expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBeLessThanOrEqual(r.speed * 0.05 + 1e-6);
        prev = p;
      }
    });
  }
});
