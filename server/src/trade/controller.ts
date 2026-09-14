import {
  REPORT_NOTE_MAX,
  RateLimiter,
  TRADE_INVITE_RATE,
  TRADE_MSG_RATE,
  parseOffer,
  type ResolvedOffer,
  type TradeDoneCode,
  type TradeStateMsg,
} from '@dovey/shared';
import type { Repo } from '../repo';
import { isTooNew, tradeGatesOn } from './gates';
import { checkOffer } from './offers';
import { type Trade, TradeBook } from './TradeBook';

export const TRADE_CLIENT_MESSAGES = ['t_invite', 't_respond', 't_offer', 't_accept', 't_confirm', 't_cancel', 't_report'] as const;
export type TradeClientMessage = (typeof TRADE_CLIENT_MESSAGES)[number];

/** What the controller needs from its room; GameRoom passes closures, tests pass fakes. */
export interface TradeHost {
  repo: Repo;
  roomId: () => string;
  tradeEnabled: () => boolean;
  /** a human player present in the room, else null (bots and gone sessions are null) */
  userOf: (sessionId: string) => { id: string; handle: string } | null;
  isHidden: (a: string, b: string) => boolean;
  send: (sessionId: string, type: string, data: unknown) => void;
  gatesOn?: () => boolean;
  now?: () => number;
}

const EMPTY: ResolvedOffer = { slots: [], coins: 0 };

/**
 * Player-to-player trading for one room: consent-gated invites, a shared
 * window where any change resets both accepts, a 3 s confirm delay, and one
 * database transaction that swaps everything or nothing.
 */
export class TradeController {
  readonly book: TradeBook;
  private readonly now: () => number;
  private readonly msgLimit = new RateLimiter(TRADE_MSG_RATE.count, TRADE_MSG_RATE.windowMs);
  private readonly inviteLimit = new RateLimiter(TRADE_INVITE_RATE.count, TRADE_INVITE_RATE.windowMs);
  /** last validated offer per session, with names + serials for t_state */
  private readonly resolved = new Map<string, ResolvedOffer>();

  constructor(private readonly host: TradeHost) {
    this.now = host.now ?? Date.now;
    this.book = new TradeBook(this.now);
  }

  async handle(sid: string, type: TradeClientMessage, msg: unknown): Promise<void> {
    const me = this.host.userOf(sid);
    if (!me) return;
    if (!this.msgLimit.allow(sid, this.now())) return this.sys(sid, 'rate_limited');
    const m = msg && typeof msg === 'object' ? (msg as Record<string, unknown>) : {};
    switch (type) {
      case 't_invite':
        return this.invite(sid, me, m.id);
      case 't_respond':
        return this.respond(sid, m.ok === true);
      case 't_offer':
        return this.offer(sid, me.id, m);
      case 't_accept':
        return this.accept(sid);
      case 't_confirm':
        return this.confirm(sid);
      case 't_cancel':
        return this.cancel(sid);
      case 't_report':
        return this.report(sid, me.id, m.note);
    }
  }

  /** The session left the room: close its trade and invites, tell the others. */
  leave(sid: string) {
    const { trade, peers } = this.book.close(sid, true);
    if (trade) this.forget(trade);
    this.done(peers, false, 'left');
    this.resolved.delete(sid);
    this.msgLimit.forget(sid);
    this.inviteLimit.forget(sid);
  }

  /** Called every 5 s by the room clock. */
  sweep() {
    const { idle, expired } = this.book.sweep();
    for (const t of idle) {
      this.forget(t);
      this.done([t.a.id, t.b.id], false, 'idle');
    }
    for (const e of expired) this.done([e.from, e.to], false, 'expired');
  }

  private async invite(sid: string, me: { id: string; handle: string }, rawTo: unknown) {
    const to = typeof rawTo === 'string' ? rawTo : '';
    const them = to && to !== sid ? this.host.userOf(to) : null;
    if (!them || them.id === me.id) return this.sys(sid, 'no_such_player');
    if (!this.host.tradeEnabled()) return this.sys(sid, 'trade_off');
    if (this.host.isHidden(sid, to)) return this.sys(sid, 'blocked_pair');
    if (this.book.get(sid) || this.book.get(to)) return this.sys(sid, 'trade_busy');
    if (!this.inviteLimit.allow(sid, this.now())) return this.sys(sid, 'rate_limited');
    if (this.host.gatesOn?.() ?? tradeGatesOn()) {
      const [sa, sb] = await Promise.all([this.host.repo.tradeStanding(me.id), this.host.repo.tradeStanding(them.id)]);
      // account age is wall-clock (users.created_at), not the room clock
      if (!sa || !sb || isTooNew(sa) || isTooNew(sb)) return this.sys(sid, 'too_new');
      if (!this.host.userOf(to)) return this.sys(sid, 'no_such_player');
    }
    const err = this.book.invite(sid, to);
    if (err) return this.sys(sid, err);
    this.host.send(to, 't_incoming', { from: sid, handle: me.handle });
    this.host.send(sid, 't_waiting', { to });
  }

