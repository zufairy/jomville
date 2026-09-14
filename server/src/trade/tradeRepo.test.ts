import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import type { Offer } from '@dovey/shared';
import { Db, openTestDb } from '../db';
import { Repo } from '../repo';

let db: Db;
let repo: Repo;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.ensureLtdStock();
});
afterAll(() => db.close());

describe('trade migrations', () => {
  it('creates the trades table with both indexes', async () => {
    const idx = await db.query<{ indexname: string }>("select indexname from pg_indexes where tablename = 'trades' order by indexname");
    expect(idx.map((r) => r.indexname)).toEqual(expect.arrayContaining(['trades_a', 'trades_b']));
  });

  it('play_minutes starts at 0 and ticks; standing reports account age', async () => {
    const u = await repo.createUser('standing' + 's'.repeat(24), DEFAULT_AVATAR);
    const s0 = await repo.tradeStanding(u.id);
    expect(s0?.playMinutes).toBe(0);
    expect(Date.now() - s0!.createdAt.getTime()).toBeLessThan(60_000);
    await repo.addPlayMinute(u.id);
    await repo.addPlayMinute(u.id);
    expect((await repo.tradeStanding(u.id))?.playMinutes).toBe(2);
    expect(await repo.tradeStanding('nobody')).toBeNull();
  });

  it('rooms default to trade_enabled = true', async () => {
    const u = await repo.createUser('roomflag' + 'r'.repeat(24), DEFAULT_AVATAR);
    const slug = (await repo.homeRoom(u.id))!;
    expect((await repo.room(slug))?.trade_enabled).toBe(true);
    await db.query('update rooms set trade_enabled = false where id = $1', [slug]);
    expect((await repo.room(slug))?.trade_enabled).toBe(false);
  });
});

async function rich(tag: string, coins: number) {
  const u = await repo.createUser(tag.padEnd(32, 'x'), DEFAULT_AVATAR);
  await db.query('update users set coins = $2 where id = $1', [u.id, coins]);
  return u.id;
}

async function instance(owner: string, def: string) {
  const r = await repo.buyInstance(owner, def);
  if (!r.ok) throw new Error(`buy ${def} failed: ${r.reason}`);
  return r.item;
}

const snapshot = async (id: string) => {
  const inv = await repo.inventory(id);
  return { coins: inv.coins, items: inv.items, instances: inv.instances.map((i) => i.id).sort() };
};

