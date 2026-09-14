import { describe, expect, it } from 'vitest';
import { CASINO, TRADING_BOOTHS, TRADING_DIVIDERS, casinoLayout } from './casino';
import { buildGrid, furnitureDef } from './furniture';
import { InteractionKind, inReach } from './interactions';
import { SYSTEM_ROOMS } from './systemRooms';

const KIND: Record<string, InteractionKind> = { dicemaster: 'dice6', holodice: 'dice100', wheel_fortune: 'wheel' };

describe('trading room', () => {
  const layout = casinoLayout();
  const grid = buildGrid(CASINO.size, layout, null);
  const count = (def: string) => layout.filter((p) => p.def === def).length;

  it('is registered as a system room under the old casino slug', () => {
    const r = SYSTEM_ROOMS.find((r) => r.slug === 'casino');
    expect(r?.name).toBe('Trading Room');
    expect(r?.size).toBe(24);
    expect(r?.theme).toBe('gameroom');
  });

  it('has 18 dicemasters, 3 holodice, 1 wheel, each usable from a walkable tile', () => {
    expect(count('dicemaster')).toBe(18);
    expect(count('holodice')).toBe(3);
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
    expect(chairs).toHaveLength(TRADING_BOOTHS.length);
    for (const c of chairs) {
      const reach = layout.filter((p) => p.def === 'dicemaster' && inReach('dice6', c.x, c.y, p));
      expect(reach.length, `chair@${c.x},${c.y}`).toBe(3);
    }
  });

  it('every zone divider is a real barrier with at least one walkable gap', () => {
    for (const d of TRADING_DIVIDERS) {
      const walk = d.tiles.filter(([x, y]) => grid.walkable[y][x]);
      expect(walk.length, `${d.name} gap`).toBeGreaterThan(0);
      expect(walk.length, `${d.name} barrier`).toBeLessThan(d.tiles.length);
      for (const [x, y] of d.gaps) expect(grid.walkable[y][x], `${d.name} gap ${x},${y}`).toBe(true);
    }
  });

  it('shows off the rare gallery and the new trading furni', () => {
    expect(count('egg_stack_3')).toBe(3);
    expect(count('throne_gold')).toBe(1);
    expect(count('dragon_egg')).toBeGreaterThanOrEqual(2);
    expect(count('trading_banner')).toBeGreaterThanOrEqual(1);
    for (const id of ['egg_wall', 'gold_patch', 'leaf_hedge', 'palm_planter', 'gold_rail', 'trade_sofa']) expect(count(id), id).toBeGreaterThan(0);
    // system furni never carries an item row
    expect(layout.every((p) => !p.itemId && furnitureDef(p.def))).toBe(true);
  });
});
