# Trading (Casino Stage 2) Implementation Plan — Part 2 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Header, Global Constraints and File Map are in Part 1: `docs/superpowers/plans/2026-09-14-trade-stage2.md`. They apply here unchanged (ports 2597/2596 only, do-not-edit list, exact commit trailer, `index.lock` retry).

This part: Tasks 6-9 — `TradeBook`, `TradeController`, `GameRoom` hooks, mod trades API.

---

### Task 6: `TradeBook` — pure session state machine

**Files:**
- Create: `server/src/trade/TradeBook.ts`
- Create: `server/src/trade/TradeBook.test.ts`

**Interfaces:**
- Consumes: `Offer`, `TRADE_INVITE_TTL_MS` (20 000), `TRADE_CONFIRM_DELAY_MS` (3000), `TRADE_IDLE_MS` (300 000) from `@dovey/shared` (Part 1 Task 2).
- Produces:
  - `interface TradeSide { id: string; offer: Offer; accepted: boolean; confirmed: boolean }` (`id` = Colyseus sessionId)
  - `interface Trade { a: TradeSide; b: TradeSide; confirmAt: number | null; touchedAt: number; executing: boolean }` (`a` = inviter)
  - `type RespondResult = { kind: 'start'; trade: Trade } | { kind: 'declined' | 'expired' | 'busy'; from: string }`
  - `type ConfirmResult = 'no_trade' | 'not_accepted' | 'too_early' | 'waiting' | 'execute'`
  - `class TradeBook` with `constructor(now?: () => number)` and methods:
    - `invite(from: string, to: string): 'bad_request' | 'trade_busy' | null`
    - `respond(to: string, ok: boolean): RespondResult | null`
    - `get(id: string): Trade | undefined`
    - `sides(t: Trade, id: string): { me: TradeSide; them: TradeSide }`
    - `offer(id: string, offer: Offer): Trade | 'locked' | null`
    - `accept(id: string): Trade | 'locked' | null`
    - `confirm(id: string): ConfirmResult`
    - `finish(t: Trade): void`
    - `close(id: string, force?: boolean): { trade: Trade | null; peers: string[] }`
    - `sweep(): { idle: Trade[]; expired: Array<{ from: string; to: string }> }`