describe('executeTrade', () => {
  it('moves coins, a stack, an LTD rare and a plain instance, keeping the serial, and logs it', async () => {
    const a = await rich('tradeHappyA', 200_000);
    const b = await rich('tradeHappyB', 1000);
    await repo.addItem(a, 'chair', 3);
    const throne = await instance(a, 'throne_gold');
    const dice = await instance(a, 'dicemaster');
    const coinsA = await repo.coins(a);
    const offerA: Offer = { slots: [{ def: 'chair', qty: 2 }, { itemId: throne.id }, { itemId: dice.id }], coins: 500 };
    const offerB: Offer = { slots: [], coins: 200 };

    const r = await repo.executeTrade(a, b, offerA, offerB, 'room1');
    expect(r.ok).toBe(true);

    const invA = await repo.inventory(a);
    const invB = await repo.inventory(b);
    expect(invA.coins).toBe(coinsA - 500 + 200);
    expect(invB.coins).toBe(1000 + 500 - 200);
    expect(invA.items.chair).toBe(1);
    expect(invB.items.chair).toBe(2);
    expect(invA.instances.map((i) => i.id)).not.toContain(throne.id);
    const moved = invB.instances.find((i) => i.id === throne.id);
    expect(moved).toMatchObject({ def: 'throne_gold', serial: throne.serial, placed: null });
    expect(throne.serial).toBeGreaterThan(0);
    expect(invB.instances.find((i) => i.id === dice.id)?.serial).toBeNull();

    const log = await repo.tradesFor(b);
    expect(log[0]).toMatchObject({ a_id: a, b_id: b, room_id: 'room1' });
    expect(log[0].a_offer).toEqual({
      coins: 500,
      slots: [
        { def: 'chair', qty: 2 },
        { itemId: throne.id, def: 'throne_gold', serial: throne.serial },
        { itemId: dice.id, def: 'dicemaster', serial: null },
      ],
    });
    expect(log[0].b_offer).toEqual({ coins: 200, slots: [] });
  });

  it('insufficient coins on the second side rolls back the first side', async () => {
    const a = await rich('tradeCoinsA', 5000);
    const b = await rich('tradeCoinsB', 50);
    await repo.addItem(a, 'chair', 1);
    const before = [await snapshot(a), await snapshot(b)];
    const r = await repo.executeTrade(a, b, { slots: [{ def: 'chair', qty: 1 }], coins: 1000 }, { slots: [], coins: 51 }, null);
    expect(r).toEqual({ ok: false, code: 'insufficient_coins' });
    expect([await snapshot(a), await snapshot(b)]).toEqual(before);
    expect(await repo.tradesFor(a)).toEqual([]);
  });

  it('a placed instance fails the trade and nothing moves', async () => {
    const a = await rich('tradePlacedA', 200_000);
    const b = await rich('tradePlacedB', 5000);
    const throne = await instance(a, 'throne_gold');
    expect(await repo.claimPlacement(throne.id, a, 'throne_gold', 'roomX')).not.toBeNull();
    const before = [await snapshot(a), await snapshot(b)];
    const r = await repo.executeTrade(a, b, { slots: [{ itemId: throne.id }], coins: 0 }, { slots: [], coins: 4000 }, null);
    expect(r).toEqual({ ok: false, code: 'not_owned' });
    expect([await snapshot(a), await snapshot(b)]).toEqual(before);
    expect((await repo.instances(a)).find((i) => i.id === throne.id)?.placed).toBe('roomX');
  });

  it('an instance owned by someone else fails with not_owned', async () => {
    const a = await rich('tradeStealA', 1000);
    const b = await rich('tradeStealB', 200_000);
    const theirs = await instance(b, 'throne_gold');
    expect(await repo.executeTrade(a, b, { slots: [{ itemId: theirs.id }], coins: 0 }, { slots: [], coins: 0 }, null)).toEqual({ ok: false, code: 'not_owned' });
    expect((await repo.instances(b)).map((i) => i.id)).toContain(theirs.id);
  });

  it('a stack shortfall rolls back coins already moved', async () => {
    const a = await rich('tradeStackA', 5000);
    const b = await rich('tradeStackB', 5000);
    await repo.addItem(b, 'lamp', 1);
    const before = [await snapshot(a), await snapshot(b)];
    const r = await repo.executeTrade(a, b, { slots: [], coins: 700 }, { slots: [{ def: 'lamp', qty: 2 }], coins: 0 }, null);
    expect(r).toEqual({ ok: false, code: 'insufficient_items' });
    expect([await snapshot(a), await snapshot(b)]).toEqual(before);
  });

  it('refuses a bad offer shape and a self trade without touching the database', async () => {
    const a = await rich('tradeShapeA', 5000);
    expect(await repo.executeTrade(a, a, { slots: [], coins: 1 }, { slots: [], coins: 0 }, null)).toEqual({ ok: false, code: 'bad_offer' });
    const b = await rich('tradeShapeB', 5000);
    expect(await repo.executeTrade(a, b, { slots: [{ def: 'dicemaster', qty: 1 }], coins: 0 }, { slots: [], coins: 0 }, null)).toEqual({ ok: false, code: 'bad_offer' });
  });
});

describe('tradesFor', () => {
  it('returns the newest 50 trades on either side with handles', async () => {
    const a = await rich('tradeLogA', 0);
    const b = await rich('tradeLogB', 0);
    await db.query(
      `insert into trades (a_id, b_id, a_offer, b_offer, room_id, at)
       select $1, $2, jsonb_build_object('coins', g, 'slots', '[]'::jsonb), '{"coins":0,"slots":[]}'::jsonb, 'r', now() - make_interval(secs => 100 - g)
       from generate_series(1, 55) g`,
      [a, b],
    );
    const rows = await repo.tradesFor(b);
    expect(rows).toHaveLength(50);
    expect(rows[0].a_offer.coins).toBe(55);
    expect(rows[49].a_offer.coins).toBe(6);
    const handleA = (await repo.userById(a))!.handle;
    expect(rows[0].a_handle).toBe(handleA);
    expect(await repo.tradesFor(a, 3)).toHaveLength(3);
  });
});

describe('executeTrade ordering and duplicates', () => {
  it('nobody pays with stacks they are about to receive', async () => {
    const a = await rich('tradeRecvA', 0);
    const b = await rich('tradeRecvB', 0);
    await repo.addItem(a, 'chair', 2);
    await repo.addItem(b, 'chair', 1);
    const before = [await snapshot(a), await snapshot(b)];
    const r = await repo.executeTrade(a, b, { slots: [{ def: 'chair', qty: 2 }], coins: 0 }, { slots: [{ def: 'chair', qty: 3 }], coins: 0 }, null);
    expect(r).toEqual({ ok: false, code: 'insufficient_items' });
    expect([await snapshot(a), await snapshot(b)]).toEqual(before);
  });

  it('refuses the same item id in both offers', async () => {
    const a = await rich('tradeDupA', 200_000);
    const b = await rich('tradeDupB', 0);
    const throne = await instance(a, 'throne_gold');
    const r = await repo.executeTrade(a, b, { slots: [{ itemId: throne.id }], coins: 0 }, { slots: [{ itemId: throne.id }], coins: 0 }, null);
    expect(r).toEqual({ ok: false, code: 'bad_offer' });
    expect((await repo.instances(a)).map((i) => i.id)).toContain(throne.id);
    expect(await repo.tradesFor(a)).toEqual([]);
  });
});
