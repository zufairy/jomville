import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, STARTING_CREDITS, VEND_COST } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { awardCreditsFromSession } from './payments';

let db: Db;
let repo: Repo;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
});

afterAll(() => db.close());

describe('credit monetization', () => {
  it('starts new users with 200 credits and prices capsules at 100', async () => {
    const u = await repo.createUser('payments-start'.padEnd(32, 'x'), DEFAULT_AVATAR);
    expect(await repo.coins(u.id)).toBe(STARTING_CREDITS);
    expect(VEND_COST).toBe(100);
  });

  it('credits a paid Stripe checkout once', async () => {
    const u = await repo.createUser('payments-stripe'.padEnd(32, 'x'), DEFAULT_AVATAR);
    const session = {
      id: 'cs_test_leyparkCredits',
      payment_status: 'paid',
      amount_total: 3000,
      metadata: { purpose: 'credit_pack', user_id: u.id, pack_id: 'rm30', credits: '500', amount_sen: '3000' },
    };
    expect(await awardCreditsFromSession(repo, session)).toEqual({ granted: true, coins: 700 });
    expect(await awardCreditsFromSession(repo, session)).toEqual({ granted: false, coins: 700 });
  });
});
