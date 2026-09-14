import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';

let db: Db;
let repo: Repo;
let rich: string;
let poor: string;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.ensureLtdStock();
  rich = (await repo.createUser('casinoRich' + 'r'.repeat(24), DEFAULT_AVATAR)).id;
  poor = (await repo.createUser('casinoPoor' + 'p'.repeat(24), DEFAULT_AVATAR)).id;
  await repo.creditCoins(rich, 1_000_000);
});
afterAll(() => db.close());

describe('casino items', () => {
  it('seeds ltd stock from the catalog', async () => {
    const s = await repo.ltdStock();
    expect(s.dragon_egg).toEqual({ sold: 0, cap: 50 });
    expect(s.wheel_fortune).toEqual({ sold: 0, cap: 100 });
    expect(s.dicemaster).toBeUndefined();
  });

  it('buys an unlimited instance without a serial', async () => {
    const r = await repo.buyInstance(rich, 'dicemaster');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.serial).toBeNull();
    expect(r.coins).toBe(1_000_000 + 1500 - 8000);
    const inv = await repo.inventory(rich);
    expect(inv.instances.map((i) => i.def)).toContain('dicemaster');
    expect(inv.items.dicemaster).toBeUndefined();
  });

  it('assigns increasing serials and refunds when sold out', async () => {
    await db.query("update ltd_stock set cap = 2 where def = 'dragon_egg'");
    const a = await repo.buyInstance(rich, 'dragon_egg');
    const b = await repo.buyInstance(rich, 'dragon_egg');
    const before = await repo.coins(rich);
    const c = await repo.buyInstance(rich, 'dragon_egg');
    expect(a.ok && a.item.serial).toBe(1);
    expect(b.ok && b.item.serial).toBe(2);
    expect(c).toEqual({ ok: false, reason: 'sold_out' });
    expect(await repo.coins(rich)).toBe(before);
  });

  it('concurrent buys never exceed the cap', async () => {
    await db.query("update ltd_stock set cap = 3, sold = 0 where def = 'throne_gold'");
    const results = await Promise.all(Array.from({ length: 6 }, () => repo.buyInstance(rich, 'throne_gold')));
    const serials = results.flatMap((r) => (r.ok ? [r.item.serial] : []));
    expect(serials.sort()).toEqual([1, 2, 3]);
  });

  it('refuses when broke and refuses instance defs through buy()', async () => {
    expect(await repo.buyInstance(poor, 'holodice')).toEqual({ ok: false, reason: 'not_enough_coins' });
    expect(await repo.buy(rich, 'holodice', 1)).toEqual({ ok: false, reason: 'not_for_sale' });
    expect(await repo.buyInstance(rich, 'chair')).toEqual({ ok: false, reason: 'not_for_sale' });
  });

  it('claims and releases placement once', async () => {
    const r = await repo.buyInstance(rich, 'holodice');
    if (!r.ok) throw new Error('buy failed');
    expect(await repo.claimPlacement(r.item.id, poor, 'holodice', 'room1')).toBeNull();
    expect(await repo.claimPlacement(r.item.id, rich, 'dicemaster', 'room1')).toBeNull();
    expect(await repo.claimPlacement(r.item.id, rich, 'holodice', 'room1')).toEqual({ serial: null });
    expect(await repo.claimPlacement(r.item.id, rich, 'holodice', 'room2')).toBeNull();
    expect(await repo.releasePlacement(r.item.id, 'room2')).toBeNull();
    expect((await repo.instances(rich)).find((i) => i.id === r.item.id)?.placed).toBe('room1');
    expect(await repo.releasePlacement(r.item.id, 'room1')).toBe(rich);
    expect((await repo.instances(rich)).find((i) => i.id === r.item.id)?.placed).toBeNull();
  });

  it('sweeps placements missing from their saved layout and lists placed ids per room', async () => {
    const buy = async () => {
      const r = await repo.buyInstance(rich, 'dicemaster');
      if (!r.ok) throw new Error('buy failed');
      return r.item.id;
    };
    for (const id of ['sweepA', 'sweepB']) {
      await db.query("insert into rooms (id, owner_id, name, layout) values ($1, $2, 'sweep', '[]') on conflict (id) do nothing", [id, rich]);
    }
    const kept = await buy();
    const stranded = await buy();
    const noRoom = await buy();
    await repo.claimPlacement(kept, rich, 'dicemaster', 'sweepA');
    await repo.claimPlacement(stranded, rich, 'dicemaster', 'sweepB');
    await repo.claimPlacement(noRoom, rich, 'dicemaster', 'no_such_room');
    await repo.saveLayout('sweepA', [{ id: 'd1', def: 'dicemaster', x: 1, y: 1, rot: 0, itemId: kept }]);

    expect(await repo.placedItemIds('sweepA')).toEqual(new Set([kept]));
    expect(await repo.placedItemIds('sweepB')).toEqual(new Set([stranded]));

    expect(await repo.releaseOrphanPlacements()).toBe(2);
    const placed = new Map((await repo.instances(rich)).map((i) => [i.id, i.placed]));
    expect(placed.get(kept)).toBe('sweepA');
    expect(placed.get(stranded)).toBeNull();
    expect(placed.get(noRoom)).toBeNull();
    expect(await repo.placedItemIds('sweepB')).toEqual(new Set());
  });

  it('records and prunes rolls', async () => {
    await repo.recordRoll('room1', 'furni1', rich, 'dice6', 4);
    await db.query("insert into rolls (room_id, furni_id, user_id, kind, result, at) values ('room1', 'f', $1, 'dice6', 2, now() - interval '8 days')", [rich]);
    await repo.pruneRolls();
    const rows = await db.query<{ result: number }>('select result from rolls order by id');
    expect(rows.map((r) => r.result)).toEqual([4]);
  });
});
