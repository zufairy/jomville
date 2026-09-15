import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { Controls } from './controls';
import { planTap } from './tapControls';

/**
 * Tap-to-play end to end: the same Controls + TapPilot the phone uses produce every
 * input, and the shared sim (what the server runs) consumes them. One chef takes
 * a salad order from the lettuce crate to the serving window.
 */
function tapKitchen(dish: kitchen.Dish) {
  const s = kitchen.createKitchen('diner', 3, ['me'], 600);
  s.nextOrderIn = 1e9;
  s.orders.push({ id: ++s.orderSeq, dish, left: 60, total: 60 });
  s.ordersV = ++s.rev;
  const c = new Controls();
  const chef = s.chefs.me;
  c.context = { pose: () => chef, stations: () => s.stations, held: () => chef.held };
  const events: kitchen.KitchenEvent[] = [];
  const tick = () => events.push(...kitchen.step(s, { me: c.next() }));
  const run = (ticks: number) => {
    for (let t = 0; t < ticks; t++) tick();
  };
  /** tap a station tile: walk there and grab once */
  const tap = (x: number, y: number) => {
    const plan = planTap(s, chef, { x, y }, 'grab');
    expect(plan, `reach ${x},${y}`).not.toBeNull();
    c.pilot.start(plan!);
    for (let t = 0; t < 300 && c.pilot.active; t++) tick();
    expect(c.pilot.active, `arrived at ${x},${y}`).toBe(false);
    run(2);
  };
  /** press and hold a station tile until chopped */
  const hold = (x: number, y: number) => {
    c.pilot.start(planTap(s, chef, { x, y }, 'hold')!);
    c.pilot.holding = true;
    run(300);
    c.pilot.holding = false;
    run(2);
  };
  return { s, events, tap, hold, chef };
}

describe('tap controls serve a real dish through the sim', () => {
  it('salad from crate to window: score goes up and the order clears', () => {
    const k = tapKitchen('salad');
    k.tap(2, 0); // lettuce crate
    expect(k.chef.held).toMatchObject({ kind: 'ing', ing: 'lettuce' });
    k.tap(0, 1); // board: put down
    expect(k.chef.held).toBeNull();
    k.hold(0, 1); // chop
    expect(k.events.some((e) => e.type === 'chopped')).toBe(true);
    k.tap(0, 1); // pick the chopped lettuce up
    expect(k.chef.held).toMatchObject({ kind: 'ing', chopped: true });
    k.tap(9, 0); // counter
    k.tap(10, 0); // plates
    expect(k.chef.held).toMatchObject({ kind: 'plate' });
    k.tap(9, 0); // scoop
    expect(k.chef.held).toMatchObject({ kind: 'plate', parts: ['lettuce'] });
    k.tap(7, 0); // serving window
    expect(k.events.filter((e) => e.type === 'served')).toHaveLength(1);
    expect(k.events.some((e) => e.type === 'rejected')).toBe(false);
    expect(k.s.score).toBeGreaterThanOrEqual(kitchen.SERVE_BASE);
    expect(k.s.orders).toEqual([]);
    expect(k.chef.held).toBeNull();
  });
});
