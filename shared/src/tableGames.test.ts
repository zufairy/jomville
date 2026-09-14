import { describe, expect, it } from 'vitest';
import { C4_COLS, DOTS_EDGES, Seat, TABLE_GAME_KINDS, TableState, applyMove, boxEdges, botMove, initialState, legalMoves } from './tableGames';

function play(s: TableState, moves: number[]): TableState {
  for (const m of moves) {
    const next = applyMove(s, s.turn, m);
    if (!next) throw new Error(`illegal ${m} at move ${s.moves}`);
    s = next;
  }
  return s;
}

/** tiny seeded PRNG so playouts are repeatable */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('table games', () => {
  it('starts with the right number of legal moves', () => {
    expect(legalMoves(initialState('ttt'))).toHaveLength(9);
    expect(legalMoves(initialState('c4'))).toHaveLength(C4_COLS);
    expect(legalMoves(initialState('reversi'))).toHaveLength(4);
    expect(legalMoves(initialState('dots'))).toHaveLength(DOTS_EDGES);
  });

  it('rejects moves out of turn and illegal moves', () => {
    const s = initialState('ttt');
    expect(applyMove(s, 1, 0)).toBeNull();
    const t = applyMove(s, 0, 4)!;
    expect(applyMove(t, 1, 4)).toBeNull();
    expect(applyMove(t, 1, 99)).toBeNull();
  });

  it('tic-tac-toe: diagonal win highlights the line', () => {
    const s = play(initialState('ttt'), [0, 1, 4, 2, 8]);
    expect(s.winner).toBe(0);
    expect(s.line).toEqual([0, 4, 8]);
    expect(legalMoves(s)).toEqual([]);
  });

  it('tic-tac-toe: full board without a line is a draw', () => {
    expect(play(initialState('ttt'), [0, 1, 2, 4, 3, 5, 7, 6, 8]).winner).toBe('draw');
  });

  it('connect four: discs stack and four in a column wins', () => {
    const s = play(initialState('c4'), [3, 4, 3, 4, 3, 4, 3]);
    expect(s.winner).toBe(0);
    expect(s.line).toHaveLength(4);
    const full = play(initialState('c4'), [0, 0, 0, 0, 0, 0]);
    expect(legalMoves(full)).not.toContain(0);
  });

  it('reversi: an opening move flips one disc and passes the turn', () => {
    const s0 = initialState('reversi');
    const s = applyMove(s0, 0, legalMoves(s0)[0])!;
    expect(s.changed).toHaveLength(1);
    expect(s.score).toEqual([4, 1]);
    expect(s.turn).toBe(1);
  });

  it('dots & boxes: closing a box scores and keeps the turn', () => {
    const [t, b, l, r] = boxEdges(0, 0);
    let s = play(initialState('dots'), [t, b, l]);
    expect(s.turn).toBe(1);
    s = applyMove(s, 1, r)!;
    expect(s.board[0]).toBe(1);
    expect(s.score).toEqual([0, 1]);
    expect(s.turn).toBe(1);
  });

  for (const kind of TABLE_GAME_KINDS) {
    it(`${kind}: bot vs random always plays legal moves to a finished game`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const rand = rng(seed);
        let s = initialState(kind, (seed % 2) as Seat);
        let guard = 0;
        while (s.winner === null && guard++ < 200) {
          const moves = legalMoves(s);
          const m = s.turn === 0 ? botMove(s, rand) : moves[Math.floor(rand() * moves.length)];
          const next = applyMove(s, s.turn, m);
          expect(next, `${kind} seed ${seed} move ${m}`).not.toBeNull();
          s = next!;
        }
        expect(s.winner).not.toBeNull();
      }
    });
  }

  it('bot takes an immediate win and blocks one', () => {
    const win = play(initialState('ttt'), [0, 3, 1, 4]);
    expect(botMove(win, () => 0.99)).toBe(2);
    const block = play(initialState('c4'), [0, 3, 1, 3, 6, 3]);
    expect(botMove(block, () => 0.1)).toBe(3);
  });
});
