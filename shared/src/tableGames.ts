/**
 * Table games: two-player, turn-based mini games played at the Game Den tables
 * (or anywhere via quick match). Pure rules + a light bot, shared so the
 * server stays authoritative and the client can show legal-move hints.
 */

export type TableGameKind = 'c4' | 'ttt' | 'reversi' | 'dots';
export const TABLE_GAME_KINDS: TableGameKind[] = ['c4', 'ttt', 'reversi', 'dots'];

export const TABLE_GAMES: Record<TableGameKind, { name: string; icon: string; blurb: string }> = {
  c4: { name: 'Connect Four', icon: '🔴', blurb: 'drop discs, line up four' },
  ttt: { name: 'Tic-Tac-Toe', icon: '❌', blurb: 'three in a row wins' },
  reversi: { name: 'Reversi', icon: '⚫', blurb: 'flank to flip, own the board' },
  dots: { name: 'Dots & Boxes', icon: '🟦', blurb: 'close a box, go again' },
};

export const TABLE_TURN_MS = 30_000;
export const TABLE_REWARD = 15;
export const TABLE_BOT_REWARD = 5;

export const C4_COLS = 7;
export const C4_ROWS = 6;
export const REV_N = 8;
/** boxes per side; dots are (N+1) x (N+1) */
export const DOTS_N = 4;
const DOTS_H = (DOTS_N + 1) * DOTS_N;
export const DOTS_EDGES = DOTS_H + DOTS_N * (DOTS_N + 1);

export type Seat = 0 | 1;

export interface TableState {
  kind: TableGameKind;
  /** cells (c4 7x6 row 0 on top, ttt 3x3, reversi 8x8) or boxes (dots 4x4): -1 empty, else the owning seat */
  board: number[];
  /** dots only: who drew each edge, -1 undrawn */
  edges: number[];
  turn: Seat;
  winner: Seat | 'draw' | null;
  /** index of the last move (cell or edge), -1 before the first */
  last: number;
  /** cells flipped by the last move (reversi) or boxes it closed (dots) */
  changed: number[];
  /** winning cells to highlight (c4, ttt) */
  line: number[];
  /** discs (reversi) or boxes (dots) per seat */
  score: [number, number];
  moves: number;
}

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

export function initialState(kind: TableGameKind, first: Seat = 0): TableState {
  const base = { kind, edges: [] as number[], turn: first, winner: null, last: -1, changed: [], line: [], score: [0, 0] as [number, number], moves: 0 };
  if (kind === 'c4') return { ...base, board: Array(C4_COLS * C4_ROWS).fill(-1) };
  if (kind === 'ttt') return { ...base, board: Array(9).fill(-1) };
  if (kind === 'dots') return { ...base, board: Array(DOTS_N * DOTS_N).fill(-1), edges: Array(DOTS_EDGES).fill(-1) };
  const board = Array(REV_N * REV_N).fill(-1);
  const m = REV_N / 2;
  board[(m - 1) * REV_N + (m - 1)] = 1;
  board[m * REV_N + m] = 1;
  board[(m - 1) * REV_N + m] = 0;
  board[m * REV_N + (m - 1)] = 0;
  return { ...base, board, score: [2, 2] };
}

// ---- tic-tac-toe

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// ---- connect four

function c4Drop(board: number[], col: number): number {
  for (let r = C4_ROWS - 1; r >= 0; r--) if (board[r * C4_COLS + col] === -1) return r * C4_COLS + col;
  return -1;
}

function c4Line(board: number[], cell: number): number[] {
  const seat = board[cell];
  const r0 = Math.floor(cell / C4_COLS);
  const c0 = cell % C4_COLS;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const run = [cell];
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r * C4_COLS + c] === seat) {
        run.push(r * C4_COLS + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (run.length >= 4) return run;
  }
  return [];
}

// ---- reversi

export function reversiFlips(board: number[], cell: number, seat: number): number[] {
  if (board[cell] !== -1) return [];
  const r0 = Math.floor(cell / REV_N);
  const c0 = cell % REV_N;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const run: number[] = [];
      let r = r0 + dr;
      let c = c0 + dc;
      while (r >= 0 && r < REV_N && c >= 0 && c < REV_N && board[r * REV_N + c] === 1 - seat) {
        run.push(r * REV_N + c);
        r += dr;
        c += dc;
      }
      if (run.length && r >= 0 && r < REV_N && c >= 0 && c < REV_N && board[r * REV_N + c] === seat) out.push(...run);
    }
  return out;
}

function reversiMoves(board: number[], seat: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) if (reversiFlips(board, i, seat).length) out.push(i);
  return out;
}

// ---- dots & boxes

/** the four edge indices around box (r, c): top, bottom, left, right */
export function boxEdges(r: number, c: number): [number, number, number, number] {
  return [r * DOTS_N + c, (r + 1) * DOTS_N + c, DOTS_H + r * (DOTS_N + 1) + c, DOTS_H + r * (DOTS_N + 1) + c + 1];
}

/** boxes (as board indices) that touch an edge */
export function edgeBoxes(edge: number): number[] {
  const out: number[] = [];
  if (edge < DOTS_H) {
    const r = Math.floor(edge / DOTS_N);
    const c = edge % DOTS_N;
    if (r > 0) out.push((r - 1) * DOTS_N + c);
    if (r < DOTS_N) out.push(r * DOTS_N + c);
  } else {
    const e = edge - DOTS_H;
    const r = Math.floor(e / (DOTS_N + 1));
    const c = e % (DOTS_N + 1);
    if (c > 0) out.push(r * DOTS_N + c - 1);
    if (c < DOTS_N) out.push(r * DOTS_N + c);
  }
  return out;
}

