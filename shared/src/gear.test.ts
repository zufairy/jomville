import { describe, expect, it } from 'vitest';
import { GEAR, GEAR_SLOTS, isGearSlot } from './gear';
import { DEFAULT_AVATAR, ITEMS_BY_SLOT, itemDef, normalizeAvatar } from './avatar';
import { rollItem, vendingPool } from './vending';

describe('gear', () => {
  it('ships many unique, slot-prefixed pieces', () => {
    expect(GEAR.length).toBeGreaterThanOrEqual(72);
    expect(new Set(GEAR.map((g) => g.id)).size).toBe(GEAR.length);
    for (const g of GEAR) expect(g.id.startsWith(`${g.slot}.`)).toBe(true);
  });

  it('every gear slot has epic and legendary pieces', () => {
    for (const s of GEAR_SLOTS) {
      const inSlot = GEAR.filter((g) => g.slot === s);
      expect(inSlot.length).toBeGreaterThanOrEqual(10);
      expect(inSlot.some((g) => g.rarity === 'epic')).toBe(true);
      expect(inSlot.some((g) => g.rarity === 'legendary')).toBe(true);
    }
  });

  it('is wearable in its own slot only, and empty by default', () => {
    const visor = itemDef('face.ruby_visor');
    expect(visor?.slot).toBe('face');
    expect(normalizeAvatar({ face: 'face.ruby_visor' }).face).toBe('face.ruby_visor');
    expect(normalizeAvatar({ helm: 'face.ruby_visor' }).helm).toBe('none');
    for (const s of GEAR_SLOTS) {
      expect(DEFAULT_AVATAR[s]).toBe('none');
      expect(ITEMS_BY_SLOT[s].length).toBeGreaterThan(0);
    }
    expect(isGearSlot('aura')).toBe(true);
    expect(isGearSlot('hat')).toBe(false);
  });

  it('comes out of the capsule machine', () => {
    const pool = new Set(vendingPool().map((i) => i.id));
    for (const g of GEAR) expect(pool.has(g.id)).toBe(true);
    let seed = 5;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = new Set(GEAR.map((g) => g.id));
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (ids.has(rollItem(rand).id)) hits++;
    expect(hits).toBeGreaterThan(0);
  });
});
