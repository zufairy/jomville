import { describe, expect, it } from 'vitest';
import { GEAR } from '@dovey/shared';
import { gearIds, gearLayer, gearLift, hasGearArt } from './gearArt';

describe('gear art', () => {
  it('draws every catalog piece', () => {
    for (const g of GEAR) expect(hasGearArt(g.id)).toBe(true);
  });

  it('puts eyewear and helmets over the body, back pieces behind unless walking away', () => {
    expect(gearLayer('face.ruby_visor', 2)).toBe('front');
    expect(gearLayer('helm.crimson_armor', 0)).toBe('front');
    expect(gearLayer('back.cape_red', 2)).toBe('back');
    expect(gearLayer('back.cape_red', 0)).toBe('front');
    expect(gearLayer('aura.flame', 0)).toBe('back');
  });

  it('lifts the wearer only for pieces that fly', () => {
    expect(gearLift(['back.jetpack'])).toBeGreaterThan(0);
    expect(gearLift(['face.shades', 'back.rocket'])).toBe(gearLift(['back.rocket']));
    expect(gearLift(['face.shades', 'helm.crown'])).toBe(0);
  });

  it('orders worn gear so helmets draw over eyewear, and skips empty slots', () => {
    const ids = gearIds({ face: 'face.shades', helm: 'helm.crown', aura: 'none', back: 'back.cape_red' });
    expect(ids).toEqual(['back.cape_red', 'face.shades', 'helm.crown']);
  });
});
