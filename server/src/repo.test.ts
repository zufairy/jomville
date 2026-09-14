import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';

let db: Db;
let repo: Repo;
const TOKEN = 'a'.repeat(32);

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
});
afterAll(() => db.close());

describe('Repo', () => {
  it('creates a user with a home room, finds by token', async () => {
    expect(await repo.userByToken(TOKEN)).toBeNull();
    const u = await repo.createUser(TOKEN, DEFAULT_AVATAR);
    expect(u.handle).toMatch(/^[a-z]+_[a-z]+\d\d$/);
    const home = await repo.homeRoom(u.id);
    expect(home).toMatch(/^[a-z0-9]{8}$/);
    const again = await repo.userByToken(TOKEN);
    expect(again?.id).toBe(u.id);
    expect(await repo.userByToken('short')).toBeNull();
  });

  it('renaming the handle renames the default room only', async () => {
    const u = (await repo.userByToken(TOKEN))!;
    expect(await repo.setHandle(u.id, 'new_name')).toBe(true);
    const slug = (await repo.homeRoom(u.id))!;
    expect((await repo.room(slug))?.name).toBe("new_name's room");
    expect(await repo.setHandle(u.id, 'BAD NAME')).toBe(false);
  });

  it('persists layout and room metadata', async () => {
    const u = await repo.userByToken(TOKEN);
    const slug = (await repo.homeRoom(u!.id))!;
    await repo.saveLayout(slug, [{ id: 'abcd', def: 'chair', x: 1, y: 2, rot: 1 }]);
    expect(await repo.updateRoom(slug, { name: '  my   cozy place  ', category: 'chill' })).toBe(true);
    expect(await repo.updateRoom(slug, { category: 'casino' })).toBe(false);
    const r = await repo.room(slug);
    expect(r?.layout).toEqual([{ id: 'abcd', def: 'chair', x: 1, y: 2, rot: 1 }]);
    expect(r?.name).toBe('my cozy place');
    expect(r?.category).toBe('chill');
  });

  it('lists public rooms with 24h unique visitors', async () => {
    const u = await repo.userByToken(TOKEN);
    const slug = (await repo.homeRoom(u!.id))!;
    await repo.recordVisit(slug, u!.id);
    await repo.recordVisit(slug, u!.id); // deduped within the hour
    const list = await repo.listPublic('top');
    expect(list.find((r) => r.slug === slug)?.visitors24h).toBe(1);
    expect(list[0].owner).toBe(u!.handle);
  });
});

describe('system rooms', () => {
  it('seeds the Main Lobby idempotently under the system user', async () => {
    await repo.ensureSystemRooms();
    await repo.ensureSystemRooms();
    const r = await repo.room('mainlobby');
    expect(r?.name).toBe('Main Lobby');
    expect(r?.size).toBe(40);
    expect(r?.theme).toBe('park');
    expect(r!.layout.length).toBeGreaterThan(100);
    const owner = await repo.userById(r!.owner_id);
    expect(owner?.handle).toBe('dovey');
    const sys = await db.query('select count(*)::int as n from users where handle = $1', ['dovey']);
    expect((sys[0] as { n: number }).n).toBe(1);
    expect(repo.isSystemRoom('mainlobby')).toBe(true);
  });
});

describe('economy', () => {
  it('buys into inventory, refuses when broke, moves items in and out', async () => {
    const u = (await repo.userByToken(TOKEN))!;
    const inv0 = await repo.inventory(u.id);
    expect(inv0.coins).toBe(1500);
    expect(await repo.buy(u.id, 'chair', 2)).toEqual({ ok: true, coins: 1500 - 80 });
    expect((await repo.buy(u.id, 'nope', 1)).ok).toBe(false);
    expect((await repo.buy(u.id, 'hottub', 5)).ok).toBe(false); // 4500 > balance
    expect((await repo.inventory(u.id)).items).toEqual({ chair: 2 });
    expect(await repo.addItem(u.id, 'chair', -1)).toBe(true);
    expect(await repo.addItem(u.id, 'chair', -5)).toBe(false);
    expect(await repo.addItem(u.id, 'lamp', -1)).toBe(false);
    expect(await repo.creditCoins(u.id, 5)).toBe(1425);
  });

  it('seeds the harbor with a mask', async () => {
    await repo.ensureSystemRooms();
    const r = await repo.room('harborwalk');
    expect(r?.size).toBe(36);
    expect(r?.mask?.length).toBe(36);
    expect(r?.theme).toBe('harbor');
  });
});

describe('room style', () => {
  it('stores a normalized style and merges partial updates', async () => {
    const u = (await repo.userByToken(TOKEN))!;
    const slug = (await repo.homeRoom(u.id))!;
    expect((await repo.room(slug))!.style.walls).toBe(true);
    expect(await repo.updateRoom(slug, { style: { bg: 0x1c1c1c, walls: false } })).toBe(true);
    expect(await repo.updateRoom(slug, { style: { floor: 0x2c3e50 } })).toBe(true);
    expect(await repo.updateRoom(slug, { style: 'x' })).toBe(false);
    const r = (await repo.room(slug))!;
    expect(r.style).toEqual({ floor: 0x2c3e50, wall: 0xffd6a5, bg: 0x1c1c1c, walls: false });
  });
});

describe('safety', () => {
  it('blocks hide in both directions and are idempotent', async () => {
    const a = await repo.createUser('b'.repeat(32), DEFAULT_AVATAR);
    const b = await repo.createUser('c'.repeat(32), DEFAULT_AVATAR);
    expect(await repo.block(a.id, a.id)).toBe(false);
    expect(await repo.block(a.id, b.id)).toBe(true);
    await repo.block(a.id, b.id); // no duplicate key blow-up
    expect(await repo.blockPairs(a.id)).toEqual([b.id]);
    expect(await repo.blockPairs(b.id)).toEqual([a.id]); // the blocked side is hidden too
    expect(await repo.blockedBy(b.id)).toEqual([]);
    await repo.unblock(a.id, b.id);
    expect(await repo.blockPairs(a.id)).toEqual([]);
  });

  it('reports land in the queue and can be resolved', async () => {
    const a = await repo.createUser('d'.repeat(32), DEFAULT_AVATAR);
    const b = await repo.createUser('e'.repeat(32), DEFAULT_AVATAR);
    expect(await repo.report(a.id, a.id, null, 'spam', null)).toBe(false);
    expect(await repo.report(a.id, b.id, 'mainlobby', 'grooming', 'asked my age')).toBe(true);
    const open = await repo.openReports();
    const mine = open.find((r) => r.reporter === a.handle);
    expect(mine).toMatchObject({ target: b.handle, reason: 'grooming', context: 'asked my age', room_id: 'mainlobby' });
    await repo.resolveReport(mine!.id, 'actioned');
    expect((await repo.openReports()).some((r) => r.id === mine!.id)).toBe(false);
  });
});
