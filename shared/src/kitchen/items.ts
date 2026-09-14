import { COOK_PER_ING, POT_MAX } from './constants';
import { Dish, IngItem, Ingredient, Item, PlateItem, PotItem } from './types';

export const SOUP_INGS: readonly Ingredient[] = ['tomato', 'onion', 'mushroom'];
export const SALAD_INGS: readonly Ingredient[] = ['lettuce', 'tomato'];

export const emptyPot = (): PotItem => ({ kind: 'pot', contents: [], cook: 0, over: 0, burnt: false });
export const emptyPlate = (): PlateItem => ({ kind: 'plate', soup: null, parts: [] });

export function potDone(p: PotItem): boolean {
  return !p.burnt && p.contents.length === POT_MAX && p.cook >= COOK_PER_ING * POT_MAX;
}

export function plateEmpty(p: PlateItem): boolean {
  return p.soup === null && p.parts.length === 0;
}

export function canAddToPot(p: PotItem, i: IngItem): boolean {
  return i.chopped && SOUP_INGS.includes(i.ing) && !p.burnt && p.contents.length < POT_MAX && (p.contents.length === 0 || p.contents[0] === i.ing);
}

export function canAddToPlate(p: PlateItem, i: IngItem): boolean {
  return i.chopped && SALAD_INGS.includes(i.ing) && p.soup === null && !p.parts.includes(i.ing);
}

export function plateDish(p: PlateItem): Dish | null {
  if (p.soup) return p.parts.length ? null : (`soup_${p.soup}` as Dish);
  const parts = [...p.parts].sort().join('+');
  if (parts === 'lettuce') return 'salad';
  if (parts === 'lettuce+tomato') return 'salad_tomato';
  return null;
}

/** What the bin leaves in your hands: nothing for food, an empty container otherwise. */
export function binItem(item: Item): Item | null {
  if (item.kind === 'ing') return null;
  return item.kind === 'plate' ? emptyPlate() : emptyPot();
}

const addToPot = (p: PotItem, ing: Ingredient): PotItem => ({ ...p, contents: [...p.contents, ing] });
const addToPlate = (p: PlateItem, ing: Ingredient): PlateItem => ({ ...p, parts: [...p.parts, ing] });

/** Merge what a chef holds with an item on a station. null when the two don't go together. */
export function combine(held: Item, target: Item): { held: Item | null; target: Item | null } | null {
  if (held.kind === 'ing' && target.kind === 'pot' && canAddToPot(target, held)) return { held: null, target: addToPot(target, held.ing) };
  if (held.kind === 'pot' && target.kind === 'ing' && canAddToPot(held, target)) return { held: addToPot(held, target.ing), target: null };
  if (held.kind === 'ing' && target.kind === 'plate' && canAddToPlate(target, held)) return { held: null, target: addToPlate(target, held.ing) };
  if (held.kind === 'plate' && target.kind === 'ing' && canAddToPlate(held, target)) return { held: addToPlate(held, target.ing), target: null };
  if (held.kind === 'pot' && target.kind === 'plate' && potDone(held) && plateEmpty(target))
    return { held: emptyPot(), target: { ...target, soup: held.contents[0] } };
  if (held.kind === 'plate' && target.kind === 'pot' && potDone(target) && plateEmpty(held))
    return { held: { ...held, soup: target.contents[0] }, target: emptyPot() };
  return null;
}
