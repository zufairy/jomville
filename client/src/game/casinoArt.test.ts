import { describe, expect, it } from 'vitest';
import { FURNITURE, furnitureDef } from '@dovey/shared';
import { CASINO_PAINTERS, artFps, artFrameCount, artStateKey } from './casinoArt';
import { HOLO_IDLE_FRAMES } from './casinoPixels';

describe('casino art', () => {
  it('keys the holodice by its exact number so each one bakes its own strip', () => {
    const h = furnitureDef('holodice')!;
    expect(artStateKey(h, '12')).toBe('12');
    expect(artStateKey(h, '50')).toBe('50');
    expect(artStateKey(h, '100')).toBe('100');
    expect(artStateKey(h, '007')).toBe('7');
    expect(artStateKey(h, 'lock2:42')).toBe('lock2:42');
    expect(artStateKey(h, '101')).toBe('0');
    expect(artStateKey(h, 'lo')).toBe('0');
    expect(artStateKey(h, '-1')).toBe('-1');
    expect(artStateKey(h, undefined)).toBe('0');
  });
  it('bakes a short idle loop only for a settled holodice number', () => {
    const h = furnitureDef('holodice')!;
    const dm = furnitureDef('dicemaster')!;
    expect(artFrameCount(h, '42')).toBe(HOLO_IDLE_FRAMES);
    expect(artFps(h, '42')).toBeGreaterThan(0);
    expect(artFrameCount(h, 'lock1:42')).toBe(1);
    expect(artFrameCount(h, '0')).toBe(1);
    expect(artFrameCount(h, '-1')).toBe(h.anim);
    expect(artFrameCount(dm, '5')).toBe(1);
    expect(artFps(dm, '5')).toBeNull();
    expect(artFrameCount(furnitureDef('dragon_egg')!, '')).toBe(12);
  });
  it('dice and wheel keep their exact face; décor has no state', () => {
    expect(artStateKey(furnitureDef('dicemaster')!, '5')).toBe('5');
    expect(artStateKey(furnitureDef('wheel_fortune')!, '8')).toBe('8');
    expect(artStateKey(furnitureDef('chip_stack')!, '3')).toBe('');
  });
  it('has a painter for every casino kind', () => {
    for (const d of FURNITURE.filter((d) => d.cat === 'casino')) expect(typeof CASINO_PAINTERS[d.kind], d.kind).toBe('function');
    for (const k of ['dicemaster', 'holodice', 'wheel_fortune', 'dragon_egg', 'throne', 'felt_table', 'chip_stack', 'casino_carpet', 'neon_casino', 'slot_prop', 'velvet_rope_gold']) {
      expect(typeof CASINO_PAINTERS[k], k).toBe('function');
    }
  });
});
