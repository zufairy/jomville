import { describe, expect, it } from 'vitest';
import { furnitureDef } from '@dovey/shared';
import { chanceStatus, serialLine } from './itemInfoText';

describe('item info text', () => {
  it('describes chance furni state', () => {
    const dice = furnitureDef('dicemaster')!;
    expect(chanceStatus(dice, undefined)).toBe('closed');
    expect(chanceStatus(dice, '-1')).toBe('rolling…');
    expect(chanceStatus(dice, '5')).toBe('showing 5');
    expect(chanceStatus(furnitureDef('wheel_fortune')!, '5')).toBe('landed on 5');
    expect(chanceStatus(furnitureDef('chair')!, '5')).toBeNull();
  });
  it('shows serial and ltd cap', () => {
    const wheel = furnitureDef('wheel_fortune')!;
    const p = { id: 'abcd', def: wheel.id, x: 0, y: 0, rot: 0 as const };
    expect(serialLine(wheel, { ...p, serial: 7 })).toBe('Serial #7 · LTD 100');
    expect(serialLine(furnitureDef('chair')!, p)).toBeNull();
  });
});
