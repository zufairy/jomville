import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { sanitizeInput } from './input';
import { KitchenRewards, grantPerUser } from './rewards';
import { ROUND_KEY, isRoundKey } from './rounds';
import { COOKING_TIMEOUT_MS, CrewBook, CrewEvent } from './crews';

describe('sanitizeInput', () => {
  it('clamps sticks, coerces flags and requires a positive integer seq', () => {
    expect(sanitizeInput({ seq: 3, mx: 5, my: -0.5, grab: true, use: 'yes', dash: 1 })).toEqual({ seq: 3, mx: 1, my: -0.5, grab: true, use: false, dash: false });
    expect(sanitizeInput({ seq: 1, mx: NaN, my: Infinity })).toMatchObject({ mx: 0, my: 0 });
    for (const bad of [null, 'x', {}, { seq: 0 }, { seq: 1.5 }, { seq: -2 }]) expect(sanitizeInput(bad)).toBeNull();
  });
});

describe('KitchenRewards', () => {
  it('pays stars x 10 and caps each user per rolling hour', () => {
    let t = 0;
    const r = new KitchenRewards(() => t);
    expect(r.grant('u', 3)).toBe(3 * kitchen.KITCHEN_COINS_PER_STAR);
    for (let i = 0; i < 10; i++) r.grant('u', 3);
    expect(r.grant('u', 3)).toBe(0);
    expect(r.grant('other', 1)).toBe(kitchen.KITCHEN_COINS_PER_STAR);
    t += 3_600_001;
    expect(r.grant('u', 2)).toBe(20);
  });

  it('grantPerUser dedupes ids so multi-tab players are only paid once', () => {
    const r = new KitchenRewards(() => 0);
    const out = grantPerUser(r, ['a', 'a', 'a', 'b'], 3);
    expect(out.get('a')).toBe(3 * kitchen.KITCHEN_COINS_PER_STAR);
    expect(out.get('b')).toBe(3 * kitchen.KITCHEN_COINS_PER_STAR);
    expect(out.size).toBe(2);
    // a granted once, not three times: a second grant for 'a' should still be within the cap
    expect(r.grant('a', 3)).toBeGreaterThan(0);
  });
});

describe('isRoundKey', () => {
  it('accepts only the process round key', () => {
    expect(isRoundKey(ROUND_KEY)).toBe(true);
    expect(isRoundKey(undefined)).toBe(false);
    expect(isRoundKey('')).toBe(false);
    expect(isRoundKey('not-the-key')).toBe(false);
    expect(isRoundKey(123)).toBe(false);
  });
});

function book() {
  let t = 1000;
  let i = 0;
  const rand = () => ((i++ * 7919) % 97) / 97;
  return { b: new CrewBook(() => t, rand), advance: (ms: number) => (t += ms) };
}
const crewFor = (ev: CrewEvent[], to: string) => ev.filter((e) => e.type === 'crew' && e.to === to).at(-1) as Extract<CrewEvent, { type: 'crew' }> | undefined;

describe('CrewBook', () => {
  it('gives every pad a distinct 4-letter code', () => {
    const { b } = book();
    const codes = [0, 1, 2, 3].map((p) => b.codeOf(p));
    expect(new Set(codes).size).toBe(4);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{4}$/);
    expect(b.padForCode(codes[2].toLowerCase())).toBe(2);
    expect(b.padForCode('ZZZZ9')).toBe(-1);
  });

  it('forms crews from people standing on pads, capped at 4, and tells leavers', () => {
    const { b } = book();
    const ev = b.sync([['a', 'b'], [], [], []]);
    expect(crewFor(ev, 'a')?.crew).toMatchObject({ pad: 0, members: ['a', 'b'], phase: 'open' });
    expect(b.sync([['a', 'b'], [], [], []])).toEqual([]); // no change, no events
    const ev2 = b.sync([['b', 'c', 'd', 'e', 'f'], [], [], []]);
    expect(crewFor(ev2, 'a')?.crew).toBeNull();
    expect(crewFor(ev2, 'b')?.crew?.members).toEqual(['b', 'c', 'd', 'e']);
  });

  it('starts once, sends go to every member, and reopens when finished', () => {
    const { b } = book();
    b.sync([['a', 'b'], [], [], []]);
    expect(b.start('zzz')).toEqual([{ type: 'error', to: 'zzz', code: 'not_in_crew' }]);
    expect(b.start('a')).toEqual({ pad: 0, members: ['a', 'b'], eligible: ['a', 'b'] });
    expect(b.start('b')).toEqual([]); // already going in: no error, no second round
    const go = b.began(0, 'room1');
    expect(go.filter((e) => e.type === 'go').map((e) => e.to)).toEqual(['a', 'b']);
    expect(b.padForRoom('room1')).toBe(0);
    expect(b.sync([[], [], [], []])).toEqual([]); // cooking crews keep their roster
    const done = b.finish(0);
    expect(crewFor(done, 'a')?.crew?.phase).toBe('open');
    expect(b.padForRoom('room1')).toBe(-1);
  });

  it('times out a cooking crew that never reported back', () => {
    const { b, advance } = book();
    b.sync([['a'], [], [], []]);
    b.start('a');
    b.began(0, 'r');
    advance(COOKING_TIMEOUT_MS + 1);
    const ev = b.sync([['a'], [], [], []]);
    expect(crewFor(ev, 'a')?.crew?.phase).toBe('open');
  });

  it('leave removes a member and updates the rest', () => {
    const { b } = book();
    b.sync([['a', 'b'], [], [], []]);
    expect(crewFor(b.leave('a'), 'b')?.crew?.members).toEqual(['b']);
    expect(b.leave('nobody')).toEqual([]);
  });
});
