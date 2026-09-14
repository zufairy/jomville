import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, FURNITURE, SYSTEM_HANDLE, isInstanceDef } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';

const PLAIN = FURNITURE.find((d) => d.price > 0 && !isInstanceDef(d))!;
const LTD = FURNITURE.find((d) => !!d.ltd && d.price > 0)!;
const FREE = FURNITURE.find((d) => d.price === 0);

let db: Db;
let repo: Repo;

async function user(handle: string, coins = 1500): Promise<string> {
  const u = await repo.createUser(handle.padEnd(32, 'x'), DEFAULT_AVATAR);
  await db.query('update users set handle = $2, coins = $3 where id = $1', [u.id, handle, coins]);
  return u.id;
}

async function instance(owner: string, def: string, serial: number | null, placed: string | null = null) {
  await db.query('insert into items (id, def, owner_id, serial, placed_room) values ($1, $2, $3, $4, $5)', [
    `${owner.slice(0, 6)}-${def}-${serial ?? 'n'}-${Math.random().toString(36).slice(2, 8)}`,
    def,
    owner,
    serial,
    placed,
  ]);
}

beforeEach(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.ensureSystemRooms();
});
afterEach(() => db.close());

describe('leaderboards repo', () => {
  it('ranks coins with ties, excluding hidden and system users', async () => {
    await user('lb_a', 5000);
    await user('lb_b', 3000);
    await user('lb_c', 3000);
    const h = await user('lb_h', 9000);
    await repo.setHideRank(h, true);
    const boards = await repo.leaderboards('2026-09-14');
    expect(boards.coins.map((r) => [r.rank, r.handle, r.value])).toEqual([
      [1, 'lb_a', 5000],
      [2, 'lb_b', 3000],
      [2, 'lb_c', 3000],
    ]);
    expect(boards.coins.some((r) => r.handle === SYSTEM_HANDLE)).toBe(false);
    expect(typeof boards.coins[0].avatar).toBe('string');
    expect(JSON.parse(boards.coins[0].avatar)).toBeTypeOf('object');
  });

  it('values assets: inventory, placed and unplaced instances, LTD at 3x, price-0 and unknown defs at 0', async () => {
    expect(PLAIN).toBeDefined();
    expect(LTD).toBeDefined();
    const a = await user('lb_a', 1);
    const b = await user('lb_b', 1);
    await user('lb_c', 1); // owns nothing: not on the board
    const h = await user('lb_h', 1);
    await repo.addItem(a, PLAIN.id, 2);
    await instance(a, LTD.id, 1);
    await instance(a, PLAIN.id, null, 'someroom');
    if (FREE) await repo.addItem(a, FREE.id, 5);
    await repo.addItem(a, 'no_such_def', 10);
    await repo.addItem(b, PLAIN.id, 1);
    await instance(h, LTD.id, 2);
    await repo.setHideRank(h, true);
    const boards = await repo.leaderboards('2026-09-14');
    expect(boards.assets.map((r) => [r.rank, r.handle, r.value])).toEqual([
      [1, 'lb_a', 3 * PLAIN.price + 3 * LTD.price],
      [2, 'lb_b', PLAIN.price],
    ]);
  });

  it('counts play minutes with a lazy weekly reset at the KL Monday boundary', async () => {
    const a = await user('lb_a');
    const b = await user('lb_b');
    await repo.addPlayMinutes([a, b], '2026-09-07');
    await repo.addPlayMinutes([a, b], '2026-09-07');
    await repo.addPlayMinutes([a], '2026-09-14');
    const raw = await db.query<{ handle: string; play_minutes: number; play_week: number; s: string }>(
      "select handle, play_minutes, play_week, play_week_start::text as s from users where handle like 'lb_%' order by handle",
    );
    expect(raw).toEqual([
      { handle: 'lb_a', play_minutes: 3, play_week: 1, s: '2026-09-14' },
      { handle: 'lb_b', play_minutes: 2, play_week: 2, s: '2026-09-07' },
    ]);
    const boards = await repo.leaderboards('2026-09-14');
    // b's week is stale: 0 this week, so not listed
    expect(boards.timeWeek.map((r) => [r.handle, r.value])).toEqual([['lb_a', 1]]);
    expect(boards.timeAll.map((r) => [r.rank, r.handle, r.value])).toEqual([
      [1, 'lb_a', 3],
      [2, 'lb_b', 2],
    ]);
    await repo.addPlayMinutes([b], '2026-09-14');
    const [rb] = await db.query<{ play_week: number; s: string }>("select play_week, play_week_start::text as s from users where handle = 'lb_b'");
    expect(rb).toEqual({ play_week: 1, s: '2026-09-14' });
    await repo.addPlayMinutes([], '2026-09-14'); // no-op
  });

  it('limits each board', async () => {
    for (let i = 0; i < 4; i++) await user(`lb_${i}`, 2000 + i);
    const boards = await repo.leaderboards('2026-09-14', 2);
    expect(boards.coins.map((r) => r.handle)).toEqual(['lb_3', 'lb_2']);
  });

  it('gives personal ranks outside the top list, null for zero, hidden flag for hidden users', async () => {
    await user('lb_a', 5000);
    const b = await user('lb_b', 3000);
    const c = await user('lb_c', 3000);
    const h = await user('lb_h', 9000);
    await repo.setHideRank(h, true);
    await repo.addPlayMinutes([b], '2026-09-14');
    const rc = await repo.leaderboardRanks(c, '2026-09-14');
    expect(rc).toEqual({
      hidden: false,
      handle: 'lb_c',
      coins: { rank: 2, value: 3000 },
      assets: { rank: null, value: 0 },
      timeWeek: { rank: null, value: 0 },
      timeAll: { rank: null, value: 0 },
    });
    const rb = await repo.leaderboardRanks(b, '2026-09-14');
    expect(rb && !rb.hidden && rb.timeWeek).toEqual({ rank: 1, value: 1 });
    expect(await repo.leaderboardRanks(h, '2026-09-14')).toEqual({ hidden: true });
    expect(await repo.leaderboardRanks('nobody', '2026-09-14')).toBeNull();
    await repo.setHideRank(h, false);
    const rh = await repo.leaderboardRanks(h, '2026-09-14');
    expect(rh && !rh.hidden && rh.coins).toEqual({ rank: 1, value: 9000 });
  });

  it('setHideRank reports whether the flag actually changed', async () => {
    const a = await user('lb_a', 100);
    expect(await repo.setHideRank(a, true)).toBe(true);
    // already true: no-op
    expect(await repo.setHideRank(a, true)).toBe(false);
    expect(await repo.setHideRank(a, false)).toBe(true);
    expect(await repo.setHideRank(a, false)).toBe(false);
  });
});
