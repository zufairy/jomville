import { describe, expect, it } from 'vitest';
import { COOK_PER_ING, POT_MAX } from './constants';
import { binItem, combine, emptyPlate, emptyPot, plateDish, potDone } from './items';
import { IngItem, Ingredient, PlateItem, PotItem } from './types';

const chopped = (ing: Ingredient): IngItem => ({ kind: 'ing', ing, chopped: true });
const raw = (ing: Ingredient): IngItem => ({ kind: 'ing', ing, chopped: false });
const donePot = (ing: Ingredient): PotItem => ({ kind: 'pot', contents: [ing, ing, ing], cook: COOK_PER_ING * POT_MAX, over: 0, burnt: false });
const asPlate = (i: unknown) => i as PlateItem;

describe('items', () => {
  it('puts chopped soup ingredients of one kind into a pot, up to 3', () => {
    let pot: PotItem = emptyPot();
    for (let i = 0; i < 3; i++) {
      const r = combine(chopped('tomato'), pot);
      expect(r?.held).toBeNull();
      pot = r!.target as PotItem;
    }
    expect(pot.contents).toEqual(['tomato', 'tomato', 'tomato']);
    expect(combine(chopped('tomato'), pot)).toBeNull(); // full
    expect(combine(raw('onion'), emptyPot())).toBeNull(); // raw
    expect(combine(chopped('lettuce'), emptyPot())).toBeNull(); // not a soup
    expect(combine(chopped('onion'), { ...emptyPot(), contents: ['tomato'] })).toBeNull(); // mixed
  });

  it('a held pot scoops a chopped ingredient off a counter', () => {
    expect(combine(emptyPot(), chopped('mushroom'))).toEqual({ held: { ...emptyPot(), contents: ['mushroom'] }, target: null });
  });

  it('builds salads on plates and names the dish', () => {
    const a = combine(chopped('lettuce'), emptyPlate())!;
    expect(plateDish(asPlate(a.target))).toBe('salad');
    const b = combine(a.target!, chopped('tomato'))!;
    expect(b.target).toBeNull();
    expect(plateDish(asPlate(b.held))).toBe('salad_tomato');
    expect(combine(b.held!, chopped('tomato'))).toBeNull(); // duplicate
    expect(combine(chopped('onion'), emptyPlate())).toBeNull(); // not a salad part
    expect(plateDish({ kind: 'plate', soup: null, parts: ['tomato'] })).toBeNull();
  });

  it('pours a finished soup onto an empty plate either way round', () => {
    expect(potDone(donePot('onion'))).toBe(true);
    const a = combine(donePot('onion'), emptyPlate())!;
    expect(a.held).toEqual(emptyPot());
    expect(plateDish(asPlate(a.target))).toBe('soup_onion');
    const b = combine(emptyPlate(), donePot('tomato'))!;
    expect(plateDish(asPlate(b.held))).toBe('soup_tomato');
    expect(b.target).toEqual(emptyPot());
    expect(combine(emptyPlate(), { ...donePot('tomato'), cook: 1 })).toBeNull(); // not cooked
    expect(combine(emptyPlate(), { ...donePot('tomato'), burnt: true })).toBeNull();
    expect(combine(donePot('tomato'), { kind: 'plate', soup: null, parts: ['lettuce'] })).toBeNull();
  });

  it('bins ingredients and empties containers', () => {
    expect(binItem(raw('onion'))).toBeNull();
    expect(binItem({ kind: 'plate', soup: 'tomato', parts: [] })).toEqual(emptyPlate());
    expect(binItem({ ...donePot('tomato'), burnt: true })).toEqual(emptyPot());
  });
});
