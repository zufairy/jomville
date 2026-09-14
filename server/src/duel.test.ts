import { describe, expect, it } from 'vitest';
import { DuelBook, beats } from './duel';

describe('duel', () => {
  it('rps rules', () => {
    expect(beats(0, 2)).toBe(1); // rock beats scissors
    expect(beats(1, 0)).toBe(1); // paper beats rock
    expect(beats(2, 1)).toBe(1); // scissors beats paper
    expect(beats(2, 0)).toBe(-1);
    expect(beats(1, 1)).toBe(0);
  });

  it('invite, accept, best of three', () => {
    let t = 0;
    const b = new DuelBook(() => t);
    expect(b.invite('a', 'a')).toBe('bad_request');
    expect(b.invite('a', 'b')).toBeNull();
    expect(b.invite('c', 'b')).toBe('busy_peer');
    const d = b.accept('b')!;
    expect(d.a).toBe('a');
    expect(b.invite('c', 'a')).toBe('busy');
    expect(b.pick('a', 0)).toBe('waiting');
    expect(b.pick('a', 1)).toBe('waiting'); // can't change
    const r1 = b.pick('b', 2); // a rock vs b scissors
    expect(r1).toMatchObject({ winner: 'a', score: [1, 0], done: false });
    b.pick('b', 1);
    expect(b.pick('a', 1)).toMatchObject({ winner: 'draw', score: [1, 0] });
    b.pick('a', 2);
    const r3 = b.pick('b', 1); // a scissors vs b paper
    expect(r3).toMatchObject({ winner: 'a', score: [2, 0], done: true });
    expect(b.get('a')).toBeUndefined();
    expect(b.get('b')).toBeUndefined();
  });

  it('expired invites and pick timeouts', () => {
    let t = 0;
    const b = new DuelBook(() => t);
    b.invite('a', 'b');
    t = 31_000;
    expect(b.accept('b')).toBeNull();
    b.invite('a', 'b');
    const d = b.accept('b')!;
    b.pick('a', 0);
    t += 21_000;
    const swept = b.sweep();
    expect(swept.length).toBe(1);
    expect(swept[0].result).toMatchObject({ winner: 'a', score: [1, 0], done: false });
    expect(d.round).toBe(2);
    expect(b.end('a')).toBe('b');
    expect(b.end('a')).toBeNull();
  });
});
