import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, ITEMS, normalizeAvatar, randomAvatar } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { equippableLook, joinLook } from './look';

let db: Db;
let repo: Repo;

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
});
afterAll(() => db.close());

const premium = ITEMS.find((i) => i.rarity !== 'starter')!;
const saved = normalizeAvatar({ ...DEFAULT_AVATAR, body: 'female', torsoColour: 'red' });

describe('join look', () => {
  it('uses the stored look, not the look the client sends on join', async () => {
    const u = await repo.createUser('j'.repeat(32), saved);
    const other = randomAvatar(() => 0.99);
    const look = await joinLook(repo, u, { avatar: other });
    expect(look).toEqual(saved);
  });

  it('strips unowned premium items from the stored look back to the starter default', async () => {
    const u = await repo.createUser('k'.repeat(32), normalizeAvatar({ ...saved, [premium.slot]: premium.id }));
    const look = await joinLook(repo, u, { avatar: { [premium.slot]: premium.id } });
    expect(look[premium.slot]).toBe(DEFAULT_AVATAR[premium.slot]);
    expect(look.body).toBe('female');
  });

  it('keeps premium items the user owns', async () => {
    const wearing = normalizeAvatar({ ...saved, [premium.slot]: premium.id });
    const u = await repo.createUser('l'.repeat(32), wearing);
    await repo.addItem(u.id, premium.id, 1);
    expect((await equippableLook(repo, u.id, wearing))[premium.slot]).toBe(premium.id);
  });
});
