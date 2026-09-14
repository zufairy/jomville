import { describe, expect, it } from 'vitest';
import { FURNITURE, blurbFor, furnitureDef } from './furniture';

describe('furniture blurbs', () => {
  it('every casino item has its own blurb', () => {
    for (const d of FURNITURE.filter((d) => d.cat === 'casino')) expect(d.blurb, d.id).toBeTruthy();
  });
  it('falls back to a line for the category', () => {
    expect(blurbFor(furnitureDef('chair')!)).toBe('A cozy piece of seating.');
    expect(blurbFor(furnitureDef('dicemaster')!)).toBe(furnitureDef('dicemaster')!.blurb);
    for (const d of FURNITURE) expect(blurbFor(d).length, d.id).toBeGreaterThan(0);
  });
});
