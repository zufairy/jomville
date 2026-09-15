import { describe, expect, it } from 'vitest';
import { COOK_PER_ING, K_DT, POT_MAX, SERVE_BASE } from './constants';
import { createKitchen, step } from './sim';
import { Dish, KitchenEvent, KitchenInput, KitchenState } from './types';

/**
 * A whole order through the real sim, one chef, no shortcuts inside the sim:
 * the chef is only placed beside each station (walking is covered elsewhere),
 * every action is a grab / use input through step().
 */
function kitchenWithOrder(dish: Dish) {
  const s = createKitchen('diner', 1, ['a'], 600);
  s.nextOrderIn = 1e9; // no random orders
  s.orders.push({ id: ++s.orderSeq, dish, left: 60, total: 60 });
  s.ordersV = ++s.rev;
  let seq = 0;
  const events: KitchenEvent[] = [];
  const tick = (inp: Partial<KitchenInput> = {}) => events.push(...step(s, { a: { seq: ++seq, mx: 0, my: 0, grab: false, use: false, dash: false, ...inp } }));
  /** stand on tile (x, y) facing (fx, fy) and press grab once */
  const grabAt = (x: number, y: number, fx: number, fy: number) => {
    Object.assign(s.chefs.a, { x: x + 0.5, y: y + 0.5, fx, fy });
    tick({ grab: true });
  };
  const chop = () => {
    for (let t = 0; t < Math.ceil(2 / K_DT) + 2; t++) tick({ use: true });
  };
  return { s, events, tick, grabAt, chop };
}

const board = (k: ReturnType<typeof kitchenWithOrder>, crateX: number) => {
  k.grabAt(crateX, 1, 0, -1); // crate on row 0
  expect(k.s.chefs.a.held).toMatchObject({ kind: 'ing', chopped: false });
  k.grabAt(1, 1, -1, 0); // board (0,1)
  expect(k.s.chefs.a.held).toBeNull();
  k.chop();
  k.grabAt(1, 1, -1, 0);
  expect(k.s.chefs.a.held).toMatchObject({ kind: 'ing', chopped: true });
};

const served = (s: KitchenState, events: KitchenEvent[], dish: Dish) => {
  expect(events.filter((e) => e.type === 'served')).toEqual([expect.objectContaining({ type: 'served', chef: 'a', dish })]);
  expect(events.some((e) => e.type === 'rejected')).toBe(false);
  expect(s.score).toBeGreaterThanOrEqual(SERVE_BASE);
  expect(s.served).toBe(1);
  expect(s.orders).toEqual([]);
  expect(s.chefs.a.held).toBeNull();
  expect(s.returns).toHaveLength(1);
};

describe('a full order to the serving window', () => {
  it('salad: lettuce -> chop -> counter -> plate -> scoop -> serve', () => {
    const k = kitchenWithOrder('salad');
    board(k, 2); // lettuce crate (2,0)
    k.grabAt(9, 1, 0, -1); // put on counter (9,0)
    k.grabAt(10, 1, 0, -1); // plate stack (10,0)
    expect(k.s.chefs.a.held).toMatchObject({ kind: 'plate', parts: [] });
    k.grabAt(9, 1, 0, -1); // scoop the lettuce
    expect(k.s.chefs.a.held).toMatchObject({ kind: 'plate', parts: ['lettuce'] });
    const before = k.s.score;
    k.grabAt(7, 1, 0, -1); // window (7,0)
    expect(before).toBe(0);
    served(k.s, k.events, 'salad');
  });

  it('tomato soup: three chopped tomatoes -> pot -> cook -> plate -> serve', () => {
    const k = kitchenWithOrder('soup_tomato');
    for (let i = 0; i < POT_MAX; i++) {
      board(k, 1); // tomato crate (1,0)
      k.grabAt(12, 1, 1, 0); // stove (13,1)
      expect(k.s.chefs.a.held).toBeNull();
    }
    const stove = k.s.stations.find((st) => st.x === 13 && st.y === 1)!;
    expect(stove.item).toMatchObject({ kind: 'pot', contents: ['tomato', 'tomato', 'tomato'] });
    for (let t = 0; t < Math.ceil((COOK_PER_ING * POT_MAX) / K_DT) + 2; t++) k.tick();
    k.grabAt(10, 1, 0, -1); // plate
    k.grabAt(12, 1, 1, 0); // pour
    expect(k.s.chefs.a.held).toMatchObject({ kind: 'plate', soup: 'tomato' });
    k.grabAt(7, 1, 0, -1);
    served(k.s, k.events, 'soup_tomato');
  });

  it('the wrong dish is rejected and keeps the order and the plate', () => {
    const k = kitchenWithOrder('soup_onion');
    board(k, 2);
    k.grabAt(9, 1, 0, -1);
    k.grabAt(10, 1, 0, -1);
    k.grabAt(9, 1, 0, -1);
    k.grabAt(7, 1, 0, -1);
    expect(k.events.filter((e) => e.type === 'rejected')).toHaveLength(1);
    expect(k.s.orders).toHaveLength(1);
    expect(k.s.chefs.a.held).toMatchObject({ kind: 'plate', parts: ['lettuce'] });
  });
});
