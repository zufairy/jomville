import { describe, expect, it } from 'vitest';
import { CASINO, casinoLayout } from './casino';
import { buildGrid } from './furniture';
import { InteractionKind, inReach } from './interactions';
import { SYSTEM_ROOMS } from './systemRooms';

const KIND: Record<string, InteractionKind> = { dicemaster: 'dice6', holodice: 'dice100', wheel_fortune: 'wheel' };

describe('casino room', () => {
  const layout = casinoLayout();
  const grid = buildGrid(CASINO.size, layout, null);

  it('is registered as a system room', () => {
    expect(SYSTEM_ROOMS.some((r) => r.slug === 'casino')).toBe(true);
  });

  it('has 15 dicemasters, 2 holodice, 1 wheel, each usable from a walkable tile', () => {
    const count = (def: string) => layout.filter((p) => p.def === def).length;
    expect(count('dicemaster')).toBe(15);
    expect(count('holodice')).toBe(2);
    expect(count('wheel_fortune')).toBe(1);
    for (const p of layout) {
      const kind = KIND[p.def];
      if (!kind) continue;
      let ok = false;
      for (let y = 0; y < CASINO.size && !ok; y++)
        for (let x = 0; x < CASINO.size && !ok; x++) ok = !!grid.walkable[y][x] && inReach(kind, x, y, p);
      expect(ok, `${p.def}@${p.x},${p.y}`).toBe(true);
      expect(p.state).toBe('0');
    }
  });

  it('each dealer chair reaches exactly its three dice', () => {
    const chairs = layout.filter((p) => p.def === 'game_chair');
    expect(chairs).toHaveLength(5);
    for (const c of chairs) {
      const reach = layout.filter((p) => p.def === 'dicemaster' && inReach('dice6', c.x, c.y, p));
      expect(reach.length, `chair@${c.x},${c.y}`).toBe(3);
    }
  });
});
