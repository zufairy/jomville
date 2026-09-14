# Trading (Casino Stage 2) Implementation Plan — Part 3 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Header, Global Constraints and File Map are in Part 1: `docs/superpowers/plans/2026-09-14-trade-stage2.md`. They apply here unchanged (ports 2597/2596 only, do-not-edit list incl. `client/src/styles.css` and `client/src/store.ts` `customizeFocus`, exact commit trailer, `index.lock` retry).

This part: Tasks 10-15 — client logic and store, net/Game wiring, `TradeWindow` + `trade.css`, ProfileSheet + App mount, smoke script, manual browser check — then the self-review against the addendum.

---

### Task 10: Client trade logic and store

**Files:**
- Create: `client/src/tradeLogic.ts`, `client/src/tradeLogic.test.ts`
- Create: `client/src/trade.ts`, `client/src/trade.test.ts`

**Interfaces:**
- Consumes: `Offer`, `ResolvedOffer`, `ResolvedSlot`, `TradeStateMsg`, `TradeDoneMsg`, `TRADE_SLOTS`, `TRADE_COINS_MAX`, `TRADE_FLASH_MS` from `@dovey/shared` (Part 1 Task 2); `fetchInventory(): Promise<Inventory | null>` (client/src/api.ts line 92); `useAppStore` setters `setCoins(n)`, `setInventory(items)`, `setInstances(list)`, `flash(msg)` (client/src/store.ts lines 125-199, 282) — read only, `store.ts` is not edited.
- Produces — `client/src/tradeLogic.ts`:
  - `interface TradeView { partner: { id: string; handle: string }; you: ResolvedOffer; them: ResolvedOffer; acceptedYou: boolean; acceptedThem: boolean; confirmEndsAt: number | null }` (`confirmEndsAt` in `performance.now()` time)
  - `slotKey(s: ResolvedSlot | undefined): string`
  - `toOffer(r: ResolvedOffer): Offer`
  - `withStack(o: Offer, def: string, qty: number): Offer`
  - `toggleInstance(o: Offer, itemId: string): Offer`
  - `removeSlot(o: Offer, index: number): Offer`
  - `withCoins(o: Offer, coins: number): Offer`
  - `flashKeys(prev: ResolvedOffer | null, next: ResolvedOffer, side: 'you' | 'them'): string[]` (keys `you:3`, `them:coins`)
  - `markChanged(changedAt: Record<string, number>, keys: string[], now: number): Record<string, number>`
  - `isFlashing(changedAt: Record<string, number>, key: string, now: number): boolean`
  - `confirmLeft(confirmEndsAt: number | null, now: number): number | null`
- Produces — `client/src/trade.ts`:
  - `type TradePhase = 'idle' | 'waiting' | 'incoming' | 'open'`
  - `useTrade` zustand store: `{ phase; peer: string; handle: string; view: TradeView | null; changedAt: Record<string, number>; confirmed: boolean; setWaiting(peer, handle); setIncoming(peer, handle); applyState(m: TradeStateMsg, now: number); markConfirmed(); reset() }`
  - `bindTradeSender(fn: ((type: string, data?: unknown) => void) | null): void`
  - `trade = { invite(peer, handle), respond(ok), offer(o: Offer), accept(), confirm(), cancel(), report(note?) }` — sends `t_invite {id}`, `t_respond {ok}`, `t_offer {slots, coins}`, `t_accept`, `t_confirm`, `t_cancel`, `t_report {note?}`
  - handlers `onTradeIncoming(m: {from, handle})`, `onTradeWaiting(m: {to})`, `onTradeState(m: TradeStateMsg)`, `onTradeDone(m: TradeDoneMsg): Promise<void>`, `onTradeSys(code: string)`
  - `TRADE_DONE_TEXT: Record<string, string>`

- [ ] **Step 1: Write the failing tests**

`client/src/tradeLogic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ResolvedOffer } from '@dovey/shared';
import { confirmLeft, flashKeys, isFlashing, markChanged, removeSlot, toOffer, toggleInstance, withCoins, withStack } from './tradeLogic';

const chair = (qty: number) => ({ def: 'chair', qty, itemId: null, name: 'chair', serial: null });
const throne = (id: string, serial: number) => ({ def: 'throne_gold', qty: 1, itemId: id, name: 'Golden Throne', serial });

describe('trade offer editing', () => {
  it('turns a resolved offer back into a wire offer', () => {
    expect(toOffer({ slots: [chair(2), throne('t1', 7)], coins: 5 })).toEqual({ slots: [{ def: 'chair', qty: 2 }, { itemId: 't1' }], coins: 5 });
  });

  it('adds, updates and removes a stack in place', () => {
    const o = { slots: [{ itemId: 't1' }], coins: 0 };
    const added = withStack(o, 'chair', 1);
    expect(added.slots).toEqual([{ itemId: 't1' }, { def: 'chair', qty: 1 }]);
    expect(withStack(added, 'chair', 3).slots).toEqual([{ itemId: 't1' }, { def: 'chair', qty: 3 }]);
    expect(withStack(added, 'chair', 0).slots).toEqual([{ itemId: 't1' }]);
    expect(withStack(o, 'lamp', 0)).toBe(o);
  });

  it('never grows past 9 slots', () => {
    const full = { slots: Array.from({ length: 9 }, (_, i) => ({ itemId: `i${i}` })), coins: 0 };
    expect(withStack(full, 'chair', 1)).toBe(full);
    expect(toggleInstance(full, 'new')).toBe(full);
    expect(toggleInstance(full, 'i4').slots).toHaveLength(8);
  });

  it('toggles instances, removes by index and clamps coins', () => {
    const o = toggleInstance({ slots: [], coins: 0 }, 't1');
    expect(o.slots).toEqual([{ itemId: 't1' }]);
    expect(toggleInstance(o, 't1').slots).toEqual([]);
    expect(removeSlot({ slots: [{ itemId: 'a' }, { itemId: 'b' }], coins: 0 }, 0).slots).toEqual([{ itemId: 'b' }]);
    expect(withCoins(o, 12.9).coins).toBe(12);
    expect(withCoins(o, -4).coins).toBe(0);
    expect(withCoins(o, Number.NaN).coins).toBe(0);
    expect(withCoins(o, 5e12).coins).toBe(1_000_000_000);
  });
});

describe('changed-slot flash', () => {
  const before: ResolvedOffer = { slots: [chair(2), throne('t1', 7)], coins: 100 };

  it('the first state flashes nothing', () => {
    expect(flashKeys(null, before, 'them')).toEqual([]);
  });

  it('flags a swapped slot, a changed qty, a removed tail and coins', () => {
    expect(flashKeys(before, { slots: [chair(2), throne('t2', 9)], coins: 100 }, 'them')).toEqual(['them:1']);
    expect(flashKeys(before, { slots: [chair(3), throne('t1', 7)], coins: 100 }, 'you')).toEqual(['you:0']);
    expect(flashKeys(before, { slots: [chair(2)], coins: 50 }, 'them')).toEqual(['them:1', 'them:coins']);
    expect(flashKeys(before, before, 'them')).toEqual([]);
  });

  it('flashes for 2 s after the change', () => {
    const at = markChanged({}, ['them:1'], 1000);
    expect(markChanged(at, [], 5000)).toBe(at);
    expect(isFlashing(at, 'them:1', 2999)).toBe(true);
    expect(isFlashing(at, 'them:1', 3000)).toBe(false);
    expect(isFlashing(at, 'them:0', 1000)).toBe(false);
  });

  it('counts down to confirm', () => {
    expect(confirmLeft(null, 5)).toBeNull();
    expect(confirmLeft(4000, 1000)).toBe(3000);
    expect(confirmLeft(4000, 9000)).toBe(0);
  });
});
```

