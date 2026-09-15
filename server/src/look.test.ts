import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, ITEMS, normalizeAvatar, randomAvatar } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { equippableLook, joinLook, ownedLook, saveLook } from './look';

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

  it('writes the stripped look back so /api/me and friend/leaderboard rows stop showing unowned items', async () => {
    const u = await repo.createUser('m'.repeat(32), normalizeAvatar({ ...saved, [premium.slot]: premium.id }));
    await joinLook(repo, u);
    expect((await repo.userById(u.id))!.avatar[premium.slot]).toBe(DEFAULT_AVATAR[premium.slot]);
    const u2 = await repo.createUser('n'.repeat(32), normalizeAvatar({ ...saved, [premium.slot]: premium.id }));
    expect((await ownedLook(repo, u2))[premium.slot]).toBe(DEFAULT_AVATAR[premium.slot]);
    expect((await repo.userById(u2.id))!.avatar[premium.slot]).toBe(DEFAULT_AVATAR[premium.slot]);
  });

  it('saveLook resolves only after the write lands, with the stripped look that was saved', async () => {
    let finish!: () => void;
    const writes: unknown[] = [];
    const slow = {
      inventory: async () => ({ items: {}, instances: [], coins: 0 }),
      setAvatar: (_id: string, look: unknown) => new Promise<void>((r) => (finish = () => (writes.push(look), r()))),
    } as unknown as Repo;
    let acked: unknown = null;
    const p = saveLook(slow, 'u1', { ...saved, [premium.slot]: premium.id }).then((look) => (acked = look));
    await new Promise((r) => setTimeout(r, 10));
    expect(acked).toBeNull();
    finish();
    await p;
    expect(writes).toHaveLength(1);
    expect((acked as typeof saved)[premium.slot]).toBe(DEFAULT_AVATAR[premium.slot]);
  });

  it('a join waits for a save still in flight and wears the new look', async () => {
    const u = await repo.createUser('o'.repeat(32), saved);
    const fresh = normalizeAvatar({ ...saved, body: 'male', torsoColour: 'blue' });
    const saving = saveLook(repo, u.id, fresh); // not awaited: the old page navigated away
    const look = await joinLook(repo, u); // u still holds the stale row read in onAuth
    await saving;
    expect(look).toEqual(fresh);
  });

  it('keeps premium items the user owns', async () => {
    const wearing = normalizeAvatar({ ...saved, [premium.slot]: premium.id });
    const u = await repo.createUser('l'.repeat(32), wearing);
    await repo.addItem(u.id, premium.id, 1);
    expect((await equippableLook(repo, u.id, wearing))[premium.slot]).toBe(premium.id);
  });
});
