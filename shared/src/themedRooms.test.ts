import { describe, expect, it } from 'vitest';
import { RoomMask, buildGrid, Placement } from './furniture';
import { BotRoute, botPose, routeLength } from './rocketLab';
import { BEACH_CRITTERS, SUNSET_COVE, sunsetCoveLayout, sunsetCoveMask } from './sunsetCove';
import { DREAM_CRITTERS, DREAM_SUITE, dreamSuiteLayout } from './dreamSuite';
import { WONDER_CRITTERS, WONDER_DOME, wonderDomeLayout } from './wonderDome';

const FLYERS = new Set(['gull', 'butterfly', 'drone']);

const rooms: Array<{ name: string; size: number; layout: Placement[]; mask: RoomMask; critters: BotRoute[] }> = [
  { name: SUNSET_COVE.name, size: SUNSET_COVE.size, layout: sunsetCoveLayout(), mask: sunsetCoveMask(), critters: BEACH_CRITTERS },
  { name: DREAM_SUITE.name, size: DREAM_SUITE.size, layout: dreamSuiteLayout(), mask: null, critters: DREAM_CRITTERS },
  { name: WONDER_DOME.name, size: WONDER_DOME.size, layout: wonderDomeLayout(), mask: null, critters: WONDER_CRITTERS },
];

for (const room of rooms) {
  describe(`${room.name} critters`, () => {
    const grid = buildGrid(room.size, room.layout, room.mask);
    for (const r of room.critters) {
      it(`${r.id} route is axis-aligned, in bounds, and walkers stay on free tiles`, () => {
        r.stops.forEach((a, i) => {
          const b = r.stops[(i + 1) % r.stops.length];
          expect(a.x === b.x || a.y === b.y, `${a.x},${a.y} -> ${b.x},${b.y}`).toBe(true);
          const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
          for (let k = 0; k <= steps; k++) {
            const x = a.x + Math.sign(b.x - a.x) * k;
            const y = a.y + Math.sign(b.y - a.y) * k;
            expect(x >= 0 && y >= 0 && x < room.size && y < room.size).toBe(true);
            if (!FLYERS.has(r.kind)) expect(grid.walkable[y][x], `${r.id} blocked at ${x},${y}`).toBe(true);
          }
        });
      });
      it(`${r.id} pose loops`, () => {
        const total = routeLength(r);
        expect(botPose(r, total)).toMatchObject({ x: r.stops[0].x, y: r.stops[0].y });
      });
    }
  });
}
