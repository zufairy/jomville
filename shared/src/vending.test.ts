import { describe, expect, it } from 'vitest';
import { RARITY_WEIGHT, VendRarity, duplicateRefund, rollItem, vendingPool } from './vending';
import { ITEMS, ITEMS_BY_SLOT, isStarter } from './avatar';

describe('vending', () => {
  it('pool is every non-starter wearable, and covers each tier', () => {
    const pool = vendingPool();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((i) => i.rarity !== 'starter')).toBe(true);
    for (const t of Object.keys(RARITY_WEIGHT)) expect(pool.some((i) => i.rarity === t)).toBe(true);
  });

  it('starters are free, pool items are not', () => {
    const starter = ITEMS.find((i) => i.rarity === 'starter')!;
    const premium = vendingPool()[0];
    expect(isStarter(starter.id)).toBe(true);
    expect(isStarter(premium.id)).toBe(false);
    expect(isStarter('nonexistent.thing')).toBe(false);
  });

  it('every slot with premium items can be pulled into', () => {
    const slots = new Set(vendingPool().map((i) => i.slot));
    for (const s of slots) expect(ITEMS_BY_SLOT[s].some((i) => i.rarity !== 'starter')).toBe(true);
  });

  it('rolls follow the weights roughly', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const r = rollItem(rand).rarity;
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts.common).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.epic);
    expect(counts.epic).toBeGreaterThan(counts.legendary ?? 0);
  });

  it('rolls only ever return poolable items', () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = new Set(vendingPool().map((i) => i.id));
    for (let i = 0; i < 300; i++) expect(ids.has(rollItem(rand).id)).toBe(true);
  });

  it('refunds scale with rarity', () => {
    const tiers: VendRarity[] = ['common', 'rare', 'epic', 'legendary'];
    for (let i = 1; i < tiers.length; i++) {
      expect(duplicateRefund(tiers[i])).toBeGreaterThan(duplicateRefund(tiers[i - 1]));
    }
  });
});
