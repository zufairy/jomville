import { describe, expect, it } from 'vitest';
import { CLOSED, INTERACTIONS, ROLLING, inReach } from './interactions';
import { FURNITURE, Placement, furnitureDef, isInstanceDef } from './furniture';

const P = (def: string, x: number, y: number): Placement => ({ id: 'p1', def, x, y, rot: 0 });

describe('chance furni catalog', () => {
  it('prices and stock match the spec', () => {
    expect(furnitureDef('dicemaster')).toMatchObject({ price: 8000, interaction: 'dice6', cat: 'casino' });
    expect(furnitureDef('holodice')).toMatchObject({ price: 15000, interaction: 'dice100' });
    expect(furnitureDef('wheel_fortune')).toMatchObject({ price: 25000, interaction: 'wheel', ltd: 100 });
    expect(furnitureDef('dragon_egg')).toMatchObject({ price: 75000, ltd: 50 });
    expect(furnitureDef('throne_gold')).toMatchObject({ price: 50000, ltd: 100, sit: true });
    for (const id of ['felt_table', 'chip_stack', 'casino_carpet', 'neon_casino', 'slot_prop', 'velvet_rope_gold']) {
      const d = furnitureDef(id)!;
      expect(d, id).toBeDefined();
      expect(d.price).toBeGreaterThanOrEqual(300);
      expect(d.price).toBeLessThanOrEqual(2000);
    }
  });
  it('instance defs are exactly the ltd or interactive ones', () => {
    expect(isInstanceDef(furnitureDef('dicemaster')!)).toBe(true);
    expect(isInstanceDef(furnitureDef('dragon_egg')!)).toBe(true);
    expect(isInstanceDef(furnitureDef('chair')!)).toBe(false);
    expect(FURNITURE.filter(isInstanceDef).map((d) => d.id).sort()).toEqual(['dicemaster', 'dragon_egg', 'holodice', 'throne_gold', 'wheel_fortune']);
  });
});

describe('interactions', () => {
  it('roll results stay in range at both RNG extremes', () => {
    const lo = () => 0;
    const hi = (n: number) => n - 1;
    expect([INTERACTIONS.dice6.roll(lo), INTERACTIONS.dice6.roll(hi)]).toEqual(['1', '6']);
    expect([INTERACTIONS.dice100.roll(lo), INTERACTIONS.dice100.roll(hi)]).toEqual(['1', '100']);
    expect([INTERACTIONS.wheel.roll(lo), INTERACTIONS.wheel.roll(hi)]).toEqual(['1', '8']);
    expect(ROLLING).toBe('-1');
    expect(CLOSED).toBe('0');
  });
  it('timings match the spec', () => {
    expect(INTERACTIONS.dice6.rollMs).toBe(1500);
    expect(INTERACTIONS.dice100.rollMs).toBe(2000);
    expect(INTERACTIONS.wheel.rollMs).toBe(3000);
  });
  it('dice need an adjacent tile, diagonals count', () => {
    const die = P('dicemaster', 5, 5);
    expect(inReach('dice6', 4, 4, die)).toBe(true);
    expect(inReach('dice6', 6, 5, die)).toBe(true);
    expect(inReach('dice6', 7, 5, die)).toBe(false);
    expect(inReach('dice6', 5, 5, die)).toBe(false);
  });
  it('wheel reach measures from every footprint tile', () => {
    const wheel = P('wheel_fortune', 5, 5); // 2x1: (5,5) (6,5)
    expect(inReach('wheel', 8, 5, wheel)).toBe(true);
    expect(inReach('wheel', 9, 5, wheel)).toBe(false);
  });
});
