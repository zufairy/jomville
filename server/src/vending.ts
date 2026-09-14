import { ITEMS, OWNER_CUT, VEND_COST, duplicateRefund, isStarter, rollItem } from '@dovey/shared';
import { Repo } from './repo';

export interface VendResult {
  ok: true;
  itemId: string;
  name: string;
  rarity: string;
  slot: string;
  duplicate: boolean;
  refund: number;
  credits: number;
  ownerCut: number;
}
export type VendError = { ok: false; reason: 'not_enough_credits' | 'unknown_user' };

/** Cosmetic ids the user may equip: all starters plus pulled items in the inventory table. */
export async function wardrobe(repo: Repo, userId: string): Promise<string[]> {
  const inv = await repo.inventory(userId);
  const owned = Object.keys(inv.items).filter((id) => ITEMS.some((i) => i.id === id));
  return [...ITEMS.filter((i) => i.rarity === 'starter').map((i) => i.id), ...owned];
}

export async function canEquip(repo: Repo, userId: string, itemId: string): Promise<boolean> {
  if (isStarter(itemId)) return true;
  const inv = await repo.inventory(userId);
  return (inv.items[itemId] ?? 0) > 0;
}

/**
 * One pull. Deducts credits atomically, pays the room owner their cut (never to
 * yourself or a system room), rolls, and either grants the item or refunds a duplicate.
 */
export async function vend(repo: Repo, userId: string, roomOwnerId: string | null, rand: () => number = Math.random): Promise<VendResult | VendError> {
  const charged = await repo.spendCoins(userId, VEND_COST);
  if (charged === null) return { ok: false, reason: 'not_enough_credits' };
  let ownerCut = 0;
  if (roomOwnerId && roomOwnerId !== userId) {
    ownerCut = Math.floor(VEND_COST * OWNER_CUT);
    await repo.creditCoins(roomOwnerId, ownerCut);
  }
  const item = rollItem(rand);
  const inv = await repo.inventory(userId);
  const duplicate = (inv.items[item.id] ?? 0) > 0;
  let credits = charged;
  let refund = 0;
  if (duplicate) {
    refund = duplicateRefund(item.rarity as Parameters<typeof duplicateRefund>[0]);
    credits = await repo.creditCoins(userId, refund);
  } else {
    await repo.addItem(userId, item.id, 1);
  }
  await repo.recordPull(userId, item.id);
  return { ok: true, itemId: item.id, name: item.name, rarity: item.rarity, slot: item.slot, duplicate, refund, credits, ownerCut };
}
