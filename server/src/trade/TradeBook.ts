import { TRADE_CONFIRM_DELAY_MS, TRADE_IDLE_MS, TRADE_INVITE_TTL_MS, type Offer } from '@dovey/shared';

/**
 * Trade invites and open trade windows inside one room. Pure state with an
 * injectable clock; TradeController does the messaging and the database.
 * Keys are Colyseus session ids.
 */
export interface TradeSide {
  id: string;
  offer: Offer;
  accepted: boolean;
  confirmed: boolean;
}

export interface Trade {
  /** the inviter */
  a: TradeSide;
  b: TradeSide;
  /** clock time Confirm unlocks; null until both accepted */
  confirmAt: number | null;
  touchedAt: number;
  /** both confirmed; the database transaction is running */
  executing: boolean;
}

export type RespondResult = { kind: 'start'; trade: Trade } | { kind: 'declined' | 'expired' | 'busy'; from: string };
export type ConfirmResult = 'no_trade' | 'not_accepted' | 'too_early' | 'waiting' | 'execute';

export class TradeBook {
  /** keyed by invitee */
  private invites = new Map<string, { from: string; at: number }>();
  /** keyed by both session ids */
  private trades = new Map<string, Trade>();

  constructor(private now: () => number = Date.now) {}

  invite(from: string, to: string): 'bad_request' | 'trade_busy' | null {
    if (from === to) return 'bad_request';
    if (this.trades.has(from) || this.trades.has(to)) return 'trade_busy';
    const cur = this.invites.get(to);
    if (cur && cur.from !== from && this.now() - cur.at < TRADE_INVITE_TTL_MS) return 'trade_busy';
    this.invites.set(to, { from, at: this.now() });
    return null;
  }

  respond(to: string, ok: boolean): RespondResult | null {
    const inv = this.invites.get(to);
    if (!inv) return null;
    this.invites.delete(to);
    if (this.now() - inv.at >= TRADE_INVITE_TTL_MS) return { kind: 'expired', from: inv.from };
    if (!ok) return { kind: 'declined', from: inv.from };
    if (this.trades.has(inv.from) || this.trades.has(to)) return { kind: 'busy', from: inv.from };
    const side = (id: string): TradeSide => ({ id, offer: { slots: [], coins: 0 }, accepted: false, confirmed: false });
    const trade: Trade = { a: side(inv.from), b: side(to), confirmAt: null, touchedAt: this.now(), executing: false };
    this.trades.set(inv.from, trade);
    this.trades.set(to, trade);
    return { kind: 'start', trade };
  }

  get(id: string): Trade | undefined {
    return this.trades.get(id);
  }

  sides(t: Trade, id: string): { me: TradeSide; them: TradeSide } {
    return t.a.id === id ? { me: t.a, them: t.b } : { me: t.b, them: t.a };
  }

  /** Replace one side's offer. Any change clears both accepts and the countdown. */
  offer(id: string, offer: Offer): Trade | 'locked' | null {
    const t = this.trades.get(id);
    if (!t) return null;
    if (t.executing) return 'locked';
    this.sides(t, id).me.offer = offer;
    t.a.accepted = t.b.accepted = false;
    t.a.confirmed = t.b.confirmed = false;
    t.confirmAt = null;
    t.touchedAt = this.now();
    return t;
  }

  accept(id: string): Trade | 'locked' | null {
    const t = this.trades.get(id);
    if (!t) return null;
    if (t.executing) return 'locked';
    this.sides(t, id).me.accepted = true;
    t.touchedAt = this.now();
    if (t.a.accepted && t.b.accepted && t.confirmAt === null) t.confirmAt = this.now() + TRADE_CONFIRM_DELAY_MS;
    return t;
  }

  confirm(id: string): ConfirmResult {
    const t = this.trades.get(id);
    if (!t) return 'no_trade';
    if (t.executing) return 'waiting';
    if (!t.a.accepted || !t.b.accepted || t.confirmAt === null) return 'not_accepted';
    if (this.now() < t.confirmAt) return 'too_early';
    this.sides(t, id).me.confirmed = true;
    t.touchedAt = this.now();
    if (!t.a.confirmed || !t.b.confirmed) return 'waiting';
    t.executing = true;
    return 'execute';
  }

  /** Forget a trade (done, reported, failed). Safe to call twice. */
  finish(t: Trade) {
    if (this.trades.get(t.a.id) === t) this.trades.delete(t.a.id);
    if (this.trades.get(t.b.id) === t) this.trades.delete(t.b.id);
  }

  /**
   * Cancel or leave: drops the trade (unless it is executing and not forced)
   * and every pending invite to or from `id`. `peers` are the other people to tell.
   */
  close(id: string, force = false): { trade: Trade | null; peers: string[] } {
    const peers: string[] = [];
    const incoming = this.invites.get(id);
    if (incoming) {
      this.invites.delete(id);
      peers.push(incoming.from);
    }
    for (const [to, inv] of this.invites) {
      if (inv.from !== id) continue;
      this.invites.delete(to);
      peers.push(to);
    }
    const t = this.trades.get(id);
    if (!t || (t.executing && !force)) return { trade: null, peers };
    this.finish(t);
    peers.push(this.sides(t, id).them.id);
    return { trade: t, peers };
  }

  sweep(): { idle: Trade[]; expired: Array<{ from: string; to: string }> } {
    const now = this.now();
    const expired: Array<{ from: string; to: string }> = [];
    for (const [to, inv] of this.invites) {
      if (now - inv.at < TRADE_INVITE_TTL_MS) continue;
      this.invites.delete(to);
      expired.push({ from: inv.from, to });
    }
    const idle: Trade[] = [];
    for (const t of new Set(this.trades.values())) if (!t.executing && now - t.touchedAt >= TRADE_IDLE_MS) idle.push(t);
    for (const t of idle) this.finish(t);
    return { idle, expired };
  }
}