`client/src/trade.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeStateMsg } from '@dovey/shared';

vi.mock('./api', () => ({
  fetchInventory: vi.fn(async () => ({
    coins: 777,
    items: { chair: 4 },
    instances: [{ id: 'i1', def: 'throne_gold', serial: 3, placed: null }],
  })),
}));

import { useAppStore } from './store';
import { bindTradeSender, onTradeDone, onTradeIncoming, onTradeState, onTradeSys, trade, useTrade } from './trade';

const sent: Array<[string, unknown]> = [];
const empty = { slots: [], coins: 0 };
const state = (patch: Partial<TradeStateMsg> = {}): TradeStateMsg => ({
  partner: { id: 'p1', handle: 'bob' },
  you: empty,
  them: empty,
  acceptedYou: false,
  acceptedThem: false,
  confirmAt: null,
  ...patch,
});

beforeEach(() => {
  sent.length = 0;
  bindTradeSender((type, data) => sent.push([type, data]));
  useTrade.getState().reset();
});

describe('trade store', () => {
  it('invite waits, decline resets', () => {
    trade.invite('p1', 'bob');
    expect(sent).toEqual([['t_invite', { id: 'p1' }]]);
    expect(useTrade.getState()).toMatchObject({ phase: 'waiting', peer: 'p1', handle: 'bob' });
    onTradeIncoming({ from: 'p2', handle: 'amy' });
    expect(useTrade.getState()).toMatchObject({ phase: 'incoming', peer: 'p2', handle: 'amy' });
    trade.respond(false);
    expect(sent.at(-1)).toEqual(['t_respond', { ok: false }]);
    expect(useTrade.getState().phase).toBe('idle');
  });

  it('a state opens the window, later changes flash and the countdown is local', () => {
    useTrade.getState().applyState(state(), 100);
    expect(useTrade.getState()).toMatchObject({ phase: 'open', changedAt: {} });
    const swapped = { slots: [{ def: 'throne_gold', qty: 1, itemId: 'x', name: 'Golden Throne', serial: 2 }], coins: 0 };
    useTrade.getState().applyState(state({ them: swapped, acceptedYou: true, acceptedThem: true, confirmAt: 3000 }), 500);
    const s = useTrade.getState();
    expect(s.changedAt).toEqual({ 'them:0': 500 });
    expect(s.view?.confirmEndsAt).toBe(3500);
    s.markConfirmed();
    expect(useTrade.getState().confirmed).toBe(true);
    useTrade.getState().applyState(state({ them: swapped }), 900);
    expect(useTrade.getState().confirmed).toBe(false);
    expect(useTrade.getState().view?.confirmEndsAt).toBeNull();
  });

  it('onTradeState uses performance time', () => {
    const spy = vi.spyOn(performance, 'now').mockReturnValue(42);
    onTradeState(state({ acceptedYou: true, acceptedThem: true, confirmAt: 1000 }));
    expect(useTrade.getState().view?.confirmEndsAt).toBe(1042);
    spy.mockRestore();
  });

  it('t_done closes the window, flashes and re-fetches inventory', async () => {
    useTrade.getState().applyState(state(), 1);
    await onTradeDone({ ok: true });
    expect(useTrade.getState().phase).toBe('idle');
    const app = useAppStore.getState();
    expect(app.coins).toBe(777);
    expect(app.inventory).toEqual({ chair: 4 });
    expect(app.instances.map((i) => i.id)).toEqual(['i1']);
    expect(app.toast).toBe('🤝 trade complete');
    await onTradeDone({ ok: false, code: 'not_owned' });
    expect(useAppStore.getState().toast).toBe('trade failed: an item moved. nothing changed');
  });

  it('refusals end a pending invite; a too-early confirm can be retried', () => {
    trade.invite('p1', 'bob');
    onTradeSys('too_new');
    expect(useTrade.getState().phase).toBe('idle');
    useTrade.getState().applyState(state({ acceptedYou: true, acceptedThem: true, confirmAt: 0 }), 1);
    trade.confirm();
    expect(sent.at(-1)).toEqual(['t_confirm', undefined]);
    onTradeSys('too_early');
    expect(useTrade.getState().confirmed).toBe(false);
    trade.report('fake');
    expect(sent.at(-1)).toEqual(['t_report', { note: 'fake' }]);
    trade.cancel();
    expect(sent.at(-1)).toEqual(['t_cancel', undefined]);
    expect(useTrade.getState().phase).toBe('idle');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @dovey/client exec vitest run src/tradeLogic.test.ts src/trade.test.ts`
Expected: FAIL — cannot resolve `./tradeLogic` / `./trade`.

- [ ] **Step 3: Implement** — `client/src/tradeLogic.ts`

```ts
import { TRADE_COINS_MAX, TRADE_FLASH_MS, TRADE_SLOTS, type Offer, type ResolvedOffer, type ResolvedSlot } from '@dovey/shared';

/** What the trade window shows; the server's t_state plus a local countdown deadline. */
export interface TradeView {
  partner: { id: string; handle: string };
  you: ResolvedOffer;
  them: ResolvedOffer;
  acceptedYou: boolean;
  acceptedThem: boolean;
  /** performance.now() when Confirm unlocks; null until both accepted */
  confirmEndsAt: number | null;
}

export const slotKey = (s: ResolvedSlot | undefined): string => (!s ? '' : s.itemId ? `i:${s.itemId}` : `s:${s.def}:${s.qty}`);

export function toOffer(r: ResolvedOffer): Offer {
  return { coins: r.coins, slots: r.slots.map((s) => (s.itemId ? { itemId: s.itemId } : { def: s.def, qty: s.qty })) };
}

/** Set how many of a stack are offered (0 removes it). */
export function withStack(o: Offer, def: string, qty: number): Offer {
  const i = o.slots.findIndex((s) => !('itemId' in s) && s.def === def);
  if (qty <= 0) return i < 0 ? o : { ...o, slots: o.slots.filter((_, j) => j !== i) };
  if (i >= 0) return { ...o, slots: o.slots.map((s, j) => (j === i ? { def, qty } : s)) };
  if (o.slots.length >= TRADE_SLOTS) return o;
  return { ...o, slots: [...o.slots, { def, qty }] };
}

export function toggleInstance(o: Offer, itemId: string): Offer {
  const has = o.slots.some((s) => 'itemId' in s && s.itemId === itemId);
  if (has) return { ...o, slots: o.slots.filter((s) => !('itemId' in s && s.itemId === itemId)) };
  if (o.slots.length >= TRADE_SLOTS) return o;
  return { ...o, slots: [...o.slots, { itemId }] };
}

export function removeSlot(o: Offer, index: number): Offer {
  return { ...o, slots: o.slots.filter((_, j) => j !== index) };
}

export function withCoins(o: Offer, coins: number): Offer {
  const c = Number.isFinite(coins) ? Math.min(TRADE_COINS_MAX, Math.max(0, Math.floor(coins))) : 0;
  return { ...o, coins: c };
}

/** Slot indices (and coins) that differ between two states of one side. */
export function flashKeys(prev: ResolvedOffer | null, next: ResolvedOffer, side: 'you' | 'them'): string[] {
  if (!prev) return [];
  const keys: string[] = [];
  const n = Math.max(prev.slots.length, next.slots.length);
  for (let i = 0; i < n; i++) if (slotKey(prev.slots[i]) !== slotKey(next.slots[i])) keys.push(`${side}:${i}`);
  if (prev.coins !== next.coins) keys.push(`${side}:coins`);
  return keys;
}

export function markChanged(changedAt: Record<string, number>, keys: string[], now: number): Record<string, number> {
  if (!keys.length) return changedAt;
  const out = { ...changedAt };
  for (const k of keys) out[k] = now;
  return out;
}

export function isFlashing(changedAt: Record<string, number>, key: string, now: number): boolean {
  const at = changedAt[key];
  return at !== undefined && now - at < TRADE_FLASH_MS;
}

export function confirmLeft(confirmEndsAt: number | null, now: number): number | null {
  return confirmEndsAt === null ? null : Math.max(0, confirmEndsAt - now);
}
```

