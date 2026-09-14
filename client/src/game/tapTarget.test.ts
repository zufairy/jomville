import { describe, expect, it } from 'vitest';
import type { Placement } from '@dovey/shared';
import { TapWorld, resolveTap } from './tapTarget';

const bench: Placement = { id: 'b', def: 'bench', x: 5, y: 5, rot: 0 };
const lamp: Placement = { id: 'l', def: 'lamppost', x: 8, y: 8, rot: 0 };

function world(over: Partial<TapWorld> = {}): TapWorld {
  return {
    walkable: () => true,
    seatAt: () => null,
    usableAt: () => null,
    spriteHit: () => null,
    ...over,
  };
}

describe('resolveTap', () => {
  it('walks to exactly the tapped tile even when a tall sprite overlaps it', () => {
    const w = world({ spriteHit: () => ({ item: bench, sit: true }) });
    expect(resolveTap({ x: 4, y: 1 }, w)).toEqual({ kind: 'walk', x: 4, y: 1 });
  });

  it('sits on the exact seat tile that was tapped', () => {
    const w = world({ seatAt: (x, y) => (x === 5 && y === 5 ? bench : null) });
    expect(resolveTap({ x: 5, y: 5 }, w)).toEqual({ kind: 'walk', x: 5, y: 5 });
  });

  it('uses an item when its own footprint is tapped', () => {
    const w = world({ walkable: () => false, usableAt: (x, y) => (x === 8 && y === 8 ? lamp : null) });
    expect(resolveTap({ x: 8, y: 8 }, w)).toEqual({ kind: 'use', item: lamp });
  });

  it('falls back to the sprite only when the tapped tile is blocked', () => {
    const blocked = world({ walkable: () => false, spriteHit: () => ({ item: lamp, sit: false }) });
    expect(resolveTap({ x: 7, y: 6 }, blocked)).toEqual({ kind: 'use', item: lamp });
    const seatSprite = world({ walkable: () => false, spriteHit: () => ({ item: bench, sit: true }) });
    expect(resolveTap({ x: 5, y: 4 }, seatSprite)).toEqual({ kind: 'seat', item: bench });
  });

  it('does nothing on a blocked tile with nothing under the pointer', () => {
    expect(resolveTap({ x: 0, y: 0 }, world({ walkable: () => false }))).toEqual({ kind: 'none' });
  });
});
