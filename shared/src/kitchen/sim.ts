import { FIRST_ORDER, K_DT, ROUND_TIME } from './constants';
import { levelDef, parseLevel } from './levels';
import { starsFor, tickOrders } from './orders';
import { moveChef, separateChefs } from './physics';
import { interact, tickChop, tickStations } from './stations';
import { KitchenEvent, KitchenInput, KitchenState } from './types';

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

export const IDLE_INPUT: KitchenInput = { seq: 0, mx: 0, my: 0, grab: false, use: false, dash: false };

/** One fixed step. Chefs act in sorted id order so the same inputs always give the same state. */
export function step(s: KitchenState, inputs: Record<string, KitchenInput>, dt = K_DT): KitchenEvent[] {
  const events: KitchenEvent[] = [];
  if (s.over) return events;
  const def = levelDef(s.level);
  if (!def) throw new Error(`unknown level ${s.level}`);
  const ids = Object.keys(s.chefs).sort();
  for (const id of ids) {
    const c = s.chefs[id];
    const inp = inputs[id] ?? IDLE_INPUT;
    if (inp.seq > c.seq) c.seq = inp.seq;
    moveChef(c, inp, dt, s.solid, s.w, s.h);
  }
  separateChefs(ids.map((id) => s.chefs[id]), s.solid, s.w, s.h);
  for (const id of ids) {
    const c = s.chefs[id];
    const inp = inputs[id] ?? IDLE_INPUT;
    if (inp.grab) interact(s, c, events);
    tickChop(s, c, inp.use, dt, events);
  }
  tickStations(s, dt, events);
  tickOrders(s, def, dt, events);
  s.tick++;
  s.time = Math.max(0, s.roundTime - s.tick * dt);
  if (s.time <= 1e-6) {
    s.time = 0;
    s.over = true;
    events.push({ type: 'end', score: s.score, stars: starsFor(s.score, def), served: s.served, failed: s.failed });
  }
  return events;
}
