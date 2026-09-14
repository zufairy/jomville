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