  private respond(sid: string, ok: boolean) {
    const r = this.book.respond(sid, ok);
    if (!r) return this.done([sid], false, 'expired');
    if (r.kind === 'start') {
      if (!this.host.userOf(r.trade.a.id)) {
        this.book.finish(r.trade);
        return this.done([sid], false, 'peer_gone');
      }
      this.resolved.set(r.trade.a.id, EMPTY);
      this.resolved.set(r.trade.b.id, EMPTY);
      return this.pushState(r.trade);
    }
    if (r.kind === 'declined') return this.done([r.from], false, 'declined');
    const code: TradeDoneCode = r.kind === 'busy' ? 'trade_busy' : 'expired';
    this.done([r.from, sid], false, code);
  }

  private async offer(sid: string, userId: string, m: Record<string, unknown>) {
    const t = this.book.get(sid);
    if (!t) return this.sys(sid, 'no_trade');
    if (t.executing) return this.sys(sid, 'trade_locked');
    const offer = parseOffer(m);
    if (!offer) return this.sys(sid, 'bad_offer');
    const check = checkOffer(await this.host.repo.inventory(userId), offer);
    if (!check.ok) return this.sys(sid, check.code);
    if (this.book.get(sid) !== t) return; // closed while the inventory loaded
    const r = this.book.offer(sid, offer);
    if (r === 'locked') return this.sys(sid, 'trade_locked');
    if (!r) return;
    this.resolved.set(sid, check.resolved);
    this.pushState(r);
  }

  private accept(sid: string) {
    const r = this.book.accept(sid);
    if (!r) return this.sys(sid, 'no_trade');
    if (r === 'locked') return this.sys(sid, 'trade_locked');
    this.pushState(r);
  }

  private async confirm(sid: string) {
    const r = this.book.confirm(sid);
    if (r === 'no_trade' || r === 'not_accepted' || r === 'too_early') return this.sys(sid, r);
    if (r === 'waiting') return;
    await this.execute(this.book.get(sid)!);
  }

  private async execute(t: Trade) {
    const ua = this.host.userOf(t.a.id);
    const ub = this.host.userOf(t.b.id);
    if (!ua || !ub) {
      this.book.finish(t);
      this.forget(t);
      return this.done([t.a.id, t.b.id], false, 'peer_gone');
    }
    const r = await this.host.repo.executeTrade(ua.id, ub.id, t.a.offer, t.b.offer, this.host.roomId());
    this.book.finish(t);
    this.forget(t);
    if (!r.ok) return this.done([t.a.id, t.b.id], false, r.code);
    for (const [sid, uid] of [
      [t.a.id, ua.id],
      [t.b.id, ub.id],
    ]) {
      this.host.send(sid, 'coins', { coins: await this.host.repo.coins(uid), earned: 0 });
    }
    this.done([t.a.id, t.b.id], true);
  }

  private cancel(sid: string) {
    const { trade, peers } = this.book.close(sid);
    if (!trade && this.book.get(sid)) return this.sys(sid, 'trade_locked');
    if (trade) this.forget(trade);
    if (!trade && !peers.length) return;
    this.done([sid, ...peers], false, 'cancelled');
  }

  private async report(sid: string, userId: string, rawNote: unknown) {
    const t = this.book.get(sid);
    if (!t) return this.sys(sid, 'no_trade');
    if (t.executing) return this.sys(sid, 'trade_locked');
    const { them } = this.book.sides(t, sid);
    const target = this.host.userOf(them.id);
    const note = typeof rawNote === 'string' ? rawNote.slice(0, REPORT_NOTE_MAX).trim() || null : null;
    const context = JSON.stringify({
      kind: 'trade',
      note,
      reporterOffer: this.resolved.get(sid) ?? EMPTY,
      targetOffer: this.resolved.get(them.id) ?? EMPTY,
    });
    // close first, so nothing can execute while the report is written
    this.book.finish(t);
    this.forget(t);
    this.done([t.a.id, t.b.id], false, 'reported');
    if (target) await this.host.repo.report(userId, target.id, this.host.roomId(), 'scam', context);
  }

  private pushState(t: Trade) {
    const confirmAt = t.confirmAt === null ? null : Math.max(0, t.confirmAt - this.now());
    for (const [me, them] of [
      [t.a, t.b],
      [t.b, t.a],
    ]) {
      const msg: TradeStateMsg = {
        partner: { id: them.id, handle: this.host.userOf(them.id)?.handle ?? '?' },
        you: this.resolved.get(me.id) ?? EMPTY,
        them: this.resolved.get(them.id) ?? EMPTY,
        acceptedYou: me.accepted,
        acceptedThem: them.accepted,
        confirmAt,
      };
      this.host.send(me.id, 't_state', msg);
    }
  }

  private forget(t: Trade) {
    this.resolved.delete(t.a.id);
    this.resolved.delete(t.b.id);
  }

  private done(ids: string[], ok: boolean, code?: TradeDoneCode) {
    for (const id of ids) this.host.send(id, 't_done', ok ? { ok: true } : { ok: false, code });
  }

  private sys(sid: string, code: string) {
    this.host.send(sid, 'sys', { code });
  }
}
