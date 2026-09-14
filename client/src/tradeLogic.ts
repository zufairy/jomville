import { TRADE_COINS_MAX, TRADE_FLASH_MS, TRADE_SLOTS, type Offer, type ResolvedOffer, type ResolvedSlot } from '@dovey/shared';

/** What the trade window shows; the server's t_state plus a local countdown deadline. */
export interface TradeView {
  partner: { id: string; handle: string };
  you: ResolvedOffer;
  them: ResolvedOffer;
  acceptedYou: boolean;
  acceptedThem: boolean;
  /** performance.now() when Confirm unlocks; null until both accepted */
  confirmEndsAt: number | null;
}

export const slotKey = (s: ResolvedSlot | undefined): string => (!s ? '' : s.itemId ? `i:${s.itemId}` : `s:${s.def}:${s.qty}`);

export function toOffer(r: ResolvedOffer): Offer {
  return { coins: r.coins, slots: r.slots.map((s) => (s.itemId ? { itemId: s.itemId } : { def: s.def, qty: s.qty })) };
}

/** Set how many of a stack are offered (0 removes it). */
export function withStack(o: Offer, def: string, qty: number): Offer {
  const i = o.slots.findIndex((s) => !('itemId' in s) && s.def === def);
  if (qty <= 0) return i < 0 ? o : { ...o, slots: o.slots.filter((_, j) => j !== i) };
  if (i >= 0) return { ...o, slots: o.slots.map((s, j) => (j === i ? { def, qty } : s)) };
  if (o.slots.length >= TRADE_SLOTS) return o;
  return { ...o, slots: [...o.slots, { def, qty }] };
}

export function toggleInstance(o: Offer, itemId: string): Offer {
  const has = o.slots.some((s) => 'itemId' in s && s.itemId === itemId);
  if (has) return { ...o, slots: o.slots.filter((s) => !('itemId' in s && s.itemId === itemId)) };
  if (o.slots.length >= TRADE_SLOTS) return o;
  return { ...o, slots: [...o.slots, { itemId }] };
}

export function removeSlot(o: Offer, index: number): Offer {
  return { ...o, slots: o.slots.filter((_, j) => j !== index) };
}

export function withCoins(o: Offer, coins: number): Offer {
  const c = Number.isFinite(coins) ? Math.min(TRADE_COINS_MAX, Math.max(0, Math.floor(coins))) : 0;
  return { ...o, coins: c };
}

/** Slot indices (and coins) that differ between two states of one side. */
export function flashKeys(prev: ResolvedOffer | null, next: ResolvedOffer, side: 'you' | 'them'): string[] {
  if (!prev) return [];
  const keys: string[] = [];
  const n = Math.max(prev.slots.length, next.slots.length);
  for (let i = 0; i < n; i++) if (slotKey(prev.slots[i]) !== slotKey(next.slots[i])) keys.push(`${side}:${i}`);
  if (prev.coins !== next.coins) keys.push(`${side}:coins`);
  return keys;
}

export function markChanged(changedAt: Record<string, number>, keys: string[], now: number): Record<string, number> {
  if (!keys.length) return changedAt;
  const out = { ...changedAt };
  for (const k of keys) out[k] = now;
  return out;
}

export function isFlashing(changedAt: Record<string, number>, key: string, now: number): boolean {
  const at = changedAt[key];
  return at !== undefined && now - at < TRADE_FLASH_MS;
}

export function confirmLeft(confirmEndsAt: number | null, now: number): number | null {
  return confirmEndsAt === null ? null : Math.max(0, confirmEndsAt - now);
}
