import { describe, expect, it } from 'vitest';
import { DuelBook, beats, duelSettlement } from './duel';

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

describe('staked duels', () => {
  it('the stake rides from invite to duel, default free', () => {
    let t = 0;
    const b = new DuelBook(() => t);
    expect(b.invite('a', 'b', 50)).toBeNull();
    expect(b.pending('b')).toEqual({ from: 'a', stake: 50 });
    b.invite('a', 'b', 100); // re-inviting replaces the stake
    expect(b.pending('b')).toEqual({ from: 'a', stake: 100 });
    const d = b.accept('b')!;
    expect(d).toMatchObject({ a: 'a', b: 'b', stake: 100, paid: false, users: ['', ''] });
    expect(b.pending('b')).toBeNull();
    expect(b.sideOf('a')).toBe('a');
    expect(b.sideOf('b')).toBe('b');
    expect(b.sideOf('c')).toBeNull();
    b.invite('c', 'e');
    expect(b.pending('e')).toEqual({ from: 'c', stake: 0 });
    t = 31_000;
    expect(b.pending('e')).toBeNull();
  });

  it('endless draws end at the round cap on the pick path', () => {
    const b = new DuelBook(() => 0);
    b.invite('a', 'b', 25);
    b.accept('b');
    for (let round = 1; round <= 5; round++) {
      b.pick('a', 0);
      expect(b.pick('b', 0)).toMatchObject({ winner: 'draw', score: [0, 0], done: false });
    }
    b.pick('a', 0);
    expect(b.pick('b', 0)).toMatchObject({ winner: 'draw', score: [0, 0], done: true });
    expect(b.get('a')).toBeUndefined();
  });

  it('idle duels end at the round cap on the sweep path', () => {
    let t = 0;
    const b = new DuelBook(() => t);
    b.invite('a', 'b');
    const d = b.accept('b')!;
    let last = null;
    for (let i = 0; i < 6; i++) {
      t += 21_000;
      const swept = b.sweep();
      expect(swept.length).toBe(1);
      last = swept[0].result;
    }
    expect(last).toMatchObject({ winner: 'draw', score: [0, 0], done: true });
    expect(d.round).toBe(7);
    expect(b.get('b')).toBeUndefined();
  });

  it('settles a staked win: winner takes the pot, logged', () => {
    expect(duelSettlement({ stake: 50, paid: true }, { kind: 'done', score: [2, 1] })).toEqual({
      outcome: 'win',
      winner: 'a',
      credits: [{ side: 'a', amount: 100 }],
      log: true,
    });
  });

  it('settles a free win with the house reward, not logged', () => {
    expect(duelSettlement({ stake: 0, paid: false }, { kind: 'done', score: [0, 2] })).toEqual({
      outcome: 'win',
      winner: 'b',
      credits: [{ side: 'b', amount: 25 }],
      log: false,
    });
  });

  it('a draw at the cap refunds both stakes', () => {
    expect(duelSettlement({ stake: 250, paid: true }, { kind: 'done', score: [1, 1] })).toEqual({
      outcome: 'draw',
      winner: null,
      credits: [
        { side: 'a', amount: 250 },
        { side: 'b', amount: 250 },
      ],
      log: true,
    });
    expect(duelSettlement({ stake: 0, paid: false }, { kind: 'done', score: [0, 0] })).toEqual({ outcome: 'draw', winner: null, credits: [], log: false });
  });

  it('a forfeit or leave hands the pot to whoever stayed', () => {
    expect(duelSettlement({ stake: 100, paid: true }, { kind: 'forfeit', quitter: 'a' })).toEqual({
      outcome: 'forfeit',
      winner: 'b',
      credits: [{ side: 'b', amount: 200 }],
      log: true,
    });
    expect(duelSettlement({ stake: 25, paid: true }, { kind: 'left', quitter: 'b' })).toEqual({
      outcome: 'left',
      winner: 'a',
      credits: [{ side: 'a', amount: 50 }],
      log: true,
    });
    // free duels pay nothing for a walkout
    expect(duelSettlement({ stake: 0, paid: false }, { kind: 'left', quitter: 'b' })).toEqual({ outcome: 'left', winner: 'a', credits: [], log: false });
  });

  it('a staked duel whose stakes never reached escrow moves no coins', () => {
    expect(duelSettlement({ stake: 50, paid: false }, { kind: 'left', quitter: 'a' })).toEqual({ outcome: 'left', winner: 'b', credits: [], log: false });
    expect(duelSettlement({ stake: 50, paid: false }, { kind: 'done', score: [2, 0] })).toEqual({ outcome: 'win', winner: 'a', credits: [], log: false });
  });
});