function boxSides(edges: number[], box: number): number {
  return boxEdges(Math.floor(box / DOTS_N), box % DOTS_N).filter((e) => edges[e] !== -1).length;
}

// ---- moves

export function legalMoves(s: TableState): number[] {
  if (s.winner !== null) return [];
  if (s.kind === 'ttt') return s.board.flatMap((v, i) => (v === -1 ? [i] : []));
  if (s.kind === 'c4') return [...Array(C4_COLS).keys()].filter((c) => s.board[c] === -1);
  if (s.kind === 'dots') return s.edges.flatMap((v, i) => (v === -1 ? [i] : []));
  return reversiMoves(s.board, s.turn);
}

/** Apply a move for `seat`. Returns the next state, or null if it isn't their turn or the move is illegal. */
export function applyMove(s: TableState, seat: Seat, move: number): TableState | null {
  if (s.winner !== null || s.turn !== seat || !Number.isInteger(move)) return null;
  if (!legalMoves(s).includes(move)) return null;
  const board = [...s.board];
  const next: TableState = { ...s, board, edges: [...s.edges], changed: [], line: [], moves: s.moves + 1, last: move, score: [s.score[0], s.score[1]] };

  if (s.kind === 'ttt') {
    board[move] = seat;
    next.line = TTT_LINES.find((l) => l.every((i) => board[i] === seat)) ?? [];
    if (next.line.length) next.winner = seat;
    else if (board.every((v) => v !== -1)) next.winner = 'draw';
    next.turn = other(seat);
    return next;
  }

  if (s.kind === 'c4') {
    const cell = c4Drop(board, move);
    board[cell] = seat;
    next.last = cell;
    next.line = c4Line(board, cell);
    if (next.line.length) next.winner = seat;
    else if (board.every((v) => v !== -1)) next.winner = 'draw';
    next.turn = other(seat);
    return next;
  }

  if (s.kind === 'reversi') {
    const flips = reversiFlips(board, move, seat);
    board[move] = seat;
    for (const f of flips) board[f] = seat;
    next.changed = flips;
    next.score = [board.filter((v) => v === 0).length, board.filter((v) => v === 1).length];
    const them = other(seat);
    if (reversiMoves(board, them).length) next.turn = them;
    else if (reversiMoves(board, seat).length) next.turn = seat; // they have to pass
    else next.winner = next.score[0] === next.score[1] ? 'draw' : next.score[0] > next.score[1] ? 0 : 1;
    return next;
  }

  // dots: closing a box scores it and earns another turn
  next.edges[move] = seat;
  for (const b of edgeBoxes(move)) {
    if (board[b] === -1 && boxSides(next.edges, b) === 4) {
      board[b] = seat;
      next.changed.push(b);
      next.score[seat]++;
    }
  }
  if (next.edges.every((e) => e !== -1)) next.winner = next.score[0] === next.score[1] ? 'draw' : next.score[0] > next.score[1] ? 0 : 1;
  next.turn = next.changed.length ? seat : other(seat);
  return next;
}

// ---- bot

const pick = <T>(xs: T[], rand: () => number): T => xs[Math.floor(rand() * xs.length) % xs.length];

/** A friendly opponent: takes wins, blocks obvious threats, otherwise plays sensibly with a little randomness. */
export function botMove(s: TableState, rand: () => number = Math.random): number {
  const moves = legalMoves(s);
  if (!moves.length) return -1;
  const me = s.turn;
  const them = other(me);
  const winsFor = (state: TableState, seat: Seat, m: number) => applyMove({ ...state, turn: seat }, seat, m)?.winner === seat;

  if (s.kind === 'ttt' || s.kind === 'c4') {
    const win = moves.find((m) => winsFor(s, me, m));
    if (win !== undefined) return win;
    const block = moves.find((m) => winsFor(s, them, m));
    if (block !== undefined && rand() < 0.9) return block;
    if (s.kind === 'ttt') {
      if (moves.includes(4) && rand() < 0.7) return 4;
      const corners = moves.filter((m) => [0, 2, 6, 8].includes(m));
      if (corners.length && rand() < 0.6) return pick(corners, rand);
      return pick(moves, rand);
    }
    // connect four: don't set up their win right above our disc; lean toward the centre
    const safe = moves.filter((m) => {
      const t = applyMove(s, me, m);
      return !!t && !legalMoves(t).some((n) => winsFor(t, them, n));
    });
    const pool = safe.length ? safe : moves;
    return pick(
      pool.flatMap((m) => Array(4 - Math.abs(3 - m)).fill(m) as number[]),
      rand,
    );
  }

  if (s.kind === 'reversi') {
    const N = REV_N;
    const corners = moves.filter((m) => [0, N - 1, N * (N - 1), N * N - 1].includes(m));
    if (corners.length) return pick(corners, rand);
    // squares that hand over a corner
    const risky = new Set([1, N, N + 1, N - 2, 2 * N - 1, 2 * N - 2, N * (N - 2), N * (N - 2) + 1, N * (N - 1) + 1, N * (N - 1) - 1, N * (N - 1) - 2, N * N - 2]);
    const scored = moves.map((m) => ({ m, v: reversiFlips(s.board, m, me).length + rand() * 2 - (risky.has(m) ? 4 : 0) }));
    scored.sort((a, b) => b.v - a.v);
    return scored[0].m;
  }

  // dots: close boxes, avoid drawing a box's third side
  const closing = moves.filter((m) => edgeBoxes(m).some((b) => s.board[b] === -1 && boxSides(s.edges, b) === 3));
  if (closing.length) return pick(closing, rand);
  const safe = moves.filter((m) => edgeBoxes(m).every((b) => boxSides(s.edges, b) < 2));
  return pick(safe.length ? safe : moves, rand);
}
