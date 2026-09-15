import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, FRIEND_PENDING_LIMIT, SYSTEM_HANDLE } from '@dovey/shared';
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

  it('stores onboarding profile fields', async () => {
    const u = (await repo.userByToken(TOKEN))!;
    expect(await repo.setOnboarded(u.id)).toBe(false);
    await repo.setProfile(u.id, { state: 'Overseas', birthdate: '1999-12-31' });
    expect(await repo.setOnboarded(u.id)).toBe(true);
    expect(await repo.userById(u.id)).toMatchObject({ state: 'Overseas', birthdate: '1999-12-31', onboarded: true });
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
    expect(owner?.handle).toBe(SYSTEM_HANDLE);
    const sys = await db.query('select count(*)::int as n from users where handle = $1', [SYSTEM_HANDLE]);
    expect((sys[0] as { n: number }).n).toBe(1);
    expect(repo.isSystemRoom('mainlobby')).toBe(true);
  });

  it('renames the pre-rebrand system user in place instead of seeding a second one', async () => {
    const old = await openTestDb();
    try {
      const oldRepo = new Repo(old);
      await oldRepo.ensureSystemRooms();
      const before = await oldRepo.room('mainlobby');
      // simulate a database from before the rebrand
      await old.query('update users set handle = $1 where id = $2', ['dovey', before!.owner_id]);
      await oldRepo.ensureSystemRooms();
      const after = await oldRepo.room('mainlobby');
      expect(after!.owner_id).toBe(before!.owner_id);
      expect((await oldRepo.userById(after!.owner_id))?.handle).toBe(SYSTEM_HANDLE);
      const n = await old.query('select count(*)::int as n from users where handle = any($1::text[])', [[SYSTEM_HANDLE, 'dovey']]);
      expect((n[0] as { n: number }).n).toBe(1);
    } finally {
      await old.close();
    }
  });

  it('keeps the system handles out of reach of players', async () => {
    const u = (await repo.userByToken(TOKEN))!;
    expect(await repo.setHandle(u.id, SYSTEM_HANDLE)).toBe(false);
    expect(await repo.setHandle(u.id, 'dovey')).toBe(false);
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

describe('friends', () => {
  const mk = async (ch: string) => repo.createUser(ch.repeat(32), DEFAULT_AVATAR);

  it('request, accept, list, remove', async () => {
    const a = await mk('f');
    const b = await mk('g');
    expect(await repo.requestFriend(a.id, a.id)).toBe('self');
    expect(await repo.requestFriend(a.id, 'nobody')).toBe('no_user');
    expect(await repo.requestFriend(a.id, b.id)).toBe('sent');
    expect(await repo.requestFriend(a.id, b.id)).toBe('pending');
    const pb = await repo.pendingOf(b.id);
    expect(pb.incoming.map((r) => r.id)).toEqual([a.id]);
    expect((await repo.pendingOf(a.id)).outgoing.map((r) => r.id)).toEqual([b.id]);
    expect(await repo.respondFriend(b.id, a.id, true)).toBe('accepted');
    expect(await repo.areFriends(a.id, b.id)).toBe(true);
    expect(await repo.areFriends(b.id, a.id)).toBe(true);
    expect((await repo.friendsOf(a.id)).map((f) => f.handle)).toEqual([b.handle]);
    expect(typeof (await repo.friendsOf(a.id))[0].avatar).toBe('string');
    expect(await repo.friendIdsOf(b.id)).toEqual([a.id]);
    expect((await repo.pendingOf(b.id)).incoming).toEqual([]);
    expect(await repo.requestFriend(b.id, a.id)).toBe('already');
    await repo.removeFriend(b.id, a.id);
    expect(await repo.areFriends(a.id, b.id)).toBe(false);
  });

  it('a reverse request accepts; decline and cancel clear requests', async () => {
    const a = await mk('h');
    const b = await mk('i');
    const c = await mk('j');
    expect(await repo.requestFriend(a.id, b.id)).toBe('sent');
    expect(await repo.requestFriend(b.id, a.id)).toBe('accepted');
    expect(await repo.areFriends(a.id, b.id)).toBe(true);
    expect(await repo.requestFriend(a.id, c.id)).toBe('sent');
    expect(await repo.respondFriend(c.id, a.id, false)).toBe('declined');
    expect(await repo.respondFriend(c.id, a.id, true)).toBe('no_request');
    expect(await repo.requestFriend(c.id, a.id)).toBe('sent');
    await repo.cancelFriendRequest(c.id, a.id);
    expect((await repo.pendingOf(a.id)).incoming).toEqual([]);
  });

  it('blocks stop requests and remove friendships', async () => {
    const a = await mk('k');
    const b = await mk('l');
    expect(await repo.requestFriend(a.id, b.id)).toBe('sent');
    expect(await repo.respondFriend(b.id, a.id, true)).toBe('accepted');
    await repo.block(b.id, a.id);
    expect(await repo.areFriends(a.id, b.id)).toBe(false);
    expect(await repo.requestFriend(a.id, b.id)).toBe('blocked');
    expect(await repo.requestFriend(b.id, a.id)).toBe('blocked');
  });

  it('cancel/remove are no-ops when nothing exists, true when something is deleted', async () => {
    const a = await mk('m');
    const b = await mk('n');
    expect(await repo.cancelFriendRequest(a.id, b.id)).toBe(false);
    expect(await repo.removeFriend(a.id, b.id)).toBe(false);
    expect(await repo.requestFriend(a.id, b.id)).toBe('sent');
    expect(await repo.cancelFriendRequest(a.id, b.id)).toBe(true);
    expect(await repo.cancelFriendRequest(a.id, b.id)).toBe(false);
    expect(await repo.requestFriend(a.id, b.id)).toBe('sent');
    expect(await repo.respondFriend(b.id, a.id, true)).toBe('accepted');
    expect(await repo.removeFriend(a.id, b.id)).toBe(true);
    expect(await repo.removeFriend(a.id, b.id)).toBe(false);
  });

  it('blocking deletes pending requests both ways', async () => {
    const a = await mk('o');
    const b = await mk('p');
    expect(await repo.requestFriend(a.id, b.id)).toBe('sent');
    await repo.block(b.id, a.id);
    expect((await repo.pendingOf(a.id)).outgoing).toEqual([]);
    expect((await repo.pendingOf(b.id)).incoming).toEqual([]);
  });

  it('enforces the pending outgoing-request limit', async () => {
    const from = await mk('q');
    const targets = [];
    for (let i = 0; i < FRIEND_PENDING_LIMIT; i++) {
      targets.push(await repo.createUser(`p${i}`.padEnd(32, 'x'), DEFAULT_AVATAR));
    }
    for (const t of targets) {
      expect(await repo.requestFriend(from.id, t.id)).toBe('sent');
    }
    const oneMore = await repo.createUser('pOverflow'.padEnd(32, 'x'), DEFAULT_AVATAR);
    expect(await repo.requestFriend(from.id, oneMore.id)).toBe('limit');
  }, 20_000);
});
