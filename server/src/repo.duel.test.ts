import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo, User } from './repo';

let db: Db;
let repo: Repo;
let a: User;
let b: User;
const setCoins = (id: string, n: number) => db.query('update users set coins = $2 where id = $1', [id, n]);
const duelRows = () => db.query<{ n: number }>('select count(*)::int as n from duels').then((r) => r[0].n);

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  a = await repo.createUser('duelRepoA'.padEnd(32, 'a'), DEFAULT_AVATAR);
  b = await repo.createUser('duelRepoB'.padEnd(32, 'b'), DEFAULT_AVATAR);
});
afterAll(() => db.close());

describe('staked duel escrow', () => {
  it('takes both stakes in one go', async () => {
    await setCoins(a.id, 1000);
    await setCoins(b.id, 1000);
    expect(await repo.escrowDuel(a.id, b.id, 250)).toEqual({ ok: true, coins: [750, 750] });
    expect(await repo.coins(a.id)).toBe(750);
    expect(await repo.coins(b.id)).toBe(750);
  });

  it('charges nobody when the second player is short (rollback)', async () => {
    await setCoins(a.id, 500);
    await setCoins(b.id, 40);
    expect(await repo.escrowDuel(a.id, b.id, 50)).toEqual({ ok: false, short: 'b' });
    expect(await repo.coins(a.id)).toBe(500);
    expect(await repo.coins(b.id)).toBe(40);
  });

  it('charges nobody when the first player is short', async () => {
    await setCoins(a.id, 10);
    await setCoins(b.id, 500);
    expect(await repo.escrowDuel(a.id, b.id, 25)).toEqual({ ok: false, short: 'a' });
    expect(await repo.coins(a.id)).toBe(10);
    expect(await repo.coins(b.id)).toBe(500);
  });

  it('refuses a non-positive stake', async () => {
    await expect(repo.escrowDuel(a.id, b.id, 0)).rejects.toThrow();
  });
});

describe('duel settlement', () => {
  it('credits the winner the pot and logs the duel', async () => {
    await setCoins(a.id, 950);
    await setCoins(b.id, 950);
    const coins = await repo.settleDuel({
      aId: a.id,
      bId: b.id,
      stake: 50,
      credits: [{ userId: a.id, amount: 100 }],
      winnerId: a.id,
      outcome: 'win',
      roomId: 'gameden',
      log: true,
    });
    expect(coins).toEqual({ [a.id]: 1050 });
    expect(await repo.coins(b.id)).toBe(950);
    const rows = await db.query('select a_id, b_id, stake, winner_id, outcome, room_id from duels order by id desc limit 1');
    expect(rows[0]).toEqual({ a_id: a.id, b_id: b.id, stake: 50, winner_id: a.id, outcome: 'win', room_id: 'gameden' });
  });

  it('a draw refunds both stakes with no winner', async () => {
    await setCoins(a.id, 400);
    await setCoins(b.id, 300);
    const coins = await repo.settleDuel({
      aId: a.id,
      bId: b.id,
      stake: 100,
      credits: [
        { userId: a.id, amount: 100 },
        { userId: b.id, amount: 100 },
      ],
      winnerId: null,
      outcome: 'draw',
      roomId: 'gameden',
      log: true,
    });
    expect(coins).toEqual({ [a.id]: 500, [b.id]: 400 });
    const rows = await db.query<{ winner_id: string | null; outcome: string }>('select winner_id, outcome from duels order by id desc limit 1');
    expect(rows[0]).toEqual({ winner_id: null, outcome: 'draw' });
  });

  it('a free duel pays the reward without a log row', async () => {
    await setCoins(b.id, 100);
    const before = await duelRows();
    expect(
      await repo.settleDuel({ aId: a.id, bId: b.id, stake: 0, credits: [{ userId: b.id, amount: 25 }], winnerId: b.id, outcome: 'win', roomId: 'gameden', log: false }),
    ).toEqual({ [b.id]: 125 });
    expect(await duelRows()).toBe(before);
  });

  it('escrow then payout nets the winner +stake and the loser -stake', async () => {
    await setCoins(a.id, 1500);
    await setCoins(b.id, 1500);
    expect((await repo.escrowDuel(a.id, b.id, 50)).ok).toBe(true);
    await repo.settleDuel({ aId: a.id, bId: b.id, stake: 50, credits: [{ userId: b.id, amount: 100 }], winnerId: b.id, outcome: 'forfeit', roomId: 'gameden', log: true });
    expect(await repo.coins(a.id)).toBe(1450);
    expect(await repo.coins(b.id)).toBe(1550);
  });

  it('a failed log insert rolls the payout back', async () => {
    await setCoins(a.id, 100);
    const before = await duelRows();
    await expect(
      repo.settleDuel({ aId: a.id, bId: 'no-such-user', stake: 50, credits: [{ userId: a.id, amount: 100 }], winnerId: a.id, outcome: 'win', roomId: 'gameden', log: true }),
    ).rejects.toThrow();
    expect(await repo.coins(a.id)).toBe(100);
    expect(await duelRows()).toBe(before);
  });
});
