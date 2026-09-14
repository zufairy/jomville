import { ChefSnap, KitchenSnap, KitchenState, StationSnap } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the server sends each snapshot. Chefs always; stations, orders and floor only when
 * they changed after `sinceRev` (the rev at the previous snapshot) or when `full`.
 */
export function makeSnap(s: KitchenState, sinceRev: number, full: boolean): KitchenSnap {
  const acks: Record<string, number> = {};
  const chefs: ChefSnap[] = [];
  for (const id of Object.keys(s.chefs).sort()) {
    const c = s.chefs[id];
    acks[id] = c.seq;
    chefs.push({ id, x: r2(c.x), y: r2(c.y), fx: r2(c.fx), fy: r2(c.fy), held: c.held, chop: c.chopping, dash: c.dash > 0 });
  }
  const snap: KitchenSnap = { tick: s.tick, time: r2(s.time), score: s.score, streak: s.streak, over: s.over, acks, chefs };
  const stations: StationSnap[] = [];
  s.stations.forEach((st, i) => {
    if (full || st.v > sinceRev) stations.push({ i, item: st.item, chop: r2(st.chop), count: st.count });
  });
  if (stations.length) snap.stations = stations;
  if (full || s.ordersV > sinceRev) snap.orders = s.orders.map((o) => ({ ...o, left: r2(o.left) }));
  if (full || s.floorV > sinceRev) snap.floor = s.floor.map((f) => ({ ...f, x: r2(f.x), y: r2(f.y) }));
  if (full) snap.full = true;
  return snap;
}
