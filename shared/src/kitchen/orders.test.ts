import { describe, expect, it } from 'vitest';
import { EXPIRE_PENALTY, FIRST_ORDER, MAX_ORDERS, ORDER_EVERY, ORDER_TIME, SERVE_BASE } from './constants';
import { LEVELS } from './levels';
import { serveDish, starsFor, tickOrders } from './orders';
import { addChef, createKitchen, removeChef } from './sim';
import { KitchenEvent } from './types';

const def = LEVELS.diner;

describe('kitchen state', () => {
  it('spawns chefs on distinct spawn tiles and drops held items when one leaves', () => {
    const s = createKitchen('diner', 1, ['a', 'b']);
    expect(s.chefs.a).toMatchObject({ x: s.spawns[0].x, y: s.spawns[0].y, held: null });
    expect([s.chefs.b.x, s.chefs.b.y]).toEqual([s.spawns[1].x, s.spawns[1].y]);
    addChef(s, 'a'); // no-op
    expect(Object.keys(s.chefs)).toEqual(['a', 'b']);
    s.chefs.b.held = { kind: 'ing', ing: 'onion', chopped: false };
    removeChef(s, 'b');
    expect(s.chefs.b).toBeUndefined();
    expect(s.floor).toHaveLength(1);
    expect(() => createKitchen('nope', 1)).toThrow(/unknown level/);
  });
});

describe('orders', () => {
  it('first order after FIRST_ORDER, then every ORDER_EVERY scaled by crew size', () => {
    const s = createKitchen('diner', 3, ['a']);
    const ev: KitchenEvent[] = [];
    const run = (sec: number) => {
      for (let i = 0; i < Math.round(sec * 10); i++) tickOrders(s, def, 0.1, ev);
    };
    run(FIRST_ORDER - 0.1);
    expect(s.orders).toHaveLength(0);
    run(0.1);
    expect(s.orders).toHaveLength(1);
    expect(def.menu).toContain(s.orders[0].dish);
    run(ORDER_EVERY * 1.6 - 0.1);
    expect(s.orders).toHaveLength(1);
    run(0.1);
    expect(s.orders).toHaveLength(2);

    const full = createKitchen('diner', 3, ['a', 'b', 'c', 'd']);
    full.orders = Array.from({ length: MAX_ORDERS }, (_, i) => ({ id: i + 1, dish: 'salad' as const, left: 100, total: 100 }));
    full.nextOrderIn = 0.05;
    tickOrders(full, def, 0.1, ev);
    expect(full.orders).toHaveLength(MAX_ORDERS);
    expect(full.nextOrderIn).toBeCloseTo(ORDER_EVERY - 0.05, 6);
  });

  it('expired orders cost points (floored at 0) and break the streak', () => {
    const s = createKitchen('diner', 1, ['a']);
    s.score = 25;
    s.streak = 3;
    s.nextOrderIn = 99;
    s.orders = [{ id: 1, dish: 'salad', left: 0.05, total: ORDER_TIME }];
    const ev: KitchenEvent[] = [];
    tickOrders(s, def, 0.1, ev);
    expect(s.orders).toHaveLength(0);
    expect([s.score, s.streak, s.failed]).toEqual([25 - EXPIRE_PENALTY, 0, 1]);
    expect(ev).toEqual([{ type: 'expired', dish: 'salad' }]);
    s.score = 3;
    s.orders = [{ id: 2, dish: 'salad', left: 0.01, total: ORDER_TIME }];
    tickOrders(s, def, 0.1, ev);
    expect(s.score).toBe(0);
  });

  it('serving pays base + tip, oldest-first builds the streak, wrong dishes are rejected', () => {
    const s = createKitchen('diner', 1, ['a']);
    s.orders = [
      { id: 1, dish: 'soup_tomato', left: 60, total: 60 },
      { id: 2, dish: 'salad', left: 30, total: 60 },
    ];
    const ev: KitchenEvent[] = [];
    expect(serveDish(s, 'a', 'salad', ev)).toBe(true); // not the oldest: streak 1, tip 4
    expect(s.score).toBe(SERVE_BASE + 4);
    expect(serveDish(s, 'a', 'soup_tomato', ev)).toBe(true); // now the oldest: streak 2, tip 8 x 2
    expect(s.score).toBe(SERVE_BASE + 4 + SERVE_BASE + 16);
    expect(s.returns).toHaveLength(2);
    expect(serveDish(s, 'a', 'soup_onion', ev)).toBe(false);
    expect(ev.map((e) => e.type)).toEqual(['served', 'served', 'rejected']);
  });

  it('stars follow the level thresholds', () => {
    expect([59, 60, 159, 160, 280].map((n) => starsFor(n, def))).toEqual([0, 1, 1, 2, 3]);
  });
});