`client/src/trade.ts`:

```ts
import { create } from 'zustand';
import type { Offer, TradeDoneMsg, TradeStateMsg } from '@dovey/shared';
import { fetchInventory } from './api';
import { useAppStore } from './store';
import { type TradeView, flashKeys, markChanged } from './tradeLogic';

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
  setWaiting: (peer: string, handle: string) => void;
  setIncoming: (peer: string, handle: string) => void;
  applyState: (m: TradeStateMsg, now: number) => void;
  markConfirmed: () => void;
  reset: () => void;
}

const IDLE = { phase: 'idle' as TradePhase, peer: '', handle: '', view: null, changedAt: {}, confirmed: false };

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
  offer: (o: Offer) => send?.('t_offer', o),
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
  useTrade.getState().reset();
  useAppStore.getState().flash(m.ok ? TRADE_DONE_TEXT.ok : (TRADE_DONE_TEXT[m.code ?? ''] ?? 'trade closed'));
  const inv = await fetchInventory();
  if (!inv) return;
  const st = useAppStore.getState();
  st.setCoins(inv.coins);
  st.setInventory(inv.items);
  st.setInstances(inv.instances);
}

const INVITE_REFUSALS = new Set(['no_such_player', 'trade_busy', 'blocked_pair', 'too_new', 'trade_off', 'rate_limited']);

/** sys codes that change trade UI state (the text itself is flashed by net.ts). */
export function onTradeSys(code: string) {
  const s = useTrade.getState();
  if (s.phase === 'waiting' && INVITE_REFUSALS.has(code)) s.reset();
  if (s.phase === 'open' && (code === 'too_early' || code === 'not_accepted')) useTrade.setState({ confirmed: false });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dovey/client exec vitest run src/tradeLogic.test.ts src/trade.test.ts`
Expected: `Test Files  2 passed (2)`, `Tests  13 passed (13)`.
Run: `pnpm --filter @dovey/client typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/tradeLogic.ts client/src/tradeLogic.test.ts client/src/trade.ts client/src/trade.test.ts
git commit -F - <<'MSG'
feat(trade): client trade store, offer editing and slot flash logic

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 11: Wire trade messages into `net.ts` and `Game.ts`

**Files:**
- Modify: `client/src/net.ts` (import after line 8; handlers after line 247 `k_go`; `sys` map after line 290 `sold_out`; after line 292 `store.flash(...)`)
- Modify: `client/src/game/Game.ts` (import after line 58; sender after line 201; reset after line 1312)

**Interfaces:**
- Consumes: `onTradeIncoming`, `onTradeWaiting`, `onTradeState`, `onTradeDone`, `onTradeSys`, `bindTradeSender`, `useTrade` (Task 10); `Net#send(type, data)` (net.ts line 342).
- Produces: `t_incoming`, `t_waiting`, `t_state`, `t_done` reach the trade store on every (re)join; trade `sys` codes show readable toasts; a rejoin clears any open trade window.

- [ ] **Step 1: `client/src/net.ts`**

After line 8 (`import { fetchInventory } from './api';`) add:

```ts
import { onTradeDone, onTradeIncoming, onTradeState, onTradeSys, onTradeWaiting } from './trade';
```

After line 247 (`room.onMessage('k_go', ...)`) add:

```ts
    room.onMessage('t_incoming', onTradeIncoming);
    room.onMessage('t_waiting', onTradeWaiting);
    room.onMessage('t_state', onTradeState);
    room.onMessage('t_done', onTradeDone);
```

In the `msgs` map, after line 290 (`sold_out: 'sold out. only trades now',`) add:

```ts
        trade_busy: 'they are already trading',
        too_new: 'trading unlocks after 24 hours and 30 minutes of play',
        trade_off: 'trading is turned off in this room',
        no_trade: 'no trade going on',
        bad_offer: 'that offer is not allowed',
        insufficient_coins: 'you do not have that many coins',
        insufficient_items: 'you do not have that many',
        too_early: 'wait for the countdown',
        not_accepted: 'both of you need to accept first',
        trade_locked: 'the trade is already going through',
```

After line 292 (`store.flash(msgs[m.code] ?? 'nope');`) add:

```ts
      onTradeSys(m.code);
```

- [ ] **Step 2: `client/src/game/Game.ts`**

After line 58 (`import { bindTableSender, useTables } from '../tableGames';`) add:

```ts
import { bindTradeSender, useTrade } from '../trade';
```

After line 201 (`bindTableSender((type, data) => this.net.send(type, data));`) add:

```ts
    bindTradeSender((type, data) => this.net.send(type, data));
```

After line 1312 (`useTables.getState().reset();` inside `resetWorld`) add:

```ts
    useTrade.getState().reset();
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @dovey/client typecheck`
Expected: exits 0.
Run: `pnpm --filter @dovey/client test`
Expected: all client test files pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/net.ts client/src/game/Game.ts
git commit -F - <<'MSG'
feat(trade): route trade messages and sys codes to the trade store

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 12: `TradeWindow` + `trade.css`

**Files:**
- Modify: `client/src/ui/BuildBar.tsx` line 5 (`function Thumb` → `export function Thumb`)
- Create: `client/src/ui/TradeWindow.tsx`
- Create: `client/src/ui/trade.css`

**Interfaces:**
- Consumes: `VipModal({ title, label, onExit, exitLabel, headerExtra, wide, children })` (VipModal.tsx lines 5-19); `Thumb({ def })` (BuildBar.tsx line 5, renders `img.furn__img`); `useTrade`, `trade` (Task 10); `confirmLeft`, `isFlashing`, `toOffer`, `toggleInstance`, `withCoins`, `withStack`, `removeSlot` (Task 10); `useAppStore` `inventory`, `instances`; `FURNITURE`, `isInstanceDef`, `TRADE_SLOTS`, `TRADE_CONFIRM_DELAY_MS`, `REPORT_NOTE_MAX`, `ResolvedOffer`, `ResolvedSlot` from `@dovey/shared`; existing `.vip__btn`, `.vip__btn--pink`, `.vip__btn--ghost`, `.vip__btn--danger` classes (styles.css lines 1871-1880, read only).
- Produces: `export function TradeWindow(): JSX.Element | null` — renders nothing when `phase === 'idle'`; the incoming popup "{handle} wants to trade" with Accept / Decline; a waiting card; the trade window with You / partner columns (9 slots each), picker (stack steppers + unplaced instances with `#serial`), coin input, warning "Check items carefully — trades are final", 🚩 report in the header, Accept → Confirm with a 3 s countdown ring, and 2 s flash on changed slots.

- [ ] **Step 1: Export `Thumb`** — `client/src/ui/BuildBar.tsx` line 5:

```tsx
export function Thumb({ def }: { def: string }) {
```