- [ ] **Step 1: Write the failing test** — `server/src/trade/TradeBook.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { TradeBook } from './TradeBook';

function book() {
  let t = 5000;
  return { b: new TradeBook(() => t), advance: (ms: number) => (t += ms), now: () => t };
}
const coins = (n: number) => ({ slots: [], coins: n });

function started() {
  const s = book();
  expect(s.b.invite('a', 'b')).toBeNull();
  expect(s.b.respond('b', true)).toMatchObject({ kind: 'start' });
  return s;
}

describe('TradeBook', () => {
  it('invites live for 20 s', () => {
    const { b, advance } = book();
    expect(b.invite('a', 'a')).toBe('bad_request');
    expect(b.invite('a', 'b')).toBeNull();
    advance(19_999);
    const r = b.respond('b', true);
    expect(r?.kind).toBe('start');
    if (r?.kind !== 'start') return;
    expect([r.trade.a.id, r.trade.b.id]).toEqual(['a', 'b']);
    expect(b.invite('c', 'd')).toBeNull();
    advance(20_000);
    expect(b.respond('d', true)).toEqual({ kind: 'expired', from: 'c' });
    expect(b.respond('d', true)).toBeNull();
  });

  it('sweep drops expired invites', () => {
    const { b, advance } = book();
    b.invite('a', 'b');
    advance(19_999);
    expect(b.sweep().expired).toEqual([]);
    advance(1);
    expect(b.sweep().expired).toEqual([{ from: 'a', to: 'b' }]);
    expect(b.respond('b', true)).toBeNull();
  });

  it('one trade per person, a fresh invite blocks other inviters, decline tells the inviter', () => {
    const { b } = book();
    b.invite('a', 'b');
    expect(b.invite('c', 'b')).toBe('trade_busy');
    b.respond('b', true);
    expect(b.invite('c', 'a')).toBe('trade_busy');
    expect(b.invite('a', 'c')).toBe('trade_busy');
    expect(b.invite('c', 'd')).toBeNull();
    expect(b.respond('d', false)).toEqual({ kind: 'declined', from: 'c' });
    expect(b.get('c')).toBeUndefined();
  });

  it('any offer change resets both accepts and the countdown', () => {
    const { b, now } = started();
    expect(b.accept('a')).not.toBeNull();
    expect(b.get('a')!.confirmAt).toBeNull();
    b.accept('b');
    expect(b.get('a')!.confirmAt).toBe(now() + 3000);
    expect(b.offer('b', coins(10))).not.toBe('locked');
    const t = b.get('a')!;
    expect([t.a.accepted, t.b.accepted, t.confirmAt]).toEqual([false, false, null]);
    expect(t.b.offer.coins).toBe(10);
    expect(b.offer('zz', coins(1))).toBeNull();
  });

  it('confirm unlocks 3 s after both accept and executes once both confirm', () => {
    const { b, advance } = started();
    expect(b.confirm('a')).toBe('not_accepted');
    b.accept('a');
    b.accept('b');
    advance(2999);
    expect(b.confirm('a')).toBe('too_early');
    advance(1);
    expect(b.confirm('a')).toBe('waiting');
    expect(b.confirm('b')).toBe('execute');
    expect(b.get('a')!.executing).toBe(true);
    expect(b.offer('a', coins(1))).toBe('locked');
    expect(b.accept('b')).toBe('locked');
    expect(b.close('a')).toEqual({ trade: null, peers: [] });
    expect(b.get('a')).toBeDefined();
    b.finish(b.get('a')!);
    expect(b.get('a')).toBeUndefined();
    expect(b.get('b')).toBeUndefined();
    expect(b.confirm('a')).toBe('no_trade');
  });

  it('closes a trade after 5 minutes without activity', () => {
    const { b, advance } = started();
    advance(299_999);
    expect(b.sweep().idle).toEqual([]);
    b.offer('a', coins(1));
    advance(299_999);
    expect(b.sweep().idle).toEqual([]);
    advance(1);
    const { idle } = b.sweep();
    expect(idle).toHaveLength(1);
    expect(idle[0].a.id).toBe('a');
    expect(b.get('b')).toBeUndefined();
  });

  it('leaving closes the trade, even mid-execution, and pending invites both ways', () => {
    const { b, advance } = started();
    b.accept('a');
    b.accept('b');
    advance(3000);
    b.confirm('a');
    b.confirm('b');
    const closed = b.close('a', true);
    expect(closed.trade?.b.id).toBe('b');
    expect(closed.peers).toEqual(['b']);
    expect(b.get('b')).toBeUndefined();

    b.invite('p', 'q');
    b.invite('r', 'p');
    expect(b.close('p').peers.sort()).toEqual(['q', 'r']);
    expect(b.respond('q', true)).toBeNull();
    expect(b.respond('p', true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/TradeBook.test.ts`
Expected: FAIL — cannot resolve `./TradeBook`.

- [ ] **Step 3: Implement** — `server/src/trade/TradeBook.ts`

```ts
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
```

