import { Seat, TABLE_TURN_MS, TableGameKind, TableState, applyMove, botMove, initialState, legalMoves } from '@dovey/shared';

/**
 * Table game matchmaking and play. Pure bookkeeping with an injectable clock;
 * GameRoom turns the returned events into messages, coins and emotes.
 *
 * Ways into a match: sit at both chairs of a game table, quick match from the
 * games menu, or play the house bot. Moves are validated by the shared rules.
 */

export const BOT_ID = 'bot:dovey';
const BOT_THINK_MS = [700, 1500] as const;

export interface Match {
  id: string;
  kind: TableGameKind;
  /** seat 0 and seat 1 session ids; the bot is BOT_ID */
  players: [string, string];
  state: TableState;
  /** when the player to move runs out of time */
  deadline: number;
  /** bot plays its move at this time (when it is the bot's turn) */
  botAt: number;
  rematch: [boolean, boolean];
  /** table furniture id when started by sitting down */
  table: string | null;
  /** who moved first this round, alternates on rematch */
  first: Seat;
  round: number;
  over: boolean;
}

export type TablePhase = 'idle' | 'queue' | 'waiting';

export type TableEvent =
  | { type: 'state'; match: Match }
  | { type: 'status'; to: string; phase: TablePhase; kind: TableGameKind | null }
  | { type: 'end'; to: string; reason: 'left' | 'timeout' }
  | { type: 'over'; match: Match; winner: string | null };

export const isBot = (id: string) => id === BOT_ID;

export class TableBook {
  private matches = new Map<string, Match>();
  /** session id -> match id */
  private byPlayer = new Map<string, string>();
  private queues = new Map<TableGameKind, string[]>();
  /** table id -> the one person sitting there waiting for an opponent */
  private waiting = new Map<string, { kind: TableGameKind; player: string }>();
  private n = 0;

  constructor(
    private now: () => number = Date.now,
    private rand: () => number = Math.random,
  ) {}

  matchOf(id: string): Match | undefined {
    const m = this.byPlayer.get(id);
    return m ? this.matches.get(m) : undefined;
  }

  /** tables with a match in progress, so they can light up */
  liveTables(): Set<string> {
    const out = new Set<string>();
    for (const m of this.matches.values()) if (m.table && !m.over) out.add(m.table);
    return out;
  }

  seatOf(match: Match, id: string): Seat {
    return match.players[0] === id ? 0 : 1;
  }

  // ---- getting into a match

  /** Quick match: pair with whoever is already queued for this game. */
  queue(id: string, kind: TableGameKind): TableEvent[] {
    if (this.byPlayer.has(id)) return [];
    this.unqueue(id);
    const q = this.queues.get(kind) ?? [];
    const peer = q.shift();
    this.queues.set(kind, q);
    if (peer) return this.start(kind, [peer, id], null);
    q.push(id);
    return [{ type: 'status', to: id, phase: 'queue', kind }];
  }

  cancel(id: string): TableEvent[] {
    return this.unqueue(id) ? [{ type: 'status', to: id, phase: 'idle', kind: null }] : [];
  }

  /** Practise against the house bot. */
  playBot(id: string, kind: TableGameKind): TableEvent[] {
    if (this.byPlayer.has(id)) return [];
    this.unqueue(id);
    for (const [table, w] of this.waiting) if (w.player === id) this.waiting.delete(table);
    return this.start(kind, [id, BOT_ID], null);
  }

  /**
   * Who is sitting at a table right now. Two free people start a match; one
   * waits (and is offered the bot); standing up while waiting clears it.
   */
  syncTable(table: string, kind: TableGameKind, seated: string[]): TableEvent[] {
    const free = seated.filter((id) => !this.byPlayer.has(id));
    const out: TableEvent[] = [];
    const w = this.waiting.get(table);
    if (w && !free.includes(w.player)) {
      this.waiting.delete(table);
      if (!this.byPlayer.has(w.player)) out.push({ type: 'status', to: w.player, phase: 'idle', kind: null });
    }
    if (free.length >= 2) {
      this.waiting.delete(table);
      for (const id of free) this.unqueue(id);
      return [...out, ...this.start(kind, [free[0], free[1]], table)];
    }
    if (free.length === 1 && this.waiting.get(table)?.player !== free[0]) {
      this.unqueue(free[0]);
      this.waiting.set(table, { kind, player: free[0] });
      out.push({ type: 'status', to: free[0], phase: 'waiting', kind });
    }
    return out;
  }

