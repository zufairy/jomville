import { kitchen } from '@dovey/shared';

export interface OrderView extends kitchen.Order {
  /** performance.now() when this order list arrived; left counts down from there */
  at: number;
}

export interface KitchenView {
  level: string;
  w: number;
  h: number;
  solid: boolean[];
  stations: kitchen.Station[];
  floor: kitchen.FloorItem[];
  orders: OrderView[];
  chefs: kitchen.ChefSnap[];
  acks: Record<string, number>;
  time: number;
  timeAt: number;
  score: number;
  streak: number;
  over: boolean;
  tick: number;
}

export function createView(levelId: string): KitchenView {
  const def = kitchen.levelDef(levelId);
  if (!def) throw new Error(`unknown level ${levelId}`);
  const lv = kitchen.parseLevel(def);
  return { level: def.id, w: lv.w, h: lv.h, solid: lv.solid, stations: lv.stations, floor: [], orders: [], chefs: [], acks: {}, time: 0, timeAt: 0, score: 0, streak: 0, over: false, tick: -1 };
}

/** false for a snapshot older than what the view already shows */
export function applySnap(v: KitchenView, snap: kitchen.KitchenSnap, at: number): boolean {
  if (snap.tick < v.tick) return false;
  v.tick = snap.tick;
  v.time = snap.time;
  v.timeAt = at;
  v.score = snap.score;
  v.streak = snap.streak;
  v.over = snap.over;
  v.chefs = snap.chefs;
  v.acks = snap.acks;
  for (const s of snap.stations ?? []) {
    const st = v.stations[s.i];
    if (!st) continue;
    st.item = s.item;
    st.chop = s.chop;
    st.count = s.count;
  }
  if (snap.orders) v.orders = snap.orders.map((o) => ({ ...o, at }));
  if (snap.floor) v.floor = snap.floor;
  return true;
}

export const orderLeft = (o: OrderView, now: number) => Math.max(0, o.left - (now - o.at) / 1000);

export const timeLeft = (v: KitchenView, now: number) => (v.over ? v.time : Math.max(0, v.time - (now - v.timeAt) / 1000));
