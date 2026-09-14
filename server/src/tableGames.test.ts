import { describe, expect, it } from 'vitest';
import { TABLE_TURN_MS, legalMoves } from '@dovey/shared';
import { BOT_ID, TableBook, TableEvent } from './tableGames';

function book() {
  let t = 1000;
  const clock = { advance: (ms: number) => (t += ms) };
  // rand 0.1: seat 0 moves first, the bot thinks for the minimum time
  return { b: new TableBook(() => t, () => 0.1), clock };
}

const states = (ev: TableEvent[]) => ev.filter((e) => e.type === 'state');

describe('TableBook', () => {
  it('quick match waits for a second player of the same game', () => {
    const { b } = book();
    expect(b.queue('a', 'ttt')).toEqual([{ type: 'status', to: 'a', phase: 'queue', kind: 'ttt' }]);
    expect(b.queue('c', 'c4')[0]).toMatchObject({ phase: 'queue' });
    expect(states(b.queue('b', 'ttt'))).toHaveLength(1);
    expect(b.matchOf('a')?.players).toEqual(['a', 'b']);
    expect(b.matchOf('c')).toBeUndefined();
  });

  it('plays a game to a win and reports the winner', () => {
    const { b } = book();
    b.queue('a', 'ttt');
    b.queue('b', 'ttt');
    for (const [who, cell] of [
      ['a', 0],
      ['b', 3],
      ['a', 1],
      ['b', 4],
    ] as const)
      expect(states(b.move(who, cell))).toHaveLength(1);
    expect(b.move('b', 5)).toEqual([]); // not b's turn
    const ev = b.move('a', 2);
    expect(ev.find((e) => e.type === 'over')).toMatchObject({ winner: 'a' });
    expect(b.matchOf('a')?.over).toBe(true);
  });

  it('rematch needs both players and swaps who starts', () => {
    const { b } = book();
    b.queue('a', 'ttt');
    b.queue('b', 'ttt');
    for (const [who, cell] of [
      ['a', 0],
      ['b', 3],
      ['a', 1],
      ['b', 4],
      ['a', 2],
    ] as const)
      b.move(who, cell);
    b.rematch('a');
    expect(b.matchOf('a')?.over).toBe(true);
    b.rematch('b');
    const m = b.matchOf('a')!;
    expect(m.over).toBe(false);
    expect(m.round).toBe(2);
    expect(m.state.turn).toBe(1);
  });

  it('leaving tells the other player and frees both', () => {
    const { b } = book();
    b.queue('a', 'c4');
    b.queue('b', 'c4');
    expect(b.leave('a')).toEqual([{ type: 'end', to: 'b', reason: 'left' }]);
    expect(b.matchOf('b')).toBeUndefined();
    expect(b.queue('b', 'c4')[0]).toMatchObject({ phase: 'queue' });
  });

  it('the bot answers on tick once its thinking time passes', () => {
    const { b, clock } = book();
    b.playBot('a', 'c4');
    const m = b.matchOf('a')!;
    expect(m.players).toEqual(['a', BOT_ID]);
    b.move('a', 3);
    expect(m.state.turn).toBe(1);
    expect(b.tick()).toEqual([]);
    clock.advance(2000);
    expect(states(b.tick())).toHaveLength(1);
    expect(m.state.turn).toBe(0);
  });

  it('a player who runs out of time auto-moves', () => {
    const { b, clock } = book();
    b.queue('a', 'reversi');
    b.queue('b', 'reversi');
    const m = b.matchOf('a')!;
    clock.advance(TABLE_TURN_MS + 1);
    b.tick();
    expect(m.state.moves).toBe(1);
    expect(legalMoves(m.state).length).toBeGreaterThan(0);
  });

  it('sitting at a table: one waits, two start, standing up clears the wait', () => {
    const { b } = book();
    expect(b.syncTable('t1', 'dots', ['a'])).toEqual([{ type: 'status', to: 'a', phase: 'waiting', kind: 'dots' }]);
    expect(b.syncTable('t1', 'dots', ['a'])).toEqual([]);
    expect(b.syncTable('t1', 'dots', [])).toEqual([{ type: 'status', to: 'a', phase: 'idle', kind: null }]);
    b.syncTable('t1', 'dots', ['a']);
    expect(states(b.syncTable('t1', 'dots', ['a', 'b']))).toHaveLength(1);
    expect(b.matchOf('b')?.table).toBe('t1');
    // already playing: re-syncs start nothing new
    expect(b.syncTable('t1', 'dots', ['a', 'b'])).toEqual([]);
  });
});
