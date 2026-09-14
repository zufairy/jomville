import { describe, expect, it } from 'vitest';
import { LOVE_CALL_MS, LOVE_LANES, LOVE_READY_MS, LOVE_REVEAL_MS } from '@dovey/shared';
import { LoveMeter } from './loveMeter';

const any = () => true;

describe('LoveMeter', () => {
  it('matches lane heads and walks the ready -> call -> reveal -> done timeline', () => {
    const m = new LoveMeter();
    expect(m.join('boy1', 'u1', 0)).toBeNull();
    expect(m.tick(0, any)).toEqual([]); // one lane only: nobody to match
    m.join('boy2', 'u2', 0);
    m.join('girl1', 'u3', 1);
    expect(m.tick(0, any)).toEqual([{ kind: 'match', a: 'boy1', b: 'girl1' }]);
    expect(m.lanes).toEqual([['boy2'], []]);
    expect(m.tick(LOVE_READY_MS - 1, any)).toEqual([]);
    expect(m.tick(LOVE_READY_MS, any)).toEqual([{ kind: 'call', a: 'boy1', b: 'girl1' }]);
    m.vibe('boy1', { aTalk: 40, bTalk: 38, both: 6, turns: 20, n: 120 });
    const ev = m.tick(LOVE_READY_MS + LOVE_CALL_MS, any);
    expect(ev).toHaveLength(1);
    const reveal = ev[0] as { kind: string; score: number };
    expect(reveal.kind).toBe('reveal');
    expect(reveal.score).toBeGreaterThanOrEqual(1);
    expect(reveal.score).toBeLessThanOrEqual(100);
    expect(m.tick(LOVE_READY_MS + LOVE_CALL_MS + LOVE_REVEAL_MS, any)).toEqual([{ kind: 'done', a: 'boy1', b: 'girl1' }]);
    expect(m.pair).toBeNull();
  });

  it('skips people who are busy but keeps their place', () => {
    const m = new LoveMeter();
    m.join('a1', 'u1', 0);
    m.join('a2', 'u2', 0);
    m.join('b1', 'u3', 1);
    const ev = m.tick(0, (id) => id !== 'a1');
    expect(ev).toEqual([{ kind: 'match', a: 'a2', b: 'b1' }]);
    expect(m.lanes[0]).toEqual(['a1']);
  });

  it('aborts the match if someone leaves before the reveal, but not after', () => {
    const m = new LoveMeter();
    m.join('a', 'u1', 0);
    m.join('b', 'u2', 1);
    m.tick(0, any);
    expect(m.leave('b')).toEqual({ kind: 'abort', a: 'a', b: 'b', left: 'b' });
    expect(m.pair).toBeNull();
    m.requeueFront('a', 0);
    expect(m.lanes[0]).toEqual(['a']);

    m.join('c', 'u3', 1);
    m.tick(10, any);
    m.tick(10 + LOVE_READY_MS, any);
    m.tick(10 + LOVE_READY_MS + LOVE_CALL_MS, any);
    expect(m.pair?.phase).toBe('reveal');
    expect(m.leave('c')).toBeNull();
  });

  it('caps lane length and ignores vibes outside the call', () => {
    const m = new LoveMeter();
    for (let i = 0; i < LOVE_LANES[1].len; i++) expect(m.join(`p${i}`, `u${i}`, 1)).toBeNull();
    expect(m.join('late', 'ux', 1)).toBe('love_full');
    expect(m.join('p0', 'u0', 0)).toBeNull(); // switching lanes frees the old spot
    expect(m.lanes[1]).not.toContain('p0');
    m.vibe('p0', { aTalk: 1, bTalk: 1, both: 0, turns: 0, n: 2 }); // no pair: ignored, no throw
  });
});
