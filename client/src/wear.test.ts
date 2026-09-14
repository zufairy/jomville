import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, ITEMS_BY_SLOT, isGearSlot } from '@dovey/shared';
import { wearPatch } from './wear';

describe('wearPatch', () => {
  it('equips gear by id only', () => {
    const gearSlot = (['aura', 'back', 'helm', 'face'] as const).find((s) => ITEMS_BY_SLOT[s].length && isGearSlot(s))!;
    const item = ITEMS_BY_SLOT[gearSlot][0];
    expect(wearPatch(DEFAULT_AVATAR, item)).toEqual({ [gearSlot]: item.id });
  });

  it('keeps the current colour when the garment offers it', () => {
    const item = ITEMS_BY_SLOT.torso.find((i) => i.variants.includes(DEFAULT_AVATAR.torsoColour))!;
    expect(item).toBeDefined();
    expect(wearPatch(DEFAULT_AVATAR, item)).toEqual({ torso: item.id, torsoColour: DEFAULT_AVATAR.torsoColour });
  });

  it("falls back to the item's first colour otherwise", () => {
    const item = ITEMS_BY_SLOT.torso[0];
    const cfg = { ...DEFAULT_AVATAR, torsoColour: 'no-such-colour' };
    expect(wearPatch(cfg, item)).toEqual({ torso: item.id, torsoColour: item.variants[0] });
  });
});