Note: in the "leaving mid-execution" test, `close('a', true)` on an executing trade returns `peers: ['b']` because no invites exist; `confirm` before that returned `'execute'`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/TradeBook.test.ts`
Expected: `Tests  7 passed (7)`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/trade/TradeBook.ts server/src/trade/TradeBook.test.ts
git commit -F - <<'MSG'
feat(trade): TradeBook invite, accept reset, confirm countdown and idle rules

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 7: `TradeController` — messages, gates, limits, execution, report

**Files:**
- Create: `server/src/trade/controller.ts`
- Create: `server/src/trade/controller.test.ts`

**Interfaces:**
- Consumes: `TradeBook` (Task 6); `checkOffer` (Part 1 Task 5); `tradeGatesOn`, `isTooNew` (Task 5); `Repo.inventory`, `Repo.coins`, `Repo.tradeStanding`, `Repo.executeTrade`, `Repo.report(reporterId, targetId, roomId, reason, context)` (repo.ts line 252); `RateLimiter(count, windowMs)` with `allow(key, now)` / `forget(key)` (shared/src/chat.ts lines 10-30); `REPORT_NOTE_MAX` (200), `TRADE_MSG_RATE`, `TRADE_INVITE_RATE`, `parseOffer`, `ResolvedOffer`, `TradeStateMsg`, `TradeDoneCode`.
- Produces:
  - `const TRADE_CLIENT_MESSAGES = ['t_invite', 't_respond', 't_offer', 't_accept', 't_confirm', 't_cancel', 't_report'] as const`
  - `type TradeClientMessage = (typeof TRADE_CLIENT_MESSAGES)[number]`
  - `interface TradeHost { repo: Repo; roomId: () => string; tradeEnabled: () => boolean; userOf: (sessionId: string) => { id: string; handle: string } | null; isHidden: (a: string, b: string) => boolean; send: (sessionId: string, type: string, data: unknown) => void; gatesOn?: () => boolean; now?: () => number }`
  - `class TradeController { readonly book: TradeBook; constructor(host: TradeHost); handle(sessionId: string, type: TradeClientMessage, msg: unknown): Promise<void>; leave(sessionId: string): void; sweep(): void }`
  - Wire payloads sent through `host.send`:
    - `sys {code}` with `no_such_player | trade_off | blocked_pair | trade_busy | rate_limited | too_new | bad_request | no_trade | bad_offer | insufficient_coins | insufficient_items | not_owned | not_accepted | too_early | trade_locked`
    - `t_incoming {from: sessionId, handle}` → invitee; `t_waiting {to: sessionId}` → inviter
    - `t_state TradeStateMsg` → each side (its own perspective)
    - `t_done {ok: true}` or `{ok: false, code: TradeDoneCode}` → both sides / invite peers
    - `coins {coins, earned: 0}` → each side after a successful trade

- [ ] **Step 1: Write the failing test** — `server/src/trade/controller.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, type TradeStateMsg } from '@dovey/shared';
import { Db, openTestDb } from '../db';
import { Repo } from '../repo';
import { TradeController, type TradeHost } from './controller';

let db: Db;
let repo: Repo;
let seq = 0;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.ensureLtdStock();
});
afterAll(() => db.close());

type Sent = { to: string; type: string; data: any };

function setup(opts: { gates?: boolean; enabled?: boolean } = {}) {
  let t = 1_000_000;
  const users = new Map<string, { id: string; handle: string }>();
  const hidden = new Set<string>();
  const sent: Sent[] = [];
  const host: TradeHost = {
    repo,
    roomId: () => 'room1',
    tradeEnabled: () => opts.enabled ?? true,
    userOf: (sid) => users.get(sid) ?? null,
    isHidden: (a, b) => hidden.has(`${a}|${b}`) || hidden.has(`${b}|${a}`),
    send: (to, type, data) => sent.push({ to, type, data }),
    gatesOn: () => opts.gates ?? false,
    now: () => t,
  };
  const ctl = new TradeController(host);
  return {
    ctl,
    users,
    hidden,
    sent,
    advance: (ms: number) => (t += ms),
    last: (to: string, type: string) => [...sent].reverse().find((m) => m.to === to && m.type === type)?.data,
    all: (to: string, type: string) => sent.filter((m) => m.to === to && m.type === type).map((m) => m.data),
    sys: (to: string) => sent.filter((m) => m.to === to && m.type === 'sys').map((m) => m.data.code as string),
  };
}

async function player(coins: number) {
  const u = await repo.createUser(`ctl${++seq}`.padEnd(32, 'q'), DEFAULT_AVATAR);
  await db.query('update users set coins = $2 where id = $1', [u.id, coins]);
  return { id: u.id, handle: u.handle };
}

async function opened(s: ReturnType<typeof setup>, coinsA = 200_000, coinsB = 5000) {
  const a = await player(coinsA);
  const b = await player(coinsB);
  s.users.set('sa', a);
  s.users.set('sb', b);
  await s.ctl.handle('sa', 't_invite', { id: 'sb' });
  await s.ctl.handle('sb', 't_respond', { ok: true });
  return { a, b };
}

