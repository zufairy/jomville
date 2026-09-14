import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
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
