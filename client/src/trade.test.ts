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
import { bindTradeSender, onTradeDone, onTradeIncoming, onTradeState, onTradeSys, trade, tradeSysText, useTrade } from './trade';

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

describe('trade window fixes', () => {
  const chair = (qty: number) => ({ def: 'chair', qty, itemId: null, name: 'chair', serial: null });

  it('a t_done about another invite does not close the open window', async () => {
    useTrade.getState().applyState(state(), 1);
    await onTradeDone({ ok: false, code: 'expired', with: 'p9' });
    await onTradeDone({ ok: false, code: 'trade_busy', with: 'p9' });
    expect(useTrade.getState().phase).toBe('open');
    await onTradeDone({ ok: false, code: 'cancelled', with: 'p1' });
    expect(useTrade.getState().phase).toBe('idle');
  });

  it('a waiting card ignores answers from other people', async () => {
    trade.invite('p1', 'bob');
    await onTradeDone({ ok: false, code: 'declined', with: 'p2' });
    expect(useTrade.getState().phase).toBe('waiting');
  });

  it('rapid offer taps build on the pending draft until the server catches up', () => {
    useTrade.getState().applyState(state(), 1);
    trade.offer({ slots: [{ def: 'chair', qty: 1 }], coins: 0 });
    trade.offer({ slots: [{ def: 'chair', qty: 2 }], coins: 0 });
    useTrade.getState().applyState(state({ you: { slots: [chair(1)], coins: 0 } }), 2);
    expect(useTrade.getState().draft).toEqual({ slots: [{ def: 'chair', qty: 2 }], coins: 0 });
    useTrade.getState().applyState(state({ you: { slots: [chair(2)], coins: 0 } }), 3);
    expect(useTrade.getState().draft).toBeNull();
    trade.offer({ slots: [{ def: 'chair', qty: 9 }], coins: 0 });
    onTradeSys('insufficient_items');
    expect(useTrade.getState().draft).toBeNull();
  });

  it('trade refusals use trade copy only while trading', () => {
    expect(tradeSysText('not_owned')).toBeNull();
    trade.invite('p1', 'bob');
    expect(tradeSysText('no_such_player')).toBe("they're not here");
    expect(tradeSysText('blocked_pair')).toBe("you can't trade with someone you blocked");
    useTrade.getState().applyState(state(), 1);
    expect(tradeSysText('not_owned')).toBe("that item isn't yours to trade anymore");
    expect(tradeSysText('overlap')).toBeNull();
  });
});