describe('TradeController', () => {
  it('trades coins, a stack and an LTD rare after both accept and confirm', async () => {
    const s = setup();
    const a = await player(200_000);
    const b = await player(5000);
    s.users.set('sa', a);
    s.users.set('sb', b);
    await repo.addItem(a.id, 'chair', 2);
    const buy = await repo.buyInstance(a.id, 'throne_gold');
    if (!buy.ok) throw new Error('buy failed');
    const throne = buy.item;
    const coinsA = await repo.coins(a.id);

    await s.ctl.handle('sa', 't_invite', { id: 'sb' });
    expect(s.last('sb', 't_incoming')).toEqual({ from: 'sa', handle: a.handle });
    expect(s.last('sa', 't_waiting')).toEqual({ to: 'sb' });
    await s.ctl.handle('sb', 't_respond', { ok: true });
    expect((s.last('sa', 't_state') as TradeStateMsg).partner).toEqual({ id: 'sb', handle: b.handle });

    await s.ctl.handle('sa', 't_offer', { slots: [{ def: 'chair', qty: 2 }, { itemId: throne.id }], coins: 400 });
    await s.ctl.handle('sb', 't_offer', { slots: [], coins: 100 });
    const seenByB = s.last('sb', 't_state') as TradeStateMsg;
    expect(seenByB.them.slots[1]).toEqual({ def: 'throne_gold', qty: 1, itemId: throne.id, name: 'Golden Throne', serial: throne.serial });
    expect(seenByB.you.coins).toBe(100);

    await s.ctl.handle('sa', 't_accept', {});
    await s.ctl.handle('sb', 't_accept', {});
    const both = s.last('sa', 't_state') as TradeStateMsg;
    expect([both.acceptedYou, both.acceptedThem, both.confirmAt]).toEqual([true, true, 3000]);
    await s.ctl.handle('sa', 't_confirm', {});
    expect(s.sys('sa')).toEqual(['too_early']);

    s.advance(3000);
    await s.ctl.handle('sa', 't_confirm', {});
    expect(s.last('sa', 't_done')).toBeUndefined();
    await s.ctl.handle('sb', 't_confirm', {});
    expect(s.last('sa', 't_done')).toEqual({ ok: true });
    expect(s.last('sb', 't_done')).toEqual({ ok: true });
    expect(s.last('sa', 'coins')).toEqual({ coins: coinsA - 400 + 100, earned: 0 });
    expect(s.last('sb', 'coins')).toEqual({ coins: 5000 + 400 - 100, earned: 0 });

    const invB = await repo.inventory(b.id);
    expect(invB.items.chair).toBe(2);
    expect(invB.instances.find((i) => i.id === throne.id)?.serial).toBe(throne.serial);
    expect((await repo.inventory(a.id)).instances.some((i) => i.id === throne.id)).toBe(false);
    expect(s.ctl.book.get('sa')).toBeUndefined();
  });

  it('any offer change clears both accepts and the countdown', async () => {
    const s = setup();
    await opened(s);
    await s.ctl.handle('sa', 't_accept', {});
    await s.ctl.handle('sb', 't_accept', {});
    await s.ctl.handle('sb', 't_offer', { slots: [], coins: 1 });
    const st = s.last('sa', 't_state') as TradeStateMsg;
    expect([st.acceptedYou, st.acceptedThem, st.confirmAt]).toEqual([false, false, null]);
    expect(st.them.coins).toBe(1);
    s.advance(3000);
    await s.ctl.handle('sa', 't_confirm', {});
    expect(s.sys('sa')).toEqual(['not_accepted']);
  });

  it('refuses invites: missing player, room off, blocked, busy, rate limit, too new', async () => {
    const off = setup({ enabled: false });
    off.users.set('sa', await player(0));
    off.users.set('sb', await player(0));
    await off.ctl.handle('sa', 't_invite', { id: 'sb' });
    expect(off.sys('sa')).toEqual(['trade_off']);

    const s = setup();
    const [a, b, c, d, e] = [await player(0), await player(0), await player(0), await player(0), await player(0)];
    for (const [sid, u] of [['sa', a], ['sb', b], ['sc', c], ['sd', d], ['se', e]] as const) s.users.set(sid, u);
    await s.ctl.handle('sa', 't_invite', { id: 'nobody' });
    await s.ctl.handle('sa', 't_invite', { id: 'sa' });
    await s.ctl.handle('sa', 't_invite', {});
    expect(s.sys('sa')).toEqual(['no_such_player', 'no_such_player', 'no_such_player']);
    s.hidden.add('sa|sb');
    await s.ctl.handle('sa', 't_invite', { id: 'sb' });
    expect(s.sys('sa').at(-1)).toBe('blocked_pair');
    s.hidden.clear();
    s.advance(1000);
    await s.ctl.handle('sa', 't_invite', { id: 'sb' });
    await s.ctl.handle('sb', 't_respond', { ok: true });
    await s.ctl.handle('sc', 't_invite', { id: 'sa' });
    expect(s.sys('sc')).toEqual(['trade_busy']);
    await s.ctl.handle('sc', 't_invite', { id: 'sd' });
    expect(s.last('sd', 't_incoming')).toEqual({ from: 'sc', handle: c.handle });
    await s.ctl.handle('sc', 't_invite', { id: 'se' });
    expect(s.sys('sc')).toEqual(['trade_busy', 'rate_limited']);

    const gated = setup({ gates: true });
    gated.users.set('sa', await player(0));
    gated.users.set('sb', await player(0));
    await gated.ctl.handle('sa', 't_invite', { id: 'sb' });
    expect(gated.sys('sa')).toEqual(['too_new']);
    expect(gated.last('sb', 't_incoming')).toBeUndefined();
  });

  it('limits trade messages to 10 per second per client', async () => {
    const s = setup();
    s.users.set('sa', await player(0));
    for (let i = 0; i < 11; i++) await s.ctl.handle('sa', 't_accept', {});
    expect(s.sys('sa')).toEqual([...Array(10).fill('no_trade'), 'rate_limited']);
    s.advance(1000);
    await s.ctl.handle('sa', 't_accept', {});
    expect(s.sys('sa').at(-1)).toBe('no_trade');
  });

  it('validates offers against the shape, balance, stacks and instances', async () => {
    const s = setup();
    const { a } = await opened(s, 1000, 0);
    await repo.addItem(a.id, 'chair', 2);
    await db.query('update users set coins = 60000 where id = $1', [a.id]);
    const buy = await repo.buyInstance(a.id, 'dicemaster');
    if (!buy.ok) throw new Error('buy failed');
    await repo.claimPlacement(buy.item.id, a.id, 'dicemaster', 'room1');
    const states = s.all('sa', 't_state').length;

    await s.ctl.handle('sa', 't_offer', { slots: Array.from({ length: 10 }, (_, i) => ({ itemId: `x${i}` })), coins: 0 });
    await s.ctl.handle('sa', 't_offer', { slots: [], coins: 52_001 });
    await s.ctl.handle('sa', 't_offer', { slots: [{ def: 'chair', qty: 3 }], coins: 0 });
    s.advance(1000);
    await s.ctl.handle('sa', 't_offer', { slots: [{ itemId: buy.item.id }], coins: 0 });
    await s.ctl.handle('sa', 't_offer', { slots: [{ itemId: 'a1' }, { itemId: 'a1' }], coins: 0 });
    await s.ctl.handle('sa', 't_offer', { slots: [{ itemId: '' }], coins: 0 });
    expect(s.sys('sa')).toEqual(['bad_offer', 'insufficient_coins', 'insufficient_items', 'not_owned', 'bad_offer', 'bad_offer']);
    expect(s.all('sa', 't_state')).toHaveLength(states);
  });

  it('an instance placed after it was offered fails the trade cleanly', async () => {
    const s = setup();
    const { a, b } = await opened(s);
    const buy = await repo.buyInstance(a.id, 'throne_gold');
    if (!buy.ok) throw new Error('buy failed');
    await s.ctl.handle('sa', 't_offer', { slots: [{ itemId: buy.item.id }], coins: 0 });
    await s.ctl.handle('sb', 't_offer', { slots: [], coins: 1000 });
    await s.ctl.handle('sa', 't_accept', {});
    await s.ctl.handle('sb', 't_accept', {});
    await repo.claimPlacement(buy.item.id, a.id, 'throne_gold', 'room1');
    const coinsB = await repo.coins(b.id);
    s.advance(3000);
    await s.ctl.handle('sa', 't_confirm', {});
    await s.ctl.handle('sb', 't_confirm', {});
    expect(s.last('sa', 't_done')).toEqual({ ok: false, code: 'not_owned' });
    expect(s.last('sb', 't_done')).toEqual({ ok: false, code: 'not_owned' });
    expect(await repo.coins(b.id)).toBe(coinsB);
    expect((await repo.instances(a.id)).find((i) => i.id === buy.item.id)?.placed).toBe('room1');
    expect(s.ctl.book.get('sb')).toBeUndefined();
  });

  it('report files a scam report with both offers and cancels the trade', async () => {
    const s = setup();
    const { a, b } = await opened(s);
    await s.ctl.handle('sa', 't_offer', { slots: [], coins: 900 });
    await s.ctl.handle('sb', 't_report', { note: 'swapped at the last second' });
    expect(s.last('sa', 't_done')).toEqual({ ok: false, code: 'reported' });
    expect(s.last('sb', 't_done')).toEqual({ ok: false, code: 'reported' });
    expect(s.ctl.book.get('sa')).toBeUndefined();
    const rows = await db.query<{ reporter_id: string; target_id: string; reason: string; context: string; room_id: string }>(
      'select reporter_id, target_id, reason, context, room_id from reports where reporter_id = $1',
      [b.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_id: a.id, reason: 'scam', room_id: 'room1' });
    expect(JSON.parse(rows[0].context)).toEqual({
      kind: 'trade',
      note: 'swapped at the last second',
      reporterOffer: { slots: [], coins: 0 },
      targetOffer: { slots: [], coins: 900 },
    });
  });

  it('decline, expiry, cancel, leave and idle all end with t_done', async () => {
    const s = setup();
    for (const sid of ['sa', 'sb', 'sc', 'sd']) s.users.set(sid, await player(0));

    await s.ctl.handle('sa', 't_invite', { id: 'sb' });
    await s.ctl.handle('sb', 't_respond', { ok: false });
    expect(s.last('sa', 't_done')).toEqual({ ok: false, code: 'declined' });

    s.advance(5000);
    await s.ctl.handle('sa', 't_invite', { id: 'sb' });
    s.advance(20_000);
    await s.ctl.handle('sb', 't_respond', { ok: true });
    expect(s.last('sa', 't_done')).toEqual({ ok: false, code: 'expired' });
    expect(s.last('sb', 't_done')).toEqual({ ok: false, code: 'expired' });

    await s.ctl.handle('sc', 't_invite', { id: 'sd' });
    s.advance(20_000);
    s.ctl.sweep();
    expect(s.last('sc', 't_done')).toEqual({ ok: false, code: 'expired' });
    expect(s.last('sd', 't_done')).toEqual({ ok: false, code: 'expired' });

    await s.ctl.handle('sa', 't_invite', { id: 'sb' });
    await s.ctl.handle('sb', 't_respond', { ok: true });
    await s.ctl.handle('sa', 't_cancel', {});
    expect(s.last('sb', 't_done')).toEqual({ ok: false, code: 'cancelled' });
    expect(s.last('sa', 't_done')).toEqual({ ok: false, code: 'cancelled' });

    s.advance(5000);
    await s.ctl.handle('sa', 't_invite', { id: 'sb' });
    await s.ctl.handle('sb', 't_respond', { ok: true });
    s.ctl.leave('sa');
    expect(s.last('sb', 't_done')).toEqual({ ok: false, code: 'left' });

    s.advance(5000);
    await s.ctl.handle('sc', 't_invite', { id: 'sd' });
    await s.ctl.handle('sd', 't_respond', { ok: true });
    s.advance(300_000);
    s.ctl.sweep();
    expect(s.last('sc', 't_done')).toEqual({ ok: false, code: 'idle' });
    expect(s.last('sd', 't_done')).toEqual({ ok: false, code: 'idle' });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/controller.test.ts`
Expected: FAIL — cannot resolve `./controller`.

- [ ] **Step 3: Implement** — `server/src/trade/controller.ts`

```ts
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
```

Note on the report test: `t_done` is sent before the `await repo.report(...)` resolves, but `handle()` awaits `report()`, so the row exists when the test queries.

Note on the validation test: the first three `t_offer` calls plus `t_invite` and `t_respond` stay within 10 messages per 1000 ms; `s.advance(1000)` before the next three keeps the rate limiter out of the assertions.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/controller.test.ts`
Expected: `Tests  8 passed (8)`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/trade/controller.ts server/src/trade/controller.test.ts
git commit -F - <<'MSG'
feat(trade): TradeController with gates, rate limits, execution and report

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 8: `GameRoom` thin hooks

**Files:**
- Modify: `server/src/GameRoom.ts` — seven small insertions. Apply them **bottom-up** (onLeave first) so the original line numbers below stay valid while editing:
  1. `onLeave`, after line 1032 (`if (duelPeer) this.clients.find(...)?.send('duel_end', { reason: 'left' });`)
  2. after line 454 (closing `});` of the `duel_end` handler)
  3. after line 403 (`for (const { duel, result } of this.duels.sweep()) this.sendRound(duel.a, duel.b, result);`)
  4. after line 211 (`if (!u) continue;` inside the coin trickle)
  5. after line 125 (`this.state.ownerId = row.owner_id;`)
  6. after line 106 (`private duelLimit = new RateLimiter(20, 5000);`)
  7. after line 48 (`import { DUEL_REWARD, DuelBook, Pick } from './duel';`)
- Do not touch line 51 (`BotCrew` import), line 154 (`spawnBots`), or `spawnBots()` itself.

**Interfaces:**
- Consumes: `TradeController`, `TRADE_CLIENT_MESSAGES` (Task 7); `RoomRow.trade_enabled` (Part 1 Task 3); `Repo.addPlayMinute` (Task 3); existing `this.clientOf(id)` (line 766), `this.blocks.isHidden` (blocks.ts line 51), `this.state.players`.
- Produces: the room forwards `t_invite | t_respond | t_offer | t_accept | t_confirm | t_cancel | t_report` to `TradeController.handle`; `users.play_minutes` grows by 1 per connected user per minute; trades close on leave and on the 5 s sweep.

- [ ] **Step 1: onLeave hook** — insert after line 1032:

```ts
    this.trade.leave(client.sessionId);
```

- [ ] **Step 2: message forwarding** — insert after line 454:

```ts

    // ---- trading: items + coins between two people here. Rules live in server/src/trade.
    this.trade = new TradeController({
      repo,
      roomId: () => this.state.slug,
      tradeEnabled: () => this.tradeEnabled,
      userOf: (id) => {
        const u = this.clientOf(id)?.auth as User | undefined;
        const p = this.state.players.get(id);
        return u && p ? { id: u.id, handle: p.handle } : null;
      },
      isHidden: (a, b) => this.blocks.isHidden(a, b),
      send: (id, type, data) => this.clientOf(id)?.send(type, data),
    });
    for (const type of TRADE_CLIENT_MESSAGES) {
      this.onMessage(type, (client, msg: unknown) => {
        this.trade.handle(client.sessionId, type, msg).catch((e) => console.error('[trade]', type, e));
      });
    }
```

- [ ] **Step 3: sweep** — insert after line 403:

```ts
      this.trade.sweep();
```

- [ ] **Step 4: play minutes** — insert after line 211:

```ts
        void GameRoom.repo.addPlayMinute(u.id).catch((e) => console.error('[trade] play minute', e));
```

- [ ] **Step 5: cache `trade_enabled`** — insert after line 125:

```ts
    this.tradeEnabled = row.trade_enabled !== false;
```

- [ ] **Step 6: fields** — insert after line 106:

```ts
  /** player-to-player trades (server/src/trade) */
  private trade!: TradeController;
  /** rooms.trade_enabled, cached on create */
  private tradeEnabled = true;
```

- [ ] **Step 7: import** — insert after line 48:

```ts
import { TRADE_CLIENT_MESSAGES, TradeController } from './trade/controller';
```

- [ ] **Step 8: Verify**

Run: `grep -n "trade" server/src/GameRoom.ts`
Expected: exactly these hits (line numbers after edits): the import, the two fields, `this.tradeEnabled = row.trade_enabled !== false;`, `addPlayMinute`, `this.trade.sweep();`, the controller block (≈12 lines), and `this.trade.leave(client.sessionId);`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0.
Run: `pnpm --filter @dovey/server test`
Expected: all test files pass (including `db.transaction`, `trade/*`, `repo`, `casino`, `duel`, `tableGames`).

- [ ] **Step 9: Commit**

```bash
git add server/src/GameRoom.ts
git commit -F - <<'MSG'
feat(trade): wire trade messages, sweep, leave and play minutes into GameRoom

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 9: Mod API — `GET /api/mod/trades?user=<userId>`

**Files:**
- Modify: `server/src/api.ts` (insert after the `app.get('/api/mod/reports', ...)` handler, which ends at line 138)
- Create: `server/src/trade/modApi.test.ts`

**Interfaces:**
- Consumes: `isMod(req)` (api.ts lines 131-133; reads `process.env.MOD_TOKEN` when `buildApi` runs), `Repo.tradesFor(userId, 50)` (Part 1 Task 4).
- Produces: `GET /api/mod/trades?user=<userId>` → `404 {error:'not found'}` without a matching `x-mod-token`; `400 {error:'bad user'}` without `user`; `200 TradeLogRow[]` (≤ 50, newest first).

- [ ] **Step 1: Write the failing test** — `server/src/trade/modApi.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { buildApi } from '../api';
import { Db, openTestDb } from '../db';
import { Repo } from '../repo';

// the only ports this worktree may use: 2596 (this test / manual check), 2597 (smoke)
const PORT = 2596;
const BASE = `http://127.0.0.1:${PORT}`;
let db: Db;
let server: Server;
let aId: string;
let aHandle: string;

beforeAll(async () => {
  process.env.MOD_TOKEN = 'mod-secret-token-123';
  db = await openTestDb();
  const repo = new Repo(db);
  const a = await repo.createUser('modApiA'.padEnd(32, 'm'), DEFAULT_AVATAR);
  const b = await repo.createUser('modApiB'.padEnd(32, 'n'), DEFAULT_AVATAR);
  aId = a.id;
  aHandle = a.handle;
  expect((await repo.executeTrade(a.id, b.id, { slots: [], coins: 25 }, { slots: [], coins: 0 }, 'modroom')).ok).toBe(true);
  const app = buildApi(repo);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  delete process.env.MOD_TOKEN;
});

describe('GET /api/mod/trades', () => {
  it('hides behind the mod token', async () => {
    expect((await fetch(`${BASE}/api/mod/trades?user=${aId}`)).status).toBe(404);
    expect((await fetch(`${BASE}/api/mod/trades?user=${aId}`, { headers: { 'x-mod-token': 'wrong' } })).status).toBe(404);
  });

  it('needs a user id', async () => {
    const r = await fetch(`${BASE}/api/mod/trades`, { headers: { 'x-mod-token': 'mod-secret-token-123' } });
    expect(r.status).toBe(400);
  });

  it("lists the user's trades with handles and offers", async () => {
    const r = await fetch(`${BASE}/api/mod/trades?user=${aId}`, { headers: { 'x-mod-token': 'mod-secret-token-123' } });
    expect(r.status).toBe(200);
    const rows = await r.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ a_id: aId, a_handle: aHandle, room_id: 'modroom', a_offer: { coins: 25, slots: [] } });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/modApi.test.ts`
Expected: FAIL — the listing test gets a non-200 status (no route yet; the SPA fallback is not mounted in `buildApi`, so Express answers 404) and the 400 test fails.

- [ ] **Step 3: Implement** — `server/src/api.ts`, insert after line 138:

```ts

  /** A user's last 50 trades (both sides, offers with serials), for judging scam reports. */
  app.get('/api/mod/trades', async (req, res) => {
    if (!isMod(req as never)) return res.status(404).json({ error: 'not found' });
    const user = typeof req.query.user === 'string' ? req.query.user : '';
    if (!user) return res.status(400).json({ error: 'bad user' });
    res.json(await repo.tradesFor(user, 50));
  });
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dovey/server exec vitest run src/trade/modApi.test.ts`
Expected: `Tests  3 passed (3)`.
Run: `pnpm --filter @dovey/server typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/api.ts server/src/trade/modApi.test.ts
git commit -F - <<'MSG'
feat(trade): mod trades endpoint behind the mod token

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

Continue with Part 3: `docs/superpowers/plans/2026-09-14-trade-stage2-part3.md`.