  // ---- playing

  move(id: string, move: number): TableEvent[] {
    const m = this.matchOf(id);
    if (!m || m.over) return [];
    return this.advance(m, applyMove(m.state, this.seatOf(m, id), move));
  }

  rematch(id: string): TableEvent[] {
    const m = this.matchOf(id);
    if (!m || !m.over) return [];
    m.rematch[this.seatOf(m, id)] = true;
    if (isBot(m.players[1])) m.rematch[1] = true;
    if (!m.rematch[0] || !m.rematch[1]) return [{ type: 'state', match: m }];
    m.first = m.first === 0 ? 1 : 0;
    m.round++;
    m.state = initialState(m.kind, m.first);
    m.rematch = [false, false];
    m.over = false;
    this.armTurn(m);
    return [{ type: 'state', match: m }];
  }

  /** Walk away from a match, a queue or a table. The other player is told. */
  leave(id: string): TableEvent[] {
    const out = this.cancel(id);
    for (const [table, w] of this.waiting) if (w.player === id) this.waiting.delete(table);
    const m = this.matchOf(id);
    if (!m) return out;
    this.close(m);
    const peer = m.players[0] === id ? m.players[1] : m.players[0];
    if (!isBot(peer)) out.push({ type: 'end', to: peer, reason: 'left' });
    return out;
  }

  /** Bot turns that are due, and turns that ran out of time (the idle player auto-moves). */
  tick(): TableEvent[] {
    const now = this.now();
    const out: TableEvent[] = [];
    for (const m of [...this.matches.values()]) {
      if (m.over) continue;
      const seat = m.state.turn;
      if (isBot(m.players[seat])) {
        if (now >= m.botAt) out.push(...this.advance(m, applyMove(m.state, seat, botMove(m.state, this.rand))));
      } else if (now >= m.deadline) {
        const moves = legalMoves(m.state);
        out.push(...this.advance(m, applyMove(m.state, seat, moves[Math.floor(this.rand() * moves.length)])));
      }
    }
    return out;
  }

  // ---- internals

  private start(kind: TableGameKind, players: [string, string], table: string | null): TableEvent[] {
    const first: Seat = this.rand() < 0.5 ? 0 : 1;
    const m: Match = {
      id: `m${(++this.n).toString(36)}`,
      kind,
      players,
      state: initialState(kind, first),
      deadline: 0,
      botAt: 0,
      rematch: [false, false],
      table,
      first,
      round: 1,
      over: false,
    };
    this.armTurn(m);
    this.matches.set(m.id, m);
    for (const id of players) if (!isBot(id)) this.byPlayer.set(id, m.id);
    return [{ type: 'state', match: m }];
  }

  private advance(m: Match, next: TableState | null): TableEvent[] {
    if (!next) return [];
    m.state = next;
    if (next.winner === null) {
      this.armTurn(m);
      return [{ type: 'state', match: m }];
    }
    m.over = true;
    const winner = next.winner === 'draw' ? null : m.players[next.winner];
    return [
      { type: 'state', match: m },
      { type: 'over', match: m, winner },
    ];
  }

  private armTurn(m: Match) {
    const now = this.now();
    m.deadline = now + TABLE_TURN_MS;
    const [lo, hi] = BOT_THINK_MS;
    m.botAt = now + lo + this.rand() * (hi - lo);
  }

  private close(m: Match) {
    this.matches.delete(m.id);
    for (const id of m.players) if (this.byPlayer.get(id) === m.id) this.byPlayer.delete(id);
  }

  private unqueue(id: string): boolean {
    let had = false;
    for (const q of this.queues.values()) {
      const i = q.indexOf(id);
      if (i >= 0) {
        q.splice(i, 1);
        had = true;
      }
    }
    return had;
  }
}
