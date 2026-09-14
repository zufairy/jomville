import { FIRST_ORDER, ROUND_TIME } from './constants';
import { levelDef, parseLevel } from './levels';
import { KitchenState } from './types';

export function createKitchen(levelId: string, seed: number, chefIds: string[] = [], roundTime = ROUND_TIME): KitchenState {
  const def = levelDef(levelId);
  if (!def) throw new Error(`unknown level ${levelId}`);
  const lv = parseLevel(def);
  const s: KitchenState = {
    level: def.id,
    w: lv.w,
    h: lv.h,
    solid: lv.solid,
    stations: lv.stations,
    spawns: lv.spawns,
    chefs: {},
    floor: [],
    orders: [],
    returns: [],
    roundTime,
    time: roundTime,
    tick: 0,
    nextOrderIn: FIRST_ORDER,
    orderSeq: 0,
    floorSeq: 0,
    score: 0,
    streak: 0,
    served: 0,
    failed: 0,
    rng: seed | 0,
    over: false,
    rev: 1,
    ordersV: 1,
    floorV: 1,
  };
  for (const id of chefIds) addChef(s, id);
  return s;
}

/** Chefs spawn on the first spawn tile nobody is standing on. */
export function addChef(s: KitchenState, id: string) {
  if (s.chefs[id]) return;
  const others = Object.values(s.chefs);
  const sp = s.spawns.find((p) => !others.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 0.5)) ?? s.spawns[0];
  s.chefs[id] = { id, x: sp.x, y: sp.y, fx: 0, fy: 1, held: null, dash: 0, dashCd: 0, seq: 0, chopping: false };
}

export function removeChef(s: KitchenState, id: string) {
  const c = s.chefs[id];
  if (!c) return;
  if (c.held) {
    s.floor.push({ id: ++s.floorSeq, x: c.x, y: c.y, item: c.held });
    s.floorV = ++s.rev;
  }
  delete s.chefs[id];
}
