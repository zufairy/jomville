import { ITEMS, ItemDef } from './avatar';

/**
 * Cosmetic vending machine (capsule gacha). Every room has one beside the door.
 * Pulls cost credits; the room owner earns a cut; contents are cosmetics only.
 * Never gameplay advantage, never currency.
 */
export const VEND_COST = 50;
export const OWNER_CUT = 0.1;
export const DAILY_CREDITS = 120;
export const STARTING_CREDITS = 300;

export type VendRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_WEIGHT: Record<VendRarity, number> = { common: 62, rare: 26, epic: 10, legendary: 2 };
export const RARITY_LABEL: Record<VendRarity, string> = { common: 'common', rare: 'rare', epic: 'epic', legendary: 'legendary' };

/** Items obtainable from the machine (must be non-starter catalog items). */
export function vendingPool(): ItemDef[] {
  return ITEMS.filter((i) => i.rarity !== 'starter');
}

/** Roll a rarity tier, then a uniform item within it; duplicates are allowed (refunded as credits by the server). */
export function rollItem(rand: () => number = Math.random, pool: ItemDef[] = vendingPool()): ItemDef {
  const tiers = (Object.keys(RARITY_WEIGHT) as VendRarity[]).filter((t) => pool.some((i) => i.rarity === t));
  const total = tiers.reduce((s, t) => s + RARITY_WEIGHT[t], 0);
  let r = rand() * total;
  let tier: VendRarity = tiers[tiers.length - 1];
  for (const t of tiers) {
    r -= RARITY_WEIGHT[t];
    if (r <= 0) {
      tier = t;
      break;
    }
  }
  const inTier = pool.filter((i) => i.rarity === tier);
  return inTier[Math.floor(rand() * inTier.length)];
}

/** Credits refunded when a pull yields an item you already own. */
export function duplicateRefund(rarity: VendRarity): number {
  return { common: 15, rare: 30, epic: 60, legendary: 150 }[rarity];
}
