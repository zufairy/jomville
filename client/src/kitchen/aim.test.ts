import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { aimAssist, avatarDir, predictChop, predictGrab, screenToWorldDir, worldToScreenDir } from './aim';
import { chefColor } from './chefColors';
import { FloatingStick, STICK_RADIUS } from './joystick';

const S = Math.SQRT1_2;

describe('screen-relative directions', () => {
  it('screen up walks up the screen, screen right walks right', () => {
    const up = screenToWorldDir(0, -1);
    expect(up.x).toBeCloseTo(-S, 6);
    expect(up.y).toBeCloseTo(-S, 6);
    const right = screenToWorldDir(1, 0);
    expect(right.x).toBeCloseTo(S, 6);
    expect(right.y).toBeCloseTo(-S, 6);
    // and back: the world vector points the same way on screen
    const back = worldToScreenDir(up.x, up.y);
    expect(back.x).toBeCloseTo(0, 6);
    expect(back.y).toBeCloseTo(-1, 6);
  });

  it('keeps stick magnitude, clamps at 1, zero stays zero', () => {
    expect(Math.hypot(...Object.values(screenToWorldDir(0.3, 0.4)))).toBeCloseTo(0.5, 6);
    expect(Math.hypot(...Object.values(screenToWorldDir(5, 5)))).toBeCloseTo(1, 6);
    expect(screenToWorldDir(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('maps world facing to the avatar sheet direction on screen', () => {
    expect(avatarDir(1, 0)).toBe(1);
    expect(avatarDir(0, 1)).toBe(3);
    expect(avatarDir(S, S)).toBe(2);
    expect(avatarDir(-S, -S)).toBe(0);
  });

  it('floating joystick: small moves stay a tap, drags steer screen-relative', () => {
    const s = new FloatingStick();
    s.down(100, 100);
    expect(s.move(105, 103)).toBeNull();
    const v = s.move(100, 100 - STICK_RADIUS * 3)!;
    expect(v.x).toBeCloseTo(-S, 6);
    expect(v.y).toBeCloseTo(-S, 6);
    expect(s.knob.y).toBe(-STICK_RADIUS);
    expect(s.up()).toBe(true);
    s.down(0, 0);
    expect(s.up()).toBe(false);
  });
});

describe('aim assist and grab prediction', () => {
  const lv = kitchen.parseLevel(kitchen.LEVELS.diner);

  it('turns a diagonal facing toward the adjacent station', () => {
    // chef under the tomato crate (1,0), board (0,1) to its left, facing screen-up (world -1,-1)
    const pose = { x: 1.4, y: 1.3, fx: -S, fy: -S };
    const a = aimAssist(pose, lv.stations);
    expect(a).not.toBeNull();
    expect([JSON.stringify({ x: -1, y: 0 }), JSON.stringify({ x: 0, y: -1 })]).toContain(JSON.stringify(a));
    // already facing a station: no assist
    expect(aimAssist({ x: 1.5, y: 1.3, fx: 0, fy: -1 }, lv.stations)).toBeNull();
    // open floor: nothing to aim at
    expect(aimAssist({ x: 2.5, y: 2.5, fx: 1, fy: 0 }, lv.stations)).toBeNull();
  });

  it('predicts which grabs do something', () => {
    const tomato: kitchen.Item = { kind: 'ing', ing: 'tomato', chopped: false };
    const chopped: kitchen.Item = { kind: 'ing', ing: 'tomato', chopped: true };
    const st = (kind: kitchen.StationKind, extra: Partial<kitchen.Station> = {}) => ({ kind, item: null, count: 0, ing: null, ...extra });
    expect(predictGrab(st('crate', { ing: 'tomato' }), null)).toBe(true);
    expect(predictGrab(st('crate', { ing: 'tomato' }), tomato)).toBe(false);
    expect(predictGrab(st('plates', { count: 0 }), null)).toBe(false);
    expect(predictGrab(st('bin'), null)).toBe(false);
    expect(predictGrab(st('stove', { item: kitchen.emptyPot() }), chopped)).toBe(true);
    expect(predictGrab(st('stove', { item: kitchen.emptyPot() }), tomato)).toBe(false);
    expect(predictGrab(st('board'), kitchen.emptyPlate())).toBe(false);
    expect(predictGrab(st('window'), kitchen.emptyPlate())).toBe(false);
    expect(predictGrab(st('window'), { kind: 'plate', soup: 'onion', parts: [] })).toBe(true);
    expect(predictChop(st('board', { item: tomato }), null)).toBe(true);
    expect(predictChop(st('board', { item: chopped }), null)).toBe(false);
  });
});

describe('chef colours', () => {
  it('stay with the player when someone else leaves', () => {
    const roster = ['ann', 'bob', 'cat'];
    const before = chefColor('cat', roster);
    // bob drops out of the snapshot, the roster (join order) is unchanged
    expect(chefColor('cat', roster)).toBe(before);
    expect(chefColor('ann', roster)).not.toBe(chefColor('bob', roster));
    expect(chefColor('zed', [])).toBe(chefColor('zed', ['x']));
  });
});
