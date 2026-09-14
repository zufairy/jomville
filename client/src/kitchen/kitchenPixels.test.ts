import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { validateMap } from '../game/pixelArt';
import type { IsoSprite } from './isoRaster';
import { allItems, allOverlays, itemKey, itemSprite } from './kitchenPixels';
import { STATION_TOP, STATION_VARIANTS, allStationSprites, stationSprite, stationVariant } from './stationPixels';
import { floorSprite, wallsSprite } from './roomPixels';

const inside = (s: IsoSprite) => s.ax >= 0 && s.ay >= 0 && s.ax <= s.map.rows[0].length && s.ay <= s.map.rows.length;
const ink = (s: IsoSprite) => s.map.rows.join('').replace(/\./g, '').length;

describe('kitchen pixel sprites', () => {
  const lv = kitchen.parseLevel(kitchen.LEVELS.diner);
  const all: Array<{ name: string; sprite: IsoSprite }> = [
    ...allItems().flatMap((it) => [0, 3].map((f) => ({ name: itemKey(it, f), sprite: itemSprite(it, f) }))),
    ...allOverlays(),
    ...allStationSprites(),
    { name: 'floor', sprite: floorSprite(lv.w, lv.h) },
    { name: 'walls', sprite: wallsSprite(lv.w, lv.h, lv.stations) },
  ];

  it('every map is valid, has ink, and anchors inside itself', () => {
    for (const { name, sprite } of all) {
      expect(validateMap(sprite.map), name).toEqual([]);
      expect(ink(sprite), name).toBeGreaterThan(0);
      expect(inside(sprite), name).toBe(true);
    }
  });

  it('every item state the sim can produce has its own sprite', () => {
    const items = allItems();
    // one of each item kind, every ingredient raw and chopped, every dish on a plate
    for (const ing of ['tomato', 'lettuce', 'onion', 'mushroom'] as const)
      for (const chopped of [false, true]) expect(items.some((i) => i.kind === 'ing' && i.ing === ing && i.chopped === chopped)).toBe(true);
    const dishes = new Set(items.flatMap((i) => (i.kind === 'plate' && kitchen.plateDish(i) ? [kitchen.plateDish(i)] : [])));
    for (const d of kitchen.LEVELS.diner.menu) expect(dishes.has(d), d).toBe(true);
    // distinct states draw distinct art
    const byKey = new Map(items.map((i) => [itemKey(i), itemSprite(i).map.rows.join('\n')]));
    expect(new Set(byKey.values()).size).toBe(byKey.size);
  });

  it('pots show filling, cooking, done and burnt differently', () => {
    const pot = (n: number, cook: number, burnt = false): kitchen.Item => ({ kind: 'pot', contents: Array(n).fill('onion'), cook, over: 0, burnt });
    const keys = [pot(0, 0), pot(1, 0), pot(2, 0), pot(3, 0), pot(3, 3), pot(3, 9), pot(3, 9, true)].map((p) => itemKey(p));
    expect(new Set(keys).size).toBe(keys.length);
    // steam and smoke animate
    expect(itemSprite(pot(3, 9), 0).map).not.toBe(itemSprite(pot(3, 9), 2).map);
  });

  it('every station kind in a real level has a sprite for the variant it will show', () => {
    const look = { now: 0, windowRun: false, binnedAgo: Infinity };
    for (const st of lv.stations) {
      const v = stationVariant(st, look);
      expect(STATION_VARIANTS[st.kind], `${st.kind}:${v}`).toContain(v);
      expect(stationSprite(st.kind, v).map.rows.length).toBeGreaterThan(0);
    }
    const lit = { ...lv.stations.find((s) => s.kind === 'stove')!, item: { kind: 'pot', contents: ['tomato'], cook: 1, over: 0, burnt: false } as kitchen.Item };
    expect(stationVariant(lit, { ...look, now: 250 })).toMatch(/^on[0-2]$/);
    expect(stationVariant({ kind: 'bin', ing: null, item: null }, { ...look, binnedAgo: 200 })).toBe('open2');
    // items sit on everything that holds one
    for (const k of ['counter', 'board', 'stove', 'window', 'plates', 'return'] as const) expect(STATION_TOP[k]).not.toBeNull();
  });
});
