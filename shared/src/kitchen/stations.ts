import { BURN_AFTER, CHOP_TIME, COOK_PER_ING, FLOOR_PICK_RADIUS, POT_MAX, REACH } from './constants';
import { binItem, combine, emptyPlate, plateDish } from './items';
import { serveDish } from './orders';
import { isSolid } from './physics';
import { Chef, Item, KitchenEvent, KitchenState, Station, StationKind } from './types';

const EPS = 1e-6;

export function touch(s: KitchenState, st: Station) {
  st.v = ++s.rev;
}

export function stationAt(s: KitchenState, tx: number, ty: number): Station | undefined {
  return s.stations.find((st) => st.x === tx && st.y === ty);
}

export function facingPoint(c: Pick<Chef, 'x' | 'y' | 'fx' | 'fy'>): { x: number; y: number } {
  return { x: c.x + c.fx * REACH, y: c.y + c.fy * REACH };
}

/** Which items a holding station accepts; stations missing here don't hold items. */
const HOLDS: Partial<Record<StationKind, (i: Item) => boolean>> = {
  counter: () => true,
  board: (i) => i.kind === 'ing',
  stove: (i) => i.kind === 'pot',
};

/** Grab / put down: acts on the station in front of the chef, else on the floor there. */
export function interact(s: KitchenState, c: Chef, events: KitchenEvent[]) {
  const p = facingPoint(c);
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  const st = stationAt(s, tx, ty);
  if (st) return useStation(s, c, st, events);
  if (isSolid(s.solid, s.w, s.h, tx, ty)) return;
  useFloor(s, c, p.x, p.y);
}

function useStation(s: KitchenState, c: Chef, st: Station, events: KitchenEvent[]) {
  const held = c.held;
  switch (st.kind) {
    case 'crate':
      if (!held && st.ing) c.held = { kind: 'ing', ing: st.ing, chopped: false };
      return;
    case 'plates':
    case 'return':
      if (!held && st.count > 0) {
        st.count--;
        c.held = emptyPlate();
        touch(s, st);
      }
      return;
    case 'bin':
      if (held) c.held = binItem(held);
      return;
    case 'window': {
      if (held?.kind !== 'plate') return;
      const dish = plateDish(held);
      if (!dish) events.push({ type: 'rejected', chef: c.id });
      else if (serveDish(s, c.id, dish, events)) c.held = null;
      return;
    }
  }
  const holds = HOLDS[st.kind];
  if (!holds) return;
  if (!held) {
    if (!st.item) return;
    c.held = st.item;
    st.item = null;
    st.chop = 0;
    touch(s, st);
    return;
  }
  if (!st.item) {
    if (!holds(held)) return;
    st.item = held;
    c.held = null;
    st.chop = 0;
    touch(s, st);
    return;
  }
  const r = combine(held, st.item);
  if (!r || (r.target && !holds(r.target))) return;
  c.held = r.held;
  st.item = r.target;
  if (!st.item) st.chop = 0;
  touch(s, st);
}

function useFloor(s: KitchenState, c: Chef, x: number, y: number) {
  if (c.held) {
    s.floor.push({ id: ++s.floorSeq, x, y, item: c.held });
    c.held = null;
    s.floorV = ++s.rev;
    return;
  }
  let best = -1;
  let bestD = FLOOR_PICK_RADIUS * FLOOR_PICK_RADIUS;
  s.floor.forEach((f, i) => {
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) return;
  c.held = s.floor[best].item;
  s.floor.splice(best, 1);
  s.floorV = ++s.rev;
}

/** Holding Use with empty hands in front of a board with a raw ingredient chops it. */
export function tickChop(s: KitchenState, c: Chef, use: boolean, dt: number, events: KitchenEvent[]) {
  c.chopping = false;
  if (!use || c.held) return;
  const p = facingPoint(c);
  const st = stationAt(s, Math.floor(p.x), Math.floor(p.y));
  if (st?.kind !== 'board' || st.item?.kind !== 'ing' || st.item.chopped) return;
  c.chopping = true;
  st.chop += dt;
  if (st.chop >= CHOP_TIME - EPS) {
    st.item = { ...st.item, chopped: true };
    st.chop = 0;
    events.push({ type: 'chopped', chef: c.id });
  }
  touch(s, st);
}

/** Pots on stoves cook (and burn); served plates come back to the return. */
export function tickStations(s: KitchenState, dt: number, events: KitchenEvent[]) {
  for (const st of s.stations) {
    if (st.kind !== 'stove' || st.item?.kind !== 'pot') continue;
    const pot = st.item;
    if (!pot.contents.length || pot.burnt) continue;
    const cap = COOK_PER_ING * pot.contents.length;
    if (pot.cook < cap) pot.cook = Math.min(cap, pot.cook + dt);
    else if (pot.contents.length === POT_MAX) {
      pot.over += dt;
      if (pot.over >= BURN_AFTER - EPS) {
        pot.burnt = true;
        events.push({ type: 'burnt', x: st.x, y: st.y });
      }
    } else continue;
    touch(s, st);
  }
  if (!s.returns.length) return;
  let back = 0;
  s.returns = s.returns
    .map((t) => t - dt)
    .filter((t) => {
      if (t > EPS) return true;
      back++;
      return false;
    });
  const ret = back ? s.stations.find((st) => st.kind === 'return') : undefined;
  if (ret) {
    ret.count += back;
    touch(s, ret);
  }
}
