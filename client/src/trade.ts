import { create } from 'zustand';
import type { Offer, TradeDoneMsg, TradeStateMsg } from '@dovey/shared';
import { fetchInventory } from './api';
import { useAppStore } from './store';
import { type TradeView, flashKeys, markChanged, sameOffer, toOffer } from './tradeLogic';

/**
 * Trade window client state, kept out of the main store like table games.
 * The server is authoritative; this mirrors t_state and remembers when each
 * slot last changed so the window can flash last-second swaps.
 */
export type TradePhase = 'idle' | 'waiting' | 'incoming' | 'open';

interface TradeStore {
  phase: TradePhase;
  peer: string;
  handle: string;
  view: TradeView | null;
  changedAt: Record<string, number>;
  /** I pressed Confirm and wait for the other side */
  confirmed: boolean;
  /** my last sent offer the server has not echoed yet, so quick taps build on it */
  draft: Offer | null;
  setWaiting: (peer: string, handle: string) => void;
  setIncoming: (peer: string, handle: string) => void;
  applyState: (m: TradeStateMsg, now: number) => void;
  markConfirmed: () => void;
  reset: () => void;
}

const IDLE = { phase: 'idle' as TradePhase, peer: '', handle: '', view: null, changedAt: {}, confirmed: false, draft: null as Offer | null };

export const useTrade = create<TradeStore>((set, get) => ({
  ...IDLE,
  setWaiting: (peer, handle) => set({ ...IDLE, phase: 'waiting', peer, handle }),
  setIncoming: (peer, handle) => {
    if (get().phase === 'open') return; // the server refuses a second trade anyway
    set({ ...IDLE, phase: 'incoming', peer, handle });
  },
  applyState: (m, now) =>
    set((s) => {
      const keys = s.view ? [...flashKeys(s.view.you, m.you, 'you'), ...flashKeys(s.view.them, m.them, 'them')] : [];
      const both = m.acceptedYou && m.acceptedThem;
      return {
        phase: 'open',
        peer: m.partner.id,
        handle: m.partner.handle,
        view: {
          partner: m.partner,
          you: m.you,
          them: m.them,
          acceptedYou: m.acceptedYou,
          acceptedThem: m.acceptedThem,
          confirmEndsAt: m.confirmAt === null ? null : now + m.confirmAt,
        },
        changedAt: markChanged(s.changedAt, keys, now),
        confirmed: both ? s.confirmed : false,
        draft: s.draft && !sameOffer(s.draft, toOffer(m.you)) ? s.draft : null,
      };
    }),
  markConfirmed: () => set({ confirmed: true }),
  reset: () => set({ ...IDLE }),
}));

type Send = (type: string, data?: unknown) => void;
let send: Send | null = null;

export function bindTradeSender(fn: Send | null) {
  send = fn;
}

export const trade = {
  invite: (peer: string, handle: string) => {
    send?.('t_invite', { id: peer });
    useTrade.getState().setWaiting(peer, handle);
  },
  respond: (ok: boolean) => {
    send?.('t_respond', { ok });
    if (!ok) useTrade.getState().reset();
  },
  offer: (o: Offer) => {
    send?.('t_offer', o);
    useTrade.setState({ draft: o });
  },
  accept: () => send?.('t_accept'),
  confirm: () => {
    send?.('t_confirm');
    useTrade.getState().markConfirmed();
  },
  cancel: () => {
    send?.('t_cancel');
    useTrade.getState().reset();
  },
  report: (note?: string) => send?.('t_report', note ? { note } : {}),
};

export const TRADE_DONE_TEXT: Record<string, string> = {
  ok: '🤝 trade complete',
  cancelled: 'trade cancelled',
  declined: 'they passed on the trade',
  expired: 'trade request expired',
  left: 'they left the trade',
  idle: 'trade closed after 5 quiet minutes',
  reported: 'trade cancelled and reported. a moderator will look at it',
  trade_busy: 'they are already trading',
  peer_gone: 'they left',
  not_owned: 'trade failed: an item moved. nothing changed',
  insufficient_coins: 'trade failed: not enough coins. nothing changed',
  insufficient_items: 'trade failed: items missing. nothing changed',
  bad_offer: 'trade failed. nothing changed',
  trade_failed: 'trade failed. nothing changed',
};

// ---- server message handlers; registered inside Net.join() so they survive rejoins

export function onTradeIncoming(m: { from: string; handle: string }) {
  useTrade.getState().setIncoming(m.from, m.handle);
}

export function onTradeWaiting(m: { to: string }) {
  const s = useTrade.getState();
  if (s.phase === 'idle') s.setWaiting(m.to, '');
}

export function onTradeState(m: TradeStateMsg) {
  useTrade.getState().applyState(m, performance.now());
}

/** Every t_done re-fetches inventory: there is no server push, and stale offers must not linger. */
export async function onTradeDone(m: TradeDoneMsg) {
  const s = useTrade.getState();
  // news about some other invite (withdrawn, expired, declined) must not close this window
  if (m.with && s.phase !== 'idle' && s.peer && m.with !== s.peer) return;
  s.reset();
  useAppStore.getState().flash(m.ok ? TRADE_DONE_TEXT.ok : (TRADE_DONE_TEXT[m.code ?? ''] ?? 'trade closed'));
  const inv = await fetchInventory();
  if (!inv) return;
  const st = useAppStore.getState();
  st.setCoins(inv.coins);
  st.setInventory(inv.items);
  st.setInstances(inv.instances);
}

const OFFER_REFUSALS = new Set(['bad_offer', 'insufficient_coins', 'insufficient_items', 'not_owned', 'trade_locked', 'rate_limited', 'no_trade']);

/** While trading, some shared sys codes mean something trade-specific. */
const TRADE_SYS_TEXT: Record<string, string> = {
  not_owned: "that item isn't yours to trade anymore",
  no_such_player: "they're not here",
  blocked_pair: "you can't trade with someone you blocked",
  peer_gone: "they're not here",
};

/** Toast text for a sys code while a trade invite or window is active; null otherwise. */
export function tradeSysText(code: string): string | null {
  const { phase } = useTrade.getState();
  if (phase !== 'waiting' && phase !== 'open') return null;
  return TRADE_SYS_TEXT[code] ?? null;
}

const INVITE_REFUSALS = new Set(['no_such_player', 'trade_busy', 'blocked_pair', 'too_new', 'trade_off', 'rate_limited']);

/** sys codes that change trade UI state (the text itself is flashed by net.ts). */
export function onTradeSys(code: string) {
  const s = useTrade.getState();
  if (s.phase === 'waiting' && INVITE_REFUSALS.has(code)) s.reset();
  if (s.phase === 'open' && (code === 'too_early' || code === 'not_accepted')) useTrade.setState({ confirmed: false });
  if (s.phase === 'open' && OFFER_REFUSALS.has(code)) useTrade.setState({ draft: null });
}
