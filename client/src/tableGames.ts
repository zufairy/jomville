import { create } from 'zustand';
import { Seat, TableGameKind, TableState } from '@dovey/shared';

/**
 * Table games client state (Game Den boards). Kept out of the main store like
 * the Love Meter: only table-game messages touch it. The server is
 * authoritative; this mirrors the match and keeps the previous board so the
 * UI can animate what changed.
 */

export interface TableMatchView {
  id: string;
  kind: TableGameKind;
  you: Seat;
  names: [string, string];
  /** sessionId per seat ('' for the bot), for portraits */
  seats: [string, string];
  state: TableState;
  /** performance.now() deadline for the player to move */
  turnEndsAt: number;
  rematch: [boolean, boolean];
  bot: boolean;
  round: number;
  over: boolean;
  table: string | null;
}

export type TablePhase = 'idle' | 'menu' | 'queue' | 'waiting' | 'playing';

interface TableStore {
  phase: TablePhase;
  kind: TableGameKind | null;
  match: TableMatchView | null;
  /** board before the latest update, for drop/flip animations */
  prev: TableState | null;
  /** why the last match ended early ("left"), shown briefly */
  ended: string | null;
  openMenu: () => void;
  close: () => void;
  setStatus: (phase: 'idle' | 'queue' | 'waiting', kind: TableGameKind | null) => void;
  setMatch: (m: TableMatchView) => void;
  end: (reason: string) => void;
  reset: () => void;
}

export const useTables = create<TableStore>((set, get) => ({
  phase: 'idle',
  kind: null,
  match: null,
  prev: null,
  ended: null,
  openMenu: () => {
    if (get().phase === 'idle') set({ phase: 'menu', ended: null });
  },
  close: () => set({ phase: 'idle', kind: null, match: null, prev: null }),
  setStatus: (phase, kind) => {
    // a live match wins over late status pings
    const m = get().match;
    if (get().phase === 'playing' && m && !m.over) return;
    set({ phase, kind, ...(phase === 'idle' ? { match: null, prev: null } : {}) });
  },
  setMatch: (m) => {
    const cur = get().match;
    const prev = cur && cur.id === m.id && cur.round === m.round ? cur.state : null;
    set({ phase: 'playing', kind: m.kind, match: m, prev, ended: null });
  },
  end: (reason) => set({ phase: 'idle', kind: null, match: null, prev: null, ended: reason }),
  reset: () => set({ phase: 'idle', kind: null, match: null, prev: null, ended: null }),
}));

type Send = (type: string, data?: unknown) => void;
let send: Send | null = null;

export function bindTableSender(fn: Send | null) {
  send = fn;
}

export const tables = {
  queue: (kind: TableGameKind) => send?.('tg_queue', { kind }),
  bot: (kind: TableGameKind) => send?.('tg_bot', { kind }),
  cancel: () => {
    send?.('tg_cancel');
    useTables.getState().close();
  },
  move: (move: number) => send?.('tg_move', { move }),
  rematch: () => send?.('tg_rematch'),
  leave: () => {
    send?.('tg_leave');
    useTables.getState().close();
  },
};

/** Server message handlers; registered inside Net.join() so they survive rejoins. */
export function onTableState(m: Omit<TableMatchView, 'turnEndsAt'> & { turnLeft: number }) {
  useTables.getState().setMatch({ ...m, turnEndsAt: performance.now() + m.turnLeft });
}

export function onTableStatus(m: { phase: 'idle' | 'queue' | 'waiting'; kind: TableGameKind | null }) {
  useTables.getState().setStatus(m.phase, m.kind);
}

export function onTableEnd(m: { reason: string }) {
  useTables.getState().end(m.reason);
}
