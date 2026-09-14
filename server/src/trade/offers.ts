import { furnitureDef, type Offer, type ResolvedOffer, type ResolvedSlot } from '@dovey/shared';
import type { Inventory } from '../repo';

export type OfferCheck = { ok: true; resolved: ResolvedOffer } | { ok: false; code: 'insufficient_coins' | 'insufficient_items' | 'not_owned' };

/**
 * Does this player hold what they offer right now? Resolves display names and
 * serials for `t_state`. executeTrade re-checks everything inside the transaction.
 */
export function checkOffer(inv: Inventory, offer: Offer): OfferCheck {
  if (offer.coins > inv.coins) return { ok: false, code: 'insufficient_coins' };
  const slots: ResolvedSlot[] = [];
  for (const s of offer.slots) {
    if ('itemId' in s) {
      const it = inv.instances.find((i) => i.id === s.itemId);
      if (!it || it.placed) return { ok: false, code: 'not_owned' };
      slots.push({ def: it.def, qty: 1, itemId: it.id, name: furnitureDef(it.def)?.name ?? it.def, serial: it.serial });
    } else {
      if ((inv.items[s.def] ?? 0) < s.qty) return { ok: false, code: 'insufficient_items' };
      slots.push({ def: s.def, qty: s.qty, itemId: null, name: furnitureDef(s.def)?.name ?? s.def, serial: null });
    }
  }
  return { ok: true, resolved: { slots, coins: offer.coins } };
}
