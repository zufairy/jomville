import { furnitureDef, isInstanceDef } from './furniture';

/**
 * Player-to-player trading (casino stage 2). Shapes and limits shared by the
 * server (authoritative) and the client (window + optimistic editing).
 */
export const TRADE_SLOTS = 9;
export const TRADE_QTY_MAX = 9999;
export const TRADE_COINS_MAX = 1_000_000_000;
export const TRADE_INVITE_TTL_MS = 20_000;
export const TRADE_CONFIRM_DELAY_MS = 3000;
export const TRADE_IDLE_MS = 300_000;
/** a slot that changed within this window flashes, so a last-second swap is visible */
export const TRADE_FLASH_MS = 2000;
export const TRADE_MSG_RATE = { count: 10, windowMs: 1000 };
export const TRADE_INVITE_RATE = { count: 1, windowMs: 5000 };
export const TRADE_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const TRADE_MIN_PLAY_MINUTES = 30;
/** instance ids are base64url; '' (system-room furniture) never matches */
export const TRADE_ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type TradeSlot = { def: string; qty: number } | { itemId: string };

export interface Offer {
  slots: TradeSlot[];
  coins: number;
}

export interface ResolvedSlot {
  def: string;
  qty: number;
  itemId: string | null;
  name: string;
  serial: number | null;
}

export interface ResolvedOffer {
  slots: ResolvedSlot[];
  coins: number;
}

export interface TradeStateMsg {
  partner: { id: string; handle: string };
  you: ResolvedOffer;
  them: ResolvedOffer;
  acceptedYou: boolean;
  acceptedThem: boolean;
  /** ms until Confirm unlocks (0 = unlocked); null until both accepted */
  confirmAt: number | null;
}

export type TradeFailCode = 'bad_offer' | 'insufficient_coins' | 'insufficient_items' | 'not_owned' | 'trade_failed';
export type TradeDoneCode = TradeFailCode | 'cancelled' | 'declined' | 'expired' | 'left' | 'idle' | 'reported' | 'trade_busy' | 'peer_gone';

export interface TradeDoneMsg {
  ok: boolean;
  code?: TradeDoneCode;
  /** session id of the other person this trade or invite was with */
  with?: string;
}

export type TradeLogSlot = { def: string; qty: number } | { itemId: string; def: string; serial: number | null };

export interface TradeLogOffer {
  coins: number;
  slots: TradeLogSlot[];
}

/** Shape check for a `t_offer` payload. Ownership is checked separately, on the server. */
export function parseOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== 'object') return null;
  const { slots, coins = 0 } = raw as { slots?: unknown; coins?: unknown };
  if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 0 || coins > TRADE_COINS_MAX) return null;
  if (!Array.isArray(slots) || slots.length > TRADE_SLOTS) return null;
  const out: TradeSlot[] = [];
  const ids = new Set<string>();
  const defs = new Set<string>();
  for (const s of slots) {
    if (!s || typeof s !== 'object') return null;
    const { itemId, def, qty } = s as Record<string, unknown>;
    if (itemId !== undefined) {
      if (typeof itemId !== 'string' || !TRADE_ITEM_ID.test(itemId) || ids.has(itemId)) return null;
      if (def !== undefined || qty !== undefined) return null;
      ids.add(itemId);
      out.push({ itemId });
      continue;
    }
    const d = typeof def === 'string' ? furnitureDef(def) : undefined;
    if (!d || isInstanceDef(d) || defs.has(d.id)) return null;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > TRADE_QTY_MAX) return null;
    defs.add(d.id);
    out.push({ def: d.id, qty });
  }
  return { slots: out, coins };
}
