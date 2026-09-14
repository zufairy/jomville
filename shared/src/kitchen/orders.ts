import { CREW_MAX, CREW_SCALE, EXPIRE_PENALTY, MAX_ORDERS, ORDER_EVERY, ORDER_TIME, PLATE_RETURN, SERVE_BASE, STREAK_MAX, TIP_MAX } from './constants';
import { nextRandom } from './rng';
import { Dish, KitchenEvent, KitchenState, LevelDef } from './types';

const EPS = 1e-6;

export function crewScale(n: number): number {
  return CREW_SCALE[Math.min(CREW_MAX, Math.max(1, n))];
}

export function spawnOrder(s: KitchenState, def: LevelDef) {
  const [r, next] = nextRandom(s.rng);
  s.rng = next;
  const dish = def.menu[Math.floor(r * def.menu.length)];
  s.orders.push({ id: ++s.orderSeq, dish, left: ORDER_TIME, total: ORDER_TIME });
  s.ordersV = ++s.rev;
}

/** Counts order timers down (clients extrapolate, so ticking alone doesn't mark orders changed). */
export function tickOrders(s: KitchenState, def: LevelDef, dt: number, events: KitchenEvent[]) {
  let expired = false;
  for (const o of s.orders) o.left -= dt;
  s.orders = s.orders.filter((o) => {
    if (o.left > EPS) return true;
    s.score = Math.max(0, s.score - EXPIRE_PENALTY);
    s.failed++;
    expired = true;
    events.push({ type: 'expired', dish: o.dish });
    return false;
  });
  if (expired) {
    s.streak = 0;
    s.ordersV = ++s.rev;
  }
  s.nextOrderIn -= dt;
  if (s.nextOrderIn <= EPS) {
    if (s.orders.length < MAX_ORDERS) spawnOrder(s, def);
    s.nextOrderIn += ORDER_EVERY * crewScale(Object.keys(s.chefs).length);
  }
}

export function serveDish(s: KitchenState, chef: string, dish: Dish, events: KitchenEvent[]): boolean {
  const idx = s.orders.findIndex((o) => o.dish === dish);
  if (idx < 0) {
    events.push({ type: 'rejected', chef });
    return false;
  }
  const o = s.orders[idx];
  s.streak = idx === 0 ? Math.min(STREAK_MAX, s.streak + 1) : 1;
  const points = SERVE_BASE + Math.round((TIP_MAX * Math.max(0, o.left)) / o.total) * s.streak;
  s.score += points;
  s.served++;
  s.orders.splice(idx, 1);
  s.returns.push(PLATE_RETURN);
  s.ordersV = ++s.rev;
  events.push({ type: 'served', chef, dish, points, streak: s.streak });
  return true;
}

export function starsFor(score: number, def: LevelDef): number {
  return def.stars.filter((t) => score >= t).length;
}
