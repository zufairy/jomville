import { describe, expect, it } from 'vitest';
import { SYSTEM_ROOMS } from './systemRooms';
import { MAX_FURNITURE_SYSTEM_ROOM, buildGrid, furnitureDef, maskAllows, validatePlacement } from './furniture';

for (const room of SYSTEM_ROOMS) {
  describe(`system room ${room.name}`, () => {
    const layout = room.layout();
    const mask = room.mask();

    it('builds without overlaps or unknown defs and fits the system cap', () => {
      // big public rooms carry lots of décor; small showcase rooms scale with floor area
      expect(layout.length).toBeGreaterThan(Math.min(100, (room.size * room.size) / 5));
      expect(layout.length).toBeLessThanOrEqual(MAX_FURNITURE_SYSTEM_ROOM);
      const ids = new Set(layout.map((p) => p.id));
      expect(ids.size).toBe(layout.length);
      for (const p of layout) {
        expect(furnitureDef(p.def), p.def).toBeDefined();
        expect(validatePlacement(p, room.size, layout.filter((o) => o !== p), mask)).toBeNull();
      }
    });

    it('every walkable tile is reachable from the spawn (room centre)', () => {
      const g = buildGrid(room.size, layout, mask);
      const c = Math.floor(room.size / 2);
      let start: [number, number] | null = null;
      outer: for (let r = 0; r < room.size; r++)
        for (let y = c - r; y <= c + r; y++)
          for (let x = c - r; x <= c + r; x++)
            if (g.walkable[y]?.[x]) {
              start = [x, y];
              break outer;
            }
      expect(start).not.toBeNull();
      const seen = new Set<string>([`${start![0]},${start![1]}`]);
      const q = [start!];
      while (q.length) {
        const [x, y] = q.shift()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!g.walkable[ny]?.[nx] || seen.has(`${nx},${ny}`)) continue;
          seen.add(`${nx},${ny}`);
          q.push([nx, ny]);
        }
      }
      let walkable = 0;
      let floor = 0;
      for (let y = 0; y < room.size; y++)
        for (let x = 0; x < room.size; x++) {
          if (maskAllows(mask, x, y)) floor++;
          if (g.walkable[y][x]) walkable++;
        }
      const unreachable: string[] = [];
      for (let y = 0; y < room.size; y++)
        for (let x = 0; x < room.size; x++) if (g.walkable[y][x] && !seen.has(`${x},${y}`)) unreachable.push(`${x},${y}`);
      expect(unreachable, 'unreachable tiles').toEqual([]);
      expect(walkable).toBeGreaterThan(floor * 0.55);
    });
  });
}