- [ ] **Step 2: Create `client/src/ui/TradeWindow.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { FURNITURE, REPORT_NOTE_MAX, TRADE_CONFIRM_DELAY_MS, TRADE_SLOTS, isInstanceDef, type ResolvedOffer, type ResolvedSlot } from '@dovey/shared';
import { useAppStore } from '../store';
import { trade, useTrade } from '../trade';
import { confirmLeft, isFlashing, removeSlot, toOffer, toggleInstance, withCoins, withStack } from '../tradeLogic';
import { Thumb } from './BuildBar';
import { VipModal } from './VipModal';
import './trade.css';

const RING = 2 * Math.PI * 16;

/** Re-render on a timer while the window is open, for the countdown ring and slot flashes. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

function Slot({ slot, flash, onRemove }: { slot?: ResolvedSlot; flash: boolean; onRemove?: () => void }) {
  const cls = `trade__slot${slot ? '' : ' trade__slot--empty'}${flash ? ' trade__flash' : ''}`;
  if (!slot) return <div className={cls} />;
  const badge = slot.serial !== null ? `#${slot.serial}` : slot.itemId ? '★' : `×${slot.qty}`;
  const body = (
    <>
      <Thumb def={slot.def} />
      <span className="trade__slot-name">{slot.name}</span>
      <span className={`trade__badge${slot.serial !== null ? ' trade__badge--ltd' : ''}`}>{badge}</span>
    </>
  );
  return onRemove ? (
    <button className={cls} onClick={onRemove} aria-label={`take back ${slot.name}`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Column(props: {
  title: string;
  side: 'you' | 'them';
  offer: ResolvedOffer;
  accepted: boolean;
  changedAt: Record<string, number>;
  now: number;
  onRemove?: (index: number) => void;
}) {
  const { title, side, offer, accepted, changedAt, now, onRemove } = props;
  return (
    <section className={`trade__col${accepted ? ' trade__col--ok' : ''}`} aria-label={`${title} offer`}>
      <header className="trade__col-head">
        <span className="trade__col-title">{title}</span>
        {accepted && <span className="trade__tick">✓ accepted</span>}
      </header>
      <div className="trade__grid">
        {Array.from({ length: TRADE_SLOTS }, (_, i) => (
          <Slot
            key={i}
            slot={offer.slots[i]}
            flash={isFlashing(changedAt, `${side}:${i}`, now)}
            onRemove={onRemove && offer.slots[i] ? () => onRemove(i) : undefined}
          />
        ))}
      </div>
      <div className={`trade__coins${isFlashing(changedAt, `${side}:coins`, now) ? ' trade__flash' : ''}`}>🪙 {offer.coins.toLocaleString()}</div>
    </section>
  );
}

/** Player-to-player trade: invite popup, waiting card, and the two-column trade window. */
export function TradeWindow() {
  const phase = useTrade((s) => s.phase);
  const handle = useTrade((s) => s.handle);
  const view = useTrade((s) => s.view);
  const changedAt = useTrade((s) => s.changedAt);
  const confirmed = useTrade((s) => s.confirmed);
  const inventory = useAppStore((s) => s.inventory);
  const instances = useAppStore((s) => s.instances);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [coinDraft, setCoinDraft] = useState('0');
  const now = useNow(phase === 'open');
  const myCoins = view?.you.coins ?? 0;

  useEffect(() => {
    if (phase === 'open') return;
    setReporting(false);
    setNote('');
  }, [phase]);
  useEffect(() => setCoinDraft(String(myCoins)), [myCoins]);

  if (phase === 'idle') return null;

  if (phase === 'incoming') {
    return (
      <VipModal title="🤝 trade request" label="trade request" onExit={() => trade.respond(false)} exitLabel="decline">
        <p className="trade__sub">
          <b>{handle}</b> wants to trade
        </p>
        <div className="trade__btns">
          <button className="vip__btn vip__btn--pink" onClick={() => trade.respond(true)}>
            accept
          </button>
          <button className="vip__btn vip__btn--ghost" onClick={() => trade.respond(false)}>
            decline
          </button>
        </div>
      </VipModal>
    );
  }

  if (phase === 'waiting' || !view) {
    return (
      <VipModal title="🤝 trade" label="trade" onExit={() => trade.cancel()} exitLabel="cancel">
        <p className="trade__sub">waiting for {handle || 'them'} to accept…</p>
      </VipModal>
    );
  }

  const offer = toOffer(view.you);
  const full = view.you.slots.length >= TRADE_SLOTS;
  const stacks = FURNITURE.filter((f) => !isInstanceDef(f) && (inventory[f.id] ?? 0) > 0);
  const unplaced = instances.filter((i) => !i.placed);
  const offeredQty = (def: string) => view.you.slots.find((s) => !s.itemId && s.def === def)?.qty ?? 0;
  const offeredItem = (id: string) => view.you.slots.some((s) => s.itemId === id);
  const bothAccepted = view.acceptedYou && view.acceptedThem;
  const left = confirmLeft(view.confirmEndsAt, now) ?? 0;
  const commitCoins = () => {
    const next = withCoins(offer, Number(coinDraft));
    if (next.coins !== offer.coins) trade.offer(next);
    else setCoinDraft(String(offer.coins));
  };

  const report = (
    <button className="trade__report" onClick={() => setReporting(true)} aria-label={`report ${view.partner.handle}`} title="report a scam">
      🚩
    </button>
  );

  return (
    <VipModal title={`🤝 trade with ${view.partner.handle}`} label="trade" onExit={() => trade.cancel()} exitLabel="cancel trade" headerExtra={report} wide>
      {reporting ? (
        <div className="trade__reportbox">
          <p className="trade__sub">
            report {view.partner.handle} for scamming? the trade is cancelled and a moderator sees both offers.
          </p>
          <input
            className="trade__note"
            placeholder="what happened? (optional)"
            maxLength={REPORT_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="report note"
          />
          <div className="trade__btns">
            <button className="vip__btn vip__btn--danger" onClick={() => trade.report(note.trim() || undefined)}>
              report &amp; cancel
            </button>
            <button className="vip__btn vip__btn--ghost" onClick={() => setReporting(false)}>
              back
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="trade__warn" role="note">
            ⚠️ Check items carefully — trades are final
          </p>
          <div className="trade__cols">
            <Column
              title="You"
              side="you"
              offer={view.you}
              accepted={view.acceptedYou}
              changedAt={changedAt}
              now={now}
              onRemove={(i) => trade.offer(removeSlot(offer, i))}
            />
            <Column title={view.partner.handle} side="them" offer={view.them} accepted={view.acceptedThem} changedAt={changedAt} now={now} />
          </div>

          <label className="trade__coin-input">
            <span>🪙 your coins</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={coinDraft}
              onChange={(e) => setCoinDraft(e.target.value)}
              onBlur={commitCoins}
              onKeyDown={(e) => e.key === 'Enter' && commitCoins()}
              aria-label="coins to offer"
            />
          </label>

          <div className="trade__picker" aria-label="your inventory">
            {stacks.length === 0 && unplaced.length === 0 && <p className="trade__empty">nothing to offer yet. unplaced furniture shows up here.</p>}
            {unplaced.map((i) => {
              const on = offeredItem(i.id);
              const name = FURNITURE.find((f) => f.id === i.def)?.name ?? i.def;
              return (
                <button
                  key={i.id}
                  className={`trade__pick${on ? ' trade__pick--on' : ''}`}
                  disabled={!on && full}
                  onClick={() => trade.offer(toggleInstance(offer, i.id))}
                  aria-pressed={on}
                >
                  <Thumb def={i.def} />
                  <span className="trade__pick-name">{name}</span>
                  <span className={`trade__badge${i.serial !== null ? ' trade__badge--ltd' : ''}`}>{i.serial !== null ? `#${i.serial}` : '★'}</span>
                </button>
              );
            })}
            {stacks.map((f) => {
              const held = inventory[f.id] ?? 0;
              const q = offeredQty(f.id);
              return (
                <div key={f.id} className={`trade__pick${q ? ' trade__pick--on' : ''}`}>
                  <Thumb def={f.id} />
                  <span className="trade__pick-name">{f.name}</span>
                  <div className="trade__stepper">
                    <button disabled={q === 0} onClick={() => trade.offer(withStack(offer, f.id, q - 1))} aria-label={`offer one less ${f.name}`}>
                      −
                    </button>
                    <span>
                      {q}/{held}
                    </span>
                    <button
                      disabled={q >= held || (q === 0 && full)}
                      onClick={() => trade.offer(withStack(offer, f.id, q + 1))}
                      aria-label={`offer one more ${f.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="trade__btns">
            {!bothAccepted ? (
              <button className="vip__btn vip__btn--pink" disabled={view.acceptedYou} onClick={() => trade.accept()}>
                {view.acceptedYou ? `waiting for ${view.partner.handle}…` : 'accept'}
              </button>
            ) : (
              <button className="vip__btn vip__btn--pink trade__confirm" disabled={left > 0 || confirmed} onClick={() => trade.confirm()}>
                {left > 0 && (
                  <svg className="trade__ring" viewBox="0 0 40 40" aria-hidden>
                    <circle className="trade__ring-bg" cx="20" cy="20" r="16" />
                    <circle className="trade__ring-fg" cx="20" cy="20" r="16" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - left / TRADE_CONFIRM_DELAY_MS) }} />
                  </svg>
                )}
                {confirmed ? 'confirmed, waiting…' : left > 0 ? `confirm in ${Math.ceil(left / 1000)}` : 'confirm trade'}
              </button>
            )}
          </div>
        </>
      )}
    </VipModal>
  );
}
```

- [ ] **Step 3: Create `client/src/ui/trade.css`**

```css
/* Trade window. Lives here, not in styles.css, so parallel sessions don't conflict. */
.trade__sub { margin: 6px 0 12px; font-weight: 700; font-size: 14px; }
.trade__btns { display: flex; gap: 10px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.trade__warn { margin: 0 0 10px; padding: 8px 10px; border-radius: 12px; font-weight: 800; font-size: 13px; color: #ffe29a; background: rgba(232, 194, 106, 0.12); border: 1px solid rgba(232, 194, 106, 0.4); }
.trade__report { margin-left: auto; width: 36px; height: 36px; border-radius: 12px; border: 1px solid rgba(255, 122, 138, 0.5); background: rgba(227, 52, 76, 0.15); font-size: 18px; cursor: pointer; }
.trade__report:hover { background: rgba(227, 52, 76, 0.3); }
.trade__cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.trade__col { padding: 8px; border-radius: 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.14); transition: border-color 0.2s, box-shadow 0.2s; }
.trade__col--ok { border-color: #7be3a0; box-shadow: 0 0 14px rgba(123, 227, 160, 0.35); }
.trade__col-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; font-weight: 900; font-size: 13px; }
.trade__col-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trade__tick { color: #7be3a0; font-size: 12px; white-space: nowrap; }
.trade__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.trade__slot { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; aspect-ratio: 1; min-width: 0; padding: 2px; border-radius: 10px; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.12); color: inherit; font: inherit; cursor: default; }
button.trade__slot { cursor: pointer; }
button.trade__slot:hover { border-color: var(--vip-pink, #ff4fa3); }
.trade__slot--empty { border-style: dashed; opacity: 0.55; }
.trade__slot .furn__img, .trade__pick .furn__img { width: 34px; height: 34px; object-fit: contain; }
.trade__slot-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-weight: 700; opacity: 0.85; }
.trade__badge { position: absolute; top: 2px; right: 3px; font-size: 10px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px #000; }
.trade__badge--ltd { color: #ffd35a; }
.trade__coins { margin-top: 6px; padding: 4px; border-radius: 10px; font-weight: 900; font-size: 13px; background: rgba(0, 0, 0, 0.2); }
.trade__flash { animation: trade-flash 0.5s ease-in-out infinite alternate; }
@keyframes trade-flash {
  from { box-shadow: 0 0 0 0 rgba(255, 211, 90, 0); border-color: rgba(255, 211, 90, 0.4); }
  to { box-shadow: 0 0 12px 2px rgba(255, 211, 90, 0.85); border-color: #ffd35a; }
}
.trade__coin-input { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 10px 0 6px; font-weight: 800; font-size: 13px; }
.trade__coin-input input { width: 120px; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(0, 0, 0, 0.3); color: #fff; font: inherit; text-align: right; }
.trade__picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; max-height: 190px; overflow-y: auto; padding: 4px; border-radius: 12px; background: rgba(0, 0, 0, 0.18); }
.trade__pick { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; padding: 6px 4px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.04); color: inherit; font: inherit; }
button.trade__pick { cursor: pointer; }
button.trade__pick:disabled { opacity: 0.4; cursor: default; }
.trade__pick--on { border-color: var(--vip-pink, #ff4fa3); background: rgba(255, 79, 163, 0.14); }
.trade__pick-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 700; }
.trade__stepper { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; }
.trade__stepper button { width: 24px; height: 24px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.1); color: #fff; font-weight: 900; cursor: pointer; }
.trade__stepper button:disabled { opacity: 0.35; cursor: default; }
.trade__empty { grid-column: 1 / -1; margin: 8px; font-size: 12px; opacity: 0.7; }
.trade__confirm { position: relative; display: inline-flex; align-items: center; gap: 8px; }
.trade__ring { width: 22px; height: 22px; transform: rotate(-90deg); }
.trade__ring-bg { fill: none; stroke: rgba(255, 255, 255, 0.25); stroke-width: 4; }
.trade__ring-fg { fill: none; stroke: #fff; stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset 0.1s linear; }
.trade__reportbox { display: flex; flex-direction: column; gap: 8px; }
.trade__note { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(0, 0, 0, 0.3); color: #fff; font: inherit; }
@media (max-width: 420px) {
  .trade__cols { gap: 6px; }
  .trade__grid { gap: 3px; }
  .trade__slot .furn__img { width: 26px; height: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .trade__flash { animation: none; border-color: #ffd35a; box-shadow: 0 0 10px rgba(255, 211, 90, 0.8); }
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dovey/client typecheck`
Expected: exits 0.
Run: `git diff --stat -- client/src/styles.css`
Expected: no output (styles.css untouched).

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/BuildBar.tsx client/src/ui/TradeWindow.tsx client/src/ui/trade.css
git commit -F - <<'MSG'
feat(trade): trade window with picker, countdown ring, flash and report

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 13: ProfileSheet Trade button + mount the window

**Files:**
- Modify: `client/src/ui/ProfileSheet.tsx` (import after line 3; hook after line 11; button after line 116, the duel button's closing `</button>`)
- Modify: `client/src/App.tsx` (import after line 16; mount after line 130 `<DuelUI />`)

**Interfaces:**
- Consumes: `trade.invite(peer: string, handle: string)`, `useTrade((s) => s.phase)` (Task 10); `TradeWindow` (Task 12).
- Produces: a "🤝 trade" button beside "⚔️ challenge to a duel" (the `.profile__actions .btn { flex: 1 }` rule in styles.css line 658 lays the two out side by side), disabled while a trade is waiting/incoming/open; `<TradeWindow />` mounted in the play screen.

- [ ] **Step 1: `client/src/ui/ProfileSheet.tsx`**

After line 3 (`import { useAppStore } from '../store';`) add:

```tsx
import { trade, useTrade } from '../trade';
```

After line 11 (`const duel = useAppStore((s) => s.duel);`) add:

```tsx
  const tradePhase = useTrade((s) => s.phase);
```

After line 116 (the `</button>` closing "⚔️ challenge to a duel", before `</div>` on line 117) add:

```tsx
            <button
              className="btn btn--duel"
              disabled={tradePhase !== 'idle'}
              onClick={() => {
                trade.invite(sessionId, handle);
                close();
              }}
            >
              🤝 trade
            </button>
```

- [ ] **Step 2: `client/src/App.tsx`**

After line 16 (`import { DuelUI } from './ui/DuelUI';`) add:

```tsx
import { TradeWindow } from './ui/TradeWindow';
```

After line 130 (`<DuelUI />`) add:

```tsx
      <TradeWindow />
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client build`
Expected: typecheck exits 0; Vite prints `✓ built in` and writes `client/dist/index.html`.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/ProfileSheet.tsx client/src/App.tsx
git commit -F - <<'MSG'
feat(trade): trade button on the profile sheet and window mount

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 14: Seed + two-client smoke (`smoke-trade.mjs`)

**Files:**
- Create: `server/scripts/seed-trade-smoke.ts`
- Create: `client/scripts/smoke-trade.mjs`

**Interfaces:**
- Consumes: `openDb()` (honours `PGLITE_DIR`), `Repo.ensureLtdStock`, `userByToken`, `createUser`, `inventory`, `creditCoins`, `buyInstance`, `addItem`, `coins`; HTTP `POST /api/me {token}` → `{handle, home}`, `POST /api/inventory {token}` → `{coins, items, instances}`; WS room `room` with `{slug, token}`; `furn_place {id, def, x, y, rot, itemId}` / `furn_remove {id}` (owner only); all trade messages.
- Produces: exit code 0 and `PASS` when the full flow works; tokens `tradeSmokeA000…` / `tradeSmokeB111…` (36 chars).

- [ ] **Step 1: Create `server/scripts/seed-trade-smoke.ts`**

```ts
/**
 * Seeds the trade smoke users. Run while no server holds the same PGLITE_DIR:
 *   PGLITE_DIR=/tmp/dovey-trade-smoke-db pnpm --filter @dovey/server exec tsx scripts/seed-trade-smoke.ts
 * A ends up with ≥ 2 unplaced LTD Golden Thrones, ≥ 3 chairs and spare coins; B with ≥ 500 coins.
 */
import { DEFAULT_AVATAR } from '@dovey/shared';
import { openDb } from '../src/db';
import { Repo } from '../src/repo';

const TOKEN_A = 'tradeSmokeA' + '0'.repeat(25);
const TOKEN_B = 'tradeSmokeB' + '1'.repeat(25);

const db = await openDb();
const repo = new Repo(db);
await repo.ensureLtdStock();
const a = (await repo.userByToken(TOKEN_A)) ?? (await repo.createUser(TOKEN_A, DEFAULT_AVATAR));
const b = (await repo.userByToken(TOKEN_B)) ?? (await repo.createUser(TOKEN_B, DEFAULT_AVATAR));

const inv = await repo.inventory(a.id);
const thrones = inv.instances.filter((i) => i.def === 'throne_gold' && !i.placed).length;
await repo.creditCoins(a.id, 50_000 * Math.max(0, 2 - thrones) + 1000);
for (let i = thrones; i < 2; i++) {
  const r = await repo.buyInstance(a.id, 'throne_gold');
  if (!r.ok) throw new Error(`could not buy a throne: ${r.reason}`);
}
const chairs = inv.items.chair ?? 0;
if (chairs < 3) await repo.addItem(a.id, 'chair', 3 - chairs);
if ((await repo.coins(b.id)) < 500) await repo.creditCoins(b.id, 1000);

console.log(`[seed] A=${a.handle} (${a.id}) B=${b.handle} (${b.id}) ready`);
await db.close();
```

- [ ] **Step 2: Create `client/scripts/smoke-trade.mjs`**

```js
/**
 * Trading smoke against a running server seeded by server/scripts/seed-trade-smoke.ts.
 * 1. A gives 2 chairs + an LTD throne + 300 coins, B gives 100 coins; rules on the way
 *    (confirm before accept, confirm during countdown, offer change resets accepts);
 *    both confirm; balances, stacks and throne ownership (same serial) match.
 * 2. A second trade where A places the offered throne mid-trade fails with not_owned
 *    and nothing moves.
 * 3. A declined invite tells the inviter.
 *
 *   DOVEY_API=http://localhost:2597 node client/scripts/smoke-trade.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2597';
const WS = API.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) =>
  (await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

const tokenA = 'tradeSmokeA' + '0'.repeat(25);
const tokenB = 'tradeSmokeB' + '1'.repeat(25);

const checks = [];
const check = (label, ok) => {
  checks.push(!!ok);
  console.log(ok ? '  ok  ' : '  FAIL', label);
};
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(80);
  }
  return false;
}
function freeTile(room) {
  const taken = new Set();
  room.state.furniture.forEach((f) => taken.add(`${f.x},${f.y}`));
  room.state.players.forEach((p) => taken.add(`${Math.round(p.x)},${Math.round(p.y)}`));
  for (let y = 1; y < room.state.size - 1; y++) for (let x = 1; x < room.state.size - 1; x++) if (!taken.has(`${x},${y}`)) return { x, y };
  return null;
}

const ua = await post('/api/me', { token: tokenA });
await post('/api/me', { token: tokenB });
const inv0A = await post('/api/inventory', { token: tokenA });
const inv0B = await post('/api/inventory', { token: tokenB });
const thrones = inv0A.instances.filter((i) => i.def === 'throne_gold' && !i.placed);
check('seed: A holds 2 unplaced LTD thrones and 3 chairs', thrones.length >= 2 && (inv0A.items.chair ?? 0) >= 3);
if (!checks.every(Boolean)) {
  console.log('FAIL: run server/scripts/seed-trade-smoke.ts with the same PGLITE_DIR first');
  process.exit(1);
}
const [throne1, throne2] = thrones;

const client = new Client(WS);
const A = await client.joinOrCreate('room', { slug: ua.home, token: tokenA });
const B = await client.joinOrCreate('room', { slug: ua.home, token: tokenB });
const log = {};
for (const [name, room] of [
  ['A', A],
  ['B', B],
]) {
  const l = (log[name] = { state: null, done: [], sys: [], incoming: [], waiting: [], coins: [] });
  room.onMessage('t_state', (m) => (l.state = m));
  room.onMessage('t_done', (m) => l.done.push(m));
  room.onMessage('t_incoming', (m) => l.incoming.push(m));
  room.onMessage('t_waiting', (m) => l.waiting.push(m));
  room.onMessage('sys', (m) => l.sys.push(m.code));
  room.onMessage('coins', (m) => l.coins.push(m));
  for (const t of ['chat', 'roll', 'emote', 'gear_use', 'love', 'call_state', 'duel_over', 'inventory_refresh', 'inventory_delta']) room.onMessage(t, () => {});
}
await wait(800);

// ---- 1. invite, offers, rules, successful trade
let invitedAt = Date.now();
A.send('t_invite', { id: B.sessionId });
check('B gets the invite with A handle', await until(() => log.B.incoming.some((m) => m.from === A.sessionId && m.handle === ua.handle)));
check('A is told it is waiting', log.A.waiting.some((m) => m.to === B.sessionId));
B.send('t_respond', { ok: true });
check('both trade windows open', await until(() => log.A.state && log.B.state));

A.send('t_offer', { slots: [{ def: 'chair', qty: 2 }, { itemId: throne1.id }], coins: 300 });
check(
  `B sees the Golden Throne #${throne1.serial}`,
  await until(() => log.B.state?.them.slots[1]?.serial === throne1.serial && log.B.state.them.slots[1].name === 'Golden Throne'),
);
B.send('t_offer', { slots: [], coins: 100 });
check('A sees 100 coins from B', await until(() => log.A.state?.them.coins === 100));

B.send('t_confirm');
check('confirm before accepting is refused', await until(() => log.B.sys.includes('not_accepted')));
A.send('t_accept');
B.send('t_accept');
check('both accepted starts the countdown', await until(() => log.A.state?.acceptedYou && log.A.state.acceptedThem && log.A.state.confirmAt > 0));
A.send('t_confirm');
check('confirm during the countdown is refused', await until(() => log.A.sys.includes('too_early')));
B.send('t_offer', { slots: [], coins: 100 });
check('an offer change clears both accepts', await until(() => log.A.state && !log.A.state.acceptedYou && !log.A.state.acceptedThem && log.A.state.confirmAt === null));
A.send('t_accept');
B.send('t_accept');
await until(() => log.B.state?.acceptedYou && log.B.state.acceptedThem);
await wait(3200);
A.send('t_confirm');
B.send('t_confirm');
check('both get t_done ok', await until(() => log.A.done.some((d) => d.ok) && log.B.done.some((d) => d.ok)));
check('A gets its new balance pushed', await until(() => log.A.coins.at(-1)?.coins === inv0A.coins - 200));

const inv1A = await post('/api/inventory', { token: tokenA });
const inv1B = await post('/api/inventory', { token: tokenB });
check('A coins: -300 +100', inv1A.coins === inv0A.coins - 200);
check('B coins: +300 -100', inv1B.coins === inv0B.coins + 200);
check('2 chairs moved A -> B', (inv1A.items.chair ?? 0) === inv0A.items.chair - 2 && (inv1B.items.chair ?? 0) === (inv0B.items.chair ?? 0) + 2);
check(
  'the throne is B’s now with the same serial, unplaced',
  inv1B.instances.some((i) => i.id === throne1.id && i.serial === throne1.serial && !i.placed) && !inv1A.instances.some((i) => i.id === throne1.id),
);

// ---- 2. A places the offered throne mid-trade: the trade fails and nothing moves
await wait(Math.max(0, 5200 - (Date.now() - invitedAt)));
invitedAt = Date.now();
log.A.state = null;
log.B.state = null;
A.send('t_invite', { id: B.sessionId });
await until(() => log.B.incoming.length >= 2);
B.send('t_respond', { ok: true });
check('second trade opens', await until(() => log.A.state && log.B.state));
A.send('t_offer', { slots: [{ itemId: throne2.id }], coins: 0 });
B.send('t_offer', { slots: [], coins: 50 });
await until(() => log.B.state?.them.slots[0]?.itemId === throne2.id && log.A.state?.them.coins === 50);
A.send('t_accept');
B.send('t_accept');
await until(() => log.A.state?.acceptedYou && log.A.state.acceptedThem);
const tile = freeTile(A);
const placeId = `ts${Date.now().toString(36)}`;
A.send('furn_place', { id: placeId, def: 'throne_gold', x: tile.x, y: tile.y, rot: 0, itemId: throne2.id });
check('A placed the offered throne mid-trade', await until(() => A.state.furniture.get(placeId)?.itemId === throne2.id));
await wait(3200);
const doneA = log.A.done.length;
const doneB = log.B.done.length;
A.send('t_confirm');
B.send('t_confirm');
check(
  'the trade fails with not_owned on both sides',
  await until(() => log.A.done.slice(doneA).some((d) => !d.ok && d.code === 'not_owned') && log.B.done.slice(doneB).some((d) => !d.ok && d.code === 'not_owned')),
);
const inv2A = await post('/api/inventory', { token: tokenA });
const inv2B = await post('/api/inventory', { token: tokenB });
check('B keeps its coins', inv2B.coins === inv1B.coins);
check('A keeps its coins', inv2A.coins === inv1A.coins);
check('throne 2 is still A’s and placed', inv2A.instances.some((i) => i.id === throne2.id && i.placed === ua.home));
A.send('furn_remove', { id: placeId });
check('throne 2 picked back up for the next run', await until(() => !A.state.furniture.has(placeId)));

// ---- 3. a declined invite tells the inviter
await wait(Math.max(0, 5200 - (Date.now() - invitedAt)));
A.send('t_invite', { id: B.sessionId });
await until(() => log.B.incoming.length >= 3);
B.send('t_respond', { ok: false });
check('A hears the decline', await until(() => log.A.done.some((d) => !d.ok && d.code === 'declined')));

await wait(300);
await A.leave();
await B.leave();
const ok = checks.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 3: Run seed, server, smoke**

Run: `PGLITE_DIR=/tmp/dovey-trade-smoke-db pnpm --filter @dovey/server exec tsx scripts/seed-trade-smoke.ts`
Expected: one line `[seed] A=<handle> (<id>) B=<handle> (<id>) ready`. Note A's id for Task 15.

Run (background, port 2597 only):
`PORT=2597 PGLITE_DIR=/tmp/dovey-trade-smoke-db TRADE_GATES=off pnpm --filter @dovey/server exec tsx src/index.ts > /tmp/dovey-trade-smoke.log 2>&1 &`
Then: `until curl -sf http://localhost:2597/api/health; do sleep 1; done`
Expected: `{"ok":true}`.

Run: `DOVEY_API=http://localhost:2597 node client/scripts/smoke-trade.mjs`
Expected: every line starts with `  ok  `, last line `PASS`, exit code 0. The run takes ~25 s (well under the 60 s coin trickle, so balances compare exactly).

Stop the server: `lsof -ti tcp:2597 | xargs kill`
Expected: no output; `curl -sf http://localhost:2597/api/health` then fails.

If a check fails: read `/tmp/dovey-trade-smoke.log` for `[trade]` errors, fix the owning task's code, re-run its unit tests, then repeat this step (re-running the seed is safe: it only tops up).

- [ ] **Step 4: Commit**

```bash
git add server/scripts/seed-trade-smoke.ts client/scripts/smoke-trade.mjs
git commit -F - <<'MSG'
test(trade): seeded two-client trade smoke incl. placed-mid-trade failure

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

### Task 15: Full verification and manual browser check

**Files:** none changed (fix-ups go back to the owning task and commit there).

- [ ] **Step 1: Whole-repo tests and types** (run before starting the manual server, because `modApi.test.ts` binds port 2596)

Run: `pnpm test`
Expected: shared, server and client suites all pass.
Run: `pnpm typecheck`
Expected: exits 0.
Run: `git status --short -- client/src/styles.css client/src/ui/ChatBar.tsx client/src/ui/ChatFeed.tsx server/src/bots.ts server/src/bots.test.ts client/src/store.ts client/src/ui/VendingSheet.tsx client/src/ui/Customizer.tsx client/src/wear.ts`
Expected: no output (none of the protected files changed by this plan).

- [ ] **Step 2: Serve the built client on port 2596**

Run: `pnpm --filter @dovey/client build`
Expected: `✓ built in`.
Run: `ln -sfn "$PWD/client/dist" /tmp/dovey-trade-dist`
Run (background):
`PORT=2596 CLIENT_DIST=/tmp/dovey-trade-dist PGLITE_DIR=/tmp/dovey-trade-smoke-db MOD_TOKEN=local-mod-token TRADE_GATES=off pnpm --filter @dovey/server exec tsx src/index.ts > /tmp/dovey-trade-manual.log 2>&1 &`
Then: `until curl -sf http://localhost:2596/api/health; do sleep 1; done`
Expected: `{"ok":true}`; the log contains `[dovey] serving client from /tmp/dovey-trade-dist`.

- [ ] **Step 3: Two browsers, one room** (a normal window and a private window get different device tokens)

1. Window 1: open `http://localhost:2596/play`, finish onboarding, open the shop and buy 2 chairs. Copy the room URL (`/r/<slug>`).
2. Window 2 (private): open the same `/r/<slug>` URL, finish onboarding.
3. Window 1: tap window 2's avatar → the profile sheet shows "⚔️ challenge to a duel" and "🤝 trade" side by side → tap 🤝 trade. Expected: window 1 shows "waiting for … to accept…"; window 2 shows the popup "**{handle}** wants to trade" with accept / decline.
4. Window 2: accept. Expected: both see "🤝 trade with {handle}", the warning "⚠️ Check items carefully — trades are final", two columns of 9 slots, the 🚩 button in the header.
5. Window 1: in the picker press `+` on chair twice. Expected: "2/2" on the stepper; the chair appears in window 1's "You" column and **flashes gold for ~2 s** in window 2's partner column.
6. Window 2: type `25` in "your coins", press Enter. Expected: window 1's partner coins show `🪙 25` and flash.
7. Both press accept. Expected: both columns glow green with "✓ accepted"; the button becomes "confirm in 3" with a **shrinking ring**, then "confirm trade" after 3 s.
8. Window 1: press `−` on chair once before confirming. Expected: both accepts clear, the ring disappears, "accept" returns, and the changed slot flashes in window 2.
9. Accept again on both, wait for the ring, press confirm trade on both. Expected: both windows close with toast "🤝 trade complete"; window 2's build tray (if it owns a room) or shop balance reflects +1 chair and −25 coins; window 1 reflects −1 chair and +25.
10. Start a new trade, then in window 2 press 🚩 → type "test report" → "report & cancel". Expected: both windows close; toasts "trade cancelled and reported. a moderator will look at it".
11. Start a new trade and let window 1 press "cancel trade". Expected: window 2 shows "trade cancelled".
12. Resize one window to 390 px wide. Expected: the modal goes full-screen, both columns and the picker fit without horizontal scrolling.

- [ ] **Step 4: Mod views**

Run: `curl -s -H 'x-mod-token: local-mod-token' http://localhost:2596/api/mod/reports | head -c 600`
Expected: the newest report has `"reason":"scam"` and a `context` JSON containing `"kind":"trade"`, `"note":"test report"`, `reporterOffer`, `targetOffer`.
Run: `curl -s -H 'x-mod-token: local-mod-token' "http://localhost:2596/api/mod/trades?user=<A id from the Task 14 seed output>" | head -c 600`
Expected: ≥ 1 row whose `a_offer.slots` includes `{"itemId":"…","def":"throne_gold","serial":<n>}` from the smoke run.
Run: `curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:2596/api/mod/trades?user=x"`
Expected: `404`.

- [ ] **Step 5: Stop the server**

Run: `lsof -ti tcp:2596 | xargs kill`
Expected: no output.

No commit for this task unless a fix was needed (commit that fix under its owning task's file list with a `fix(trade): …` summary).

---

## Self-Review (against `docs/superpowers/specs/2026-09-14-trade-stage2-design.md`)

| Addendum requirement | Where |
| --- | --- |
| §1 `too_new` gate: 24 h `users.created_at`, 30 `users.play_minutes` | Part 1 Task 5 `isTooNew`; Task 7 `invite()`; test "too new" |
| §1 `play_minutes` COLUMNS migration, +1 per connected user in the trickle | Part 1 Task 3 (column, `addPlayMinute`); Task 8 Step 4 |
| §1 gates only when `NODE_ENV === 'production'` and `TRADE_GATES !== 'off'` | Part 1 Task 5 `tradeGatesOn` + test |
| §2 `Db.transaction` via `pg.transaction()` | Part 1 Task 1 (checks for the duel plan's copy first) |
| §2 executeTrade order: coins → stacks → instances (`placed_room is null` guard) → log; any failure rolls back, `{ok:false, code}` | Part 1 Task 4 `executeTrade`, `ledger.ts`; rollback tests for coins, placed instance, stack shortfall |
| §2 `trades` table + indexes `(a_id, at)`, `(b_id, at)` | Part 1 Task 3 + index test |
| §3 `coins {coins, earned:0}` after ok; re-fetch inventory on every `t_done` | Task 7 `execute()`; Task 10 `onTradeDone` + test |
| §4 trade log | Part 1 Task 4 (log keeps serials) |
| §4 🚩 `t_report {note?}` → reason `scam`, context = both offers, cancel, `t_done reported` | Task 7 `report()` + test; Task 12 report box |
| §4 `GET /api/mod/trades?user=` last 50, `x-mod-token` | Task 9 + test; Part 1 Task 4 `tradesFor` limit test |
| §4 `rooms.trade_enabled` column, cached in `onCreate`, `trade_off` | Part 1 Task 3; Task 8 Step 5; Task 7 test |
| §5 TradeBook: invite TTL 20 s, ≤ 9 slots + coins ≥ 0, reset on change, confirm at +3000, execute on both confirm, cancel/leave/5 min idle close | Task 6 tests; Task 7 decline/expiry/cancel/leave/idle test |
| §5 offer validation (slots ≤ 9, positive integer qty, no duplicate itemIds, stack ≤ held, instances owned + unplaced, coins ≤ balance), repeated in the transaction | Part 1 Task 2 `parseOffer`; Task 5 `checkOffer`; Task 4 re-parse + guards |
| §5 refusals `no_such_player`, `trade_busy`, `blocked_pair`, `too_new`, `trade_off`, `rate_limited`; 10 msgs/s, invite 1/5 s | Task 7 refusal + rate-limit tests |
| §5 system furniture (`itemId === ''`) and placed instances never offerable | `TRADE_ITEM_ID` rejects `''`; `checkOffer` rejects placed; tests in Tasks 2, 5, 7 |
| §6 all message names and payloads | Part 1 Global Constraints; Task 7 Interfaces; Task 10 senders/handlers |
| §7 Trade button next to duel button | Task 13 |
| §7 TradeWindow in VipModal, own `trade.css`, 2 columns × 9, picker (steppers + `#serial`, BuildBar `Thumb`), coin input, Accept → Confirm with 3 s ring, warning, 🚩 header, 2 s changed-slot flash | Task 12 (+ Task 10 flash logic tests) |
| §7 incoming popup "{handle} wants to trade" Accept / Decline | Task 12 `phase === 'incoming'` |
| Testing: TradeBook fake clock; executeTrade PGlite cases; transaction rollback; gate helper; smoke-trade.mjs incl. placed-mid-trade | Tasks 6, 4, 1, 5, 14 |
| Out of scope: owner settings UI, escrow, cross-room/offline, pet | not implemented |

Resolved ambiguities:
- `t_state.confirmAt` carries milliseconds remaining (not an absolute server timestamp) so the client countdown is immune to clock skew; the client stores `confirmEndsAt = performance.now() + confirmAt`.
- Trade client state lives in a separate `client/src/trade.ts` store (table-games pattern) instead of `GameActions` in `store.ts`, so `store.ts` (with another session's `customizeFocus` work) is untouched.
- The base spec's `for update` row locks and "unequip traded pet" are dropped: guarded single-statement updates inside the PGlite transaction already serialize, and `users.pet_item` does not exist until Stage 3.
- The addendum's Mod API bullet supersedes the base spec's `recentTrades`/`recentRolls` additions to `/api/mod/reports`; only `GET /api/mod/trades` is built.
- Refusal code for blocks is `blocked_pair` (addendum) rather than the base spec's `blocked`, matching the existing call/duel code and its client text.
- An expired invite answered late, or answered after it was swept, closes the popup with `t_done {ok:false, code:'expired'}` instead of a `sys no_invite` toast (whose existing text says "call expired").

Type/name consistency checked across parts: `Offer`, `ResolvedOffer`, `ResolvedSlot`, `TradeStateMsg`, `TradeDoneMsg`, `TradeFailCode`, `TradeDoneCode`, `TradeLogOffer` (shared, Task 2) are the only trade types used by `repo.ts`, `ledger.ts`, `offers.ts`, `controller.ts`, `trade.ts`, `tradeLogic.ts`, `TradeWindow.tsx`; `TradeController.handle/leave/sweep` and `TRADE_CLIENT_MESSAGES` match the GameRoom hooks; `trade.invite/respond/offer/accept/confirm/cancel/report` match ProfileSheet and TradeWindow calls.
