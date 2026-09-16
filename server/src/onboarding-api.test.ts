import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';

const TOKEN = 'o'.repeat(32);
let db: Db;
let repo: Repo;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.createUser(TOKEN, DEFAULT_AVATAR);
});

afterAll(async () => {
  await db.close();
});

describe('onboarding persistence', () => {
  it('requires profile fields before onboarded is true', async () => {
    const user = (await repo.userByToken(TOKEN))!;
    expect(await repo.setOnboarded(user.id)).toBe(false);

    await repo.setProfile(user.id, { state: 'Selangor', birthdate: '2000-01-01' });
    expect(await repo.setOnboarded(user.id)).toBe(true);
    expect(await repo.userById(user.id)).toMatchObject({
      state: 'Selangor',
      birthdate: '2000-01-01',
      onboarded: true,
    });
  });
});
