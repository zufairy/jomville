import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR,
  EYE_COLOURS,
  ITEMS,
  ITEMS_BY_SLOT,
  PALETTE,
  SKIN_TONES,
  SLOTS,
  isStarter,
  itemDef,
  normalizeAvatar,
  parseAvatar,
  randomAvatar,
  serializeAvatar,
} from './avatar';

describe('avatar config', () => {
  it('palette has exactly 32 unique colours', () => {
    expect(PALETTE.length).toBe(32);
    expect(new Set(PALETTE).size).toBe(32);
  });

  it('ships a wardrobe for every slot, with art variants', () => {
    for (const s of SLOTS) expect(ITEMS_BY_SLOT[s].length).toBeGreaterThan(0);
    for (const i of ITEMS) {
      expect(i.id.startsWith(`${i.slot}.`)).toBe(true);
      expect(i.variants.length).toBeGreaterThan(0);
    }
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('the default look is made only of starter items', () => {
    for (const s of SLOTS) expect(isStarter(DEFAULT_AVATAR[s])).toBe(true);
    expect(SKIN_TONES).toContain(DEFAULT_AVATAR.skin);
    expect(EYE_COLOURS).toContain(DEFAULT_AVATAR.eyes);
  });

  it('normalizes garbage to defaults', () => {
    expect(normalizeAvatar(null)).toEqual(DEFAULT_AVATAR);
    expect(normalizeAvatar({ skin: 'chrome', torso: 'nope', body: 'alien' })).toEqual(DEFAULT_AVATAR);
  });

  it('rejects an item id from the wrong slot', () => {
    const hair = ITEMS_BY_SLOT.hair[0];
    expect(normalizeAvatar({ torso: hair.id }).torso).toBe(DEFAULT_AVATAR.torso);
  });

  it('keeps valid fields and clamps a colour the garment does not ship', () => {
    const shirt = ITEMS_BY_SLOT.torso[0];
    const c = normalizeAvatar({ body: 'female', torso: shirt.id, torsoColour: 'chartreuse' });
    expect(c.body).toBe('female');
    expect(c.torso).toBe(shirt.id);
    expect(shirt.variants).toContain(c.torsoColour);
  });

  it('allows bare heads and hatless looks', () => {
    expect(normalizeAvatar({ hair: 'none' }).hair).toBe('none');
    expect(normalizeAvatar({ hat: 'none' }).hat).toBe('none');
    expect(isStarter('none')).toBe(true);
  });

  it('round-trips through serialize/parse', () => {
    const c = randomAvatar(() => 0.5);
    expect(parseAvatar(serializeAvatar(c))).toEqual(c);
    expect(parseAvatar('not json')).toEqual(DEFAULT_AVATAR);
  });

  it('random looks are always valid and wear only starters', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const c = randomAvatar(rand);
      expect(normalizeAvatar(c)).toEqual(c);
      for (const s of SLOTS) expect(isStarter(c[s])).toBe(true);
    }
  });

  it('itemDef resolves ids', () => {
    const any = ITEMS[0];
    expect(itemDef(any.id)?.name).toBe(any.name);
    expect(itemDef('torso.nothing')).toBeUndefined();
  });
});
