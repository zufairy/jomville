import { describe, expect, it } from 'vitest';
import { BURN_AFTER, CHEF_R, CHOP_TIME, COOK_PER_ING, K_DT, PLATE_RETURN, POT_MAX } from './constants';
import { IDLE_INPUT, createKitchen, step } from './sim';
import { KitchenEvent, KitchenInput, KitchenState, PotItem } from './types';

/** Stand chef `id` next to station (tx,ty) and face it: top row from y=1, left wall from x=1, right wall from x=12. */
function faceTile(s: KitchenState, id: string, tx: number, ty: number) {
  const c = s.chefs[id];
  if (ty === 0) Object.assign(c, { x: tx + 0.5, y: 1 + CHEF_R, fx: 0, fy: -1 });
  else if (tx === 0) Object.assign(c, { x: 1 + CHEF_R, y: ty + 0.5, fx: -1, fy: 0 });
  else Object.assign(c, { x: tx - CHEF_R, y: ty + 0.5, fx: 1, fy: 0 });
}
const press = (s: KitchenState, id: string, extra: Partial<KitchenInput> = {}) => step(s, { [id]: { ...IDLE_INPUT, grab: true, ...extra } });
const idle = (s: KitchenState, ticks: number) => {
  const ev: KitchenEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...step(s, {}));
  return ev;
};
const station = (s: KitchenState, x: number, y: number) => s.stations.find((t) => t.x === x && t.y === y)!;

function kitchen() {
  const s = createKitchen('diner', 9, ['a']);
  s.nextOrderIn = 1e9; // tests add orders by hand
  return s;
}

describe('stations', () => {
  it('crate gives a raw ingredient; board chops it while Use is held', () => {
    const s = kitchen();
    faceTile(s, 'a', 1, 0);
    press(s, 'a');
    expect(s.chefs.a.held).toEqual({ kind: 'ing', ing: 'tomato', chopped: false });
    faceTile(s, 'a', 0, 1);
    press(s, 'a');
    expect(station(s, 0, 1).item).toMatchObject({ ing: 'tomato', chopped: false });
    const ev: KitchenEvent[] = [];
    const ticks = Math.round(CHOP_TIME / K_DT);
    for (let i = 0; i < ticks - 1; i++) ev.push(...step(s, { a: { ...IDLE_INPUT, use: true } }));
    expect(s.chefs.a.chopping).toBe(true);
    expect(station(s, 0, 1).item).toMatchObject({ chopped: false });
    ev.push(...step(s, { a: { ...IDLE_INPUT, use: true } }));
    expect(station(s, 0, 1).item).toMatchObject({ chopped: true });
    expect(ev).toContainEqual({ type: 'chopped', chef: 'a' });
    press(s, 'a');
    expect(s.chefs.a.held).toMatchObject({ ing: 'tomato', chopped: true });
    expect(station(s, 0, 1).item).toBeNull();
  });

  it('stove cooks a full pot, then burns it if left', () => {
    const s = kitchen();
    faceTile(s, 'a', 13, 1);
    for (let i = 0; i < POT_MAX; i++) {
      s.chefs.a.held = { kind: 'ing', ing: 'onion', chopped: true };
      press(s, 'a');
      expect(s.chefs.a.held).toBeNull();
    }
    const pot = () => station(s, 13, 1).item as PotItem;
    expect(pot().contents).toHaveLength(POT_MAX);
    idle(s, Math.round((COOK_PER_ING * POT_MAX) / K_DT));
    expect(pot().cook).toBeCloseTo(COOK_PER_ING * POT_MAX, 6);
    expect(pot().burnt).toBe(false);
    const ev = idle(s, Math.round(BURN_AFTER / K_DT) + 1);
    expect(pot().burnt).toBe(true);
    expect(ev).toContainEqual({ type: 'burnt', x: 13, y: 1 });
  });

  it('plate, pour, serve at the window, plate comes back at the return', () => {
    const s = kitchen();
    const stove = station(s, 13, 1);
    stove.item = { kind: 'pot', contents: ['tomato', 'tomato', 'tomato'], cook: COOK_PER_ING * POT_MAX, over: 0, burnt: false };
    s.orders = [{ id: 1, dish: 'soup_tomato', left: 60, total: 60 }];
    faceTile(s, 'a', 10, 0);
    press(s, 'a');
    expect(s.chefs.a.held).toEqual({ kind: 'plate', soup: null, parts: [] });
    expect(station(s, 10, 0).count).toBe(3);
    faceTile(s, 'a', 13, 1);
    press(s, 'a');
    expect(s.chefs.a.held).toMatchObject({ kind: 'plate', soup: 'tomato' });
    expect((stove.item as PotItem).contents).toEqual([]);
    faceTile(s, 'a', 7, 0);
    const ev = press(s, 'a');
    expect(ev.find((e) => e.type === 'served')).toMatchObject({ dish: 'soup_tomato' });
    expect(s.chefs.a.held).toBeNull();
    expect(s.score).toBeGreaterThan(0);
    idle(s, Math.round(PLATE_RETURN / K_DT) + 1);
    expect(station(s, 11, 0).count).toBe(1);
  });

  it('window rejects a dish nobody ordered and keeps the plate', () => {
    const s = kitchen();
    s.chefs.a.held = { kind: 'plate', soup: null, parts: ['lettuce'] };
    faceTile(s, 'a', 7, 0);
    expect(press(s, 'a')).toContainEqual({ type: 'rejected', chef: 'a' });
    expect(s.chefs.a.held).not.toBeNull();
  });

  it('counters hold one item and combine; bin empties; floor drop and pick up', () => {
    const s = kitchen();
    faceTile(s, 'a', 5, 0); // counter
    s.chefs.a.held = { kind: 'plate', soup: null, parts: [] };
    press(s, 'a');
    expect(station(s, 5, 0).item).toMatchObject({ kind: 'plate' });
    s.chefs.a.held = { kind: 'ing', ing: 'lettuce', chopped: true };
    press(s, 'a');
    expect(station(s, 5, 0).item).toMatchObject({ parts: ['lettuce'] });
    expect(s.chefs.a.held).toBeNull();

    s.chefs.a.held = { kind: 'ing', ing: 'onion', chopped: false };
    faceTile(s, 'a', 12, 0); // bin
    press(s, 'a');
    expect(s.chefs.a.held).toBeNull();

    Object.assign(s.chefs.a, { x: 6.5, y: 2.5, fx: 1, fy: 0 }); // open floor ahead
    s.chefs.a.held = { kind: 'ing', ing: 'mushroom', chopped: false };
    press(s, 'a');
    expect(s.floor).toHaveLength(1);
    press(s, 'a');
    expect(s.floor).toHaveLength(0);
    expect(s.chefs.a.held).toMatchObject({ ing: 'mushroom' });
  });

  it('the round ends once and stops stepping', () => {
    const s = createKitchen('diner', 1, ['a'], 1);
    const ev = idle(s, Math.round(1 / K_DT) + 5);
    expect(ev.filter((e) => e.type === 'end')).toHaveLength(1);
    expect(s.over).toBe(true);
    expect(s.time).toBe(0);
  });
});
