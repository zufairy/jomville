import { describe, expect, it } from 'vitest';
import { KITCHEN_PADS, KITCHEN_WORLD, kitchenWorldLayout, padAt, padTiles } from './kitchenWorld';
import { SYSTEM_ROOMS } from './systemRooms';
import { ROOM_SLUG } from './constants';

describe('kitchen world', () => {
  it('is a system room with a valid slug', () => {
    expect(ROOM_SLUG.test(KITCHEN_WORLD.slug)).toBe(true);
    expect(SYSTEM_ROOMS.some((r) => r.slug === KITCHEN_WORLD.slug)).toBe(true);
  });

  it('maps every rug tile to its pad and nothing else', () => {
    KITCHEN_PADS.forEach((_, pad) => {
      for (const [x, y] of padTiles(pad)) expect(padAt(x, y)).toBe(pad);
    });
    expect(padAt(0, 0)).toBe(-1);
  });

  it('puts a walkable rug on every pad', () => {
    const layout = kitchenWorldLayout();
    for (const p of KITCHEN_PADS) expect(layout.find((l) => l.x === p.x && l.y === p.y)?.def).toBe('woven_rug');
  });
});
