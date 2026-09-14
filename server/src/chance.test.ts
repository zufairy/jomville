import { describe, expect, it } from 'vitest';
import { beginRoll, closeChance, finishRoll, restoredState } from './chance';

describe('chance furni state', () => {
  it('rolls once, ignores clicks while rolling, then shows the result', () => {
    const f = { state: '0' };
    expect(beginRoll(f)).toBe(true);
    expect(f.state).toBe('-1');
    expect(beginRoll(f)).toBe(false);
    expect(closeChance(f)).toBe(false);
    expect(finishRoll(f, 'dice6', () => 3)).toBe(4);
    expect(f.state).toBe('4');
  });
  it('re-rolls from a shown face and closes to blank', () => {
    const f = { state: '6' };
    expect(beginRoll(f)).toBe(true);
    expect(finishRoll(f, 'wheel', () => 7)).toBe(8);
    expect(closeChance(f)).toBe(true);
    expect(f.state).toBe('0');
  });
  it('finish without begin does nothing', () => {
    const f = { state: '2' };
    expect(finishRoll(f, 'dice100', () => 99)).toBeNull();
    expect(f.state).toBe('2');
  });
  it('a room restored mid-roll comes back closed', () => {
    expect(restoredState('-1')).toBe('0');
    expect(restoredState(undefined)).toBe('0');
    expect(restoredState('5')).toBe('5');
  });
});
