import { createHash, randomBytes } from 'node:crypto';
import {
  AvatarConfig,
  DEFAULT_AVATAR,
  HANDLE,
  Placement,
  RoomMask,
  RoomStyle,
  normalizeStyle,
  SYSTEM_HANDLE,
  SYSTEM_ROOMS,
  furnitureDef,
  isSystemRoom,
  parseMask,
  ROOM_CATEGORIES,
  ROOM_NAME_MAX,
  ROOM_SLUG,
  normalizeAvatar,
  randomHandle,
  randomSlug,
} from '@dovey/shared';
import { Db } from './db';

export interface User {
  id: string;
  handle: string;
  avatar: AvatarConfig;
  onboarded: boolean;
  linked: boolean; // has a Google account attached
}

type UserRow = { id: string; handle: string; avatar: unknown; onboarded: boolean; google_sub: string | null };
const toUser = (r: UserRow): User => ({
  id: r.id,
  handle: r.handle,
  avatar: normalizeAvatar(r.avatar),
  onboarded: r.onboarded,
  linked: !!r.google_sub,
});
const USER_COLS = 'id, handle, avatar, onboarded, google_sub';

export interface RoomRow {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  size: number;
  theme: string;
  mask: RoomMask;
  style: RoomStyle;
  layout: Placement[];
  is_public: boolean;
  created_at: string;
}

export interface Inventory {
  coins: number;
  items: Record<string, number>;
}

export interface RoomSummary {
  slug: string;
  name: string;
  category: string;
  theme: string;
  owner: string;
  visitors24h: number;
  createdAt: string;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const newId = () => randomBytes(12).toString('hex');

export function sanitizeRoomName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, ROOM_NAME_MAX);
  return s.length ? s : null;
}

export class Repo {
  constructor(private db: Db) {}

  /** Anonymous device identity: token is a client secret; we only store its hash. */
  async userByToken(token: unknown): Promise<User | null> {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
    const h = hashToken(token);
    const rows = await this.db.query<UserRow>(
      `select ${USER_COLS} from users where token_hash = $1
       union all
       select u.id, u.handle, u.avatar, u.onboarded, u.google_sub from device_tokens d join users u on u.id = d.user_id where d.token_hash = $1
       limit 1`,
      [h],
    );
    return rows.length ? toUser(rows[0]) : null;
  }

  async userById(id: string): Promise<User | null> {
    const rows = await this.db.query<UserRow>(`select ${USER_COLS} from users where id = $1`, [id]);
    return rows.length ? toUser(rows[0]) : null;
  }

  async setOnboarded(userId: string) {
    await this.db.query('update users set onboarded = true where id = $1', [userId]);
  }

  /**
   * Attach a verified Google identity to this device's user, or if the Google
   * account already belongs to another user, point this device at that user.
   */
  async linkGoogle(token: string, deviceUser: User, google: { sub: string; email?: string; name?: string }): Promise<User> {
    const existing = await this.db.query<UserRow>(`select ${USER_COLS} from users where google_sub = $1`, [google.sub]);
    if (existing.length && existing[0].id !== deviceUser.id) {
      await this.db.query('insert into device_tokens (token_hash, user_id) values ($1, $2) on conflict (token_hash) do update set user_id = $2', [
        hashToken(token),
        existing[0].id,
      ]);
      return toUser(existing[0]);
    }
    await this.db.query('update users set google_sub = $2, email = $3, display_name = $4 where id = $1', [
      deviceUser.id,
      google.sub,
      google.email ?? null,
      google.name ?? null,
    ]);
    return (await this.userById(deviceUser.id))!;
  }

  /** Create a user + their home room in one go. */
  async createUser(token: string, avatar: AvatarConfig): Promise<User> {
    const id = newId();
    let handle = randomHandle();
    for (let i = 0; i < 5; i++) {
      const clash = await this.db.query('select 1 from users where handle = $1', [handle]);
      if (!clash.length) break;
      handle = randomHandle();
    }
    await this.db.query('insert into users (id, token_hash, handle, avatar) values ($1, $2, $3, $4)', [
      id,
      hashToken(token),
      handle,
      JSON.stringify(normalizeAvatar(avatar)),
    ]);
    await this.createRoom(id, `${handle}'s room`);
    return { id, handle, avatar: normalizeAvatar(avatar), onboarded: false, linked: false };
  }

  async setAvatar(userId: string, avatar: AvatarConfig) {
    await this.db.query('update users set avatar = $2 where id = $1', [userId, JSON.stringify(normalizeAvatar(avatar))]);
  }

  async setHandle(userId: string, handle: string): Promise<boolean> {
    if (!HANDLE.test(handle)) return false;
    const prev = await this.userById(userId);
    if (!prev) return false;
    try {
      await this.db.query('update users set handle = $2 where id = $1', [userId, handle]);
    } catch {
      return false; // unique clash
    }
    // rooms still carrying the default "<old handle>'s room" name follow the rename
    await this.db.query('update rooms set name = $3 where owner_id = $1 and name = $2', [userId, `${prev.handle}'s room`, `${handle}'s room`]);
    return true;
  }

  async createRoom(ownerId: string, name: string): Promise<string> {
    let slug = randomSlug();
    for (let i = 0; i < 5; i++) {
      const clash = await this.db.query('select 1 from rooms where id = $1', [slug]);
      if (!clash.length) break;
      slug = randomSlug();
    }
    await this.db.query('insert into rooms (id, owner_id, name) values ($1, $2, $3)', [slug, ownerId, name]);
    return slug;
  }

  /**
   * Seed rooms the app itself owns (lobby, harbor). Idempotent: the system
   * user is keyed by a fixed handle, and layouts are rewritten every boot so
   * design changes ship without a migration.
   */
  async ensureSystemRooms(): Promise<void> {
    let sys = await this.db.query<{ id: string }>('select id from users where handle = $1', [SYSTEM_HANDLE]);
    if (!sys.length) {
      const id = newId();
      // nobody holds this token; the hash is of random bytes so it can never be presented
      await this.db.query('insert into users (id, token_hash, handle, avatar, onboarded) values ($1, $2, $3, $4, true)', [
        id,
        hashToken(randomBytes(32).toString('hex')),
        SYSTEM_HANDLE,
        JSON.stringify(DEFAULT_AVATAR),
      ]);
      sys = [{ id }];
    }
    for (const r of SYSTEM_ROOMS) {
      const mask = r.mask();
      await this.db.query(
        `insert into rooms (id, owner_id, name, category, size, theme, mask, layout, is_public)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)
         on conflict (id) do update set
           owner_id = excluded.owner_id, name = excluded.name, category = excluded.category,
           size = excluded.size, theme = excluded.theme, mask = excluded.mask, layout = excluded.layout, is_public = true,
           updated_at = now()`,
        [r.slug, sys[0].id, r.name, r.category, r.size, r.theme, mask ? JSON.stringify(mask) : null, JSON.stringify(r.layout())],
      );
    }
  }

  isSystemRoom(slug: string): boolean {
    return isSystemRoom(slug);
  }

  // ---- safety

  /** Users this person has blocked, plus users who blocked them: both directions hide. */
  async blockPairs(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ other: string }>(
      `select blocked_id as other from blocks where blocker_id = $1
       union
       select blocker_id as other from blocks where blocked_id = $1`,
      [userId],
    );
    return rows.map((r) => r.other);
  }

  async blockedBy(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ blocked_id: string }>('select blocked_id from blocks where blocker_id = $1', [userId]);
    return rows.map((r) => r.blocked_id);
  }

  async block(blockerId: string, blockedId: string): Promise<boolean> {
    if (blockerId === blockedId) return false;
    await this.db.query('insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [blockerId, blockedId]);
    return true;
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.db.query('delete from blocks where blocker_id = $1 and blocked_id = $2', [blockerId, blockedId]);
  }

  /** File a report for the moderation queue. Returns false only for self-reports. */
  async report(reporterId: string, targetId: string, roomId: string | null, reason: string, context: string | null): Promise<boolean> {
    if (reporterId === targetId) return false;
    await this.db.query('insert into reports (reporter_id, target_id, room_id, reason, context) values ($1, $2, $3, $4, $5)', [
      reporterId,
      targetId,
      roomId,
      reason,
      context,
    ]);
    return true;
  }

  /** Moderation queue, newest first. */
  async openReports(limit = 100): Promise<
    Array<{ id: number; reporter: string; target: string; room_id: string | null; reason: string; context: string | null; at: string }>
  > {
    return this.db.query(
      `select r.id, u1.handle as reporter, u2.handle as target, r.room_id, r.reason, r.context, r.at
       from reports r
       join users u1 on u1.id = r.reporter_id
       join users u2 on u2.id = r.target_id
       where r.status = 'open'
       order by r.at desc
       limit $1`,
      [limit],
    );
  }

  async resolveReport(id: number, status: 'actioned' | 'dismissed') {
    await this.db.query('update reports set status = $2 where id = $1', [id, status]);
  }

  // ---- economy

  async inventory(userId: string): Promise<Inventory> {
    const coins = await this.db.query<{ coins: number }>('select coins from users where id = $1', [userId]);
    const rows = await this.db.query<{ def: string; qty: number }>('select def, qty from inventory where user_id = $1 and qty > 0', [userId]);
    const items: Record<string, number> = {};
    for (const r of rows) items[r.def] = r.qty;
    return { coins: coins[0]?.coins ?? 0, items };
  }

  async coins(userId: string): Promise<number> {
    const r = await this.db.query<{ coins: number }>('select coins from users where id = $1', [userId]);
    return r[0]?.coins ?? 0;
  }

  async creditCoins(userId: string, amount: number): Promise<number> {
    const r = await this.db.query<{ coins: number }>('update users set coins = coins + $2::int where id = $1 returning coins', [userId, amount]);
    return r[0]?.coins ?? 0;
  }

  /** Atomic debit; null when the balance is too low. */
  async spendCoins(userId: string, amount: number): Promise<number | null> {
    const r = await this.db.query<{ coins: number }>('update users set coins = coins - $2::int where id = $1 and coins >= $2::int returning coins', [userId, amount]);
    return r.length ? r[0].coins : null;
  }

  async recordPull(userId: string, itemId: string) {
    await this.db.query('insert into pulls (user_id, item_id) values ($1, $2)', [userId, itemId]);
  }

  /** Daily credit claim: true if granted, false if already claimed within 20h. */
  async claimDaily(userId: string, amount: number): Promise<{ granted: boolean; coins: number }> {
    const r = await this.db.query<{ coins: number }>(
      `update users set coins = coins + $2::int, daily_at = now()
       where id = $1 and (daily_at is null or daily_at < now() - interval '20 hours') returning coins`,
      [userId, amount],
    );
    if (r.length) return { granted: true, coins: r[0].coins };
    return { granted: false, coins: await this.coins(userId) };
  }

  /** Buy `qty` of a catalog item. Fails (false) when unknown, unsold, or unaffordable. */
  async buy(userId: string, def: string, qty: number): Promise<{ ok: true; coins: number } | { ok: false; reason: string }> {
    const d = furnitureDef(def);
    if (!d || d.price <= 0) return { ok: false, reason: 'not_for_sale' };
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) return { ok: false, reason: 'bad_qty' };
    const cost = d.price * qty;
    const r = await this.db.query<{ coins: number }>('update users set coins = coins - $2::int where id = $1 and coins >= $2::int returning coins', [userId, cost]);
    if (!r.length) return { ok: false, reason: 'not_enough_coins' };
    await this.addItem(userId, def, qty);
    return { ok: true, coins: r[0].coins };
  }

  /** Adjust inventory count; negative delta only succeeds when enough is held. */
  async addItem(userId: string, def: string, delta: number): Promise<boolean> {
    if (delta >= 0) {
      await this.db.query(
        `insert into inventory (user_id, def, qty) values ($1, $2, $3)
         on conflict (user_id, def) do update set qty = inventory.qty + excluded.qty`,
        [userId, def, delta],
      );
      return true;
    }
    const r = await this.db.query('update inventory set qty = qty + $3::int where user_id = $1 and def = $2 and qty >= -($3::int) returning qty', [userId, def, delta]);
    return r.length > 0;
  }

  async room(slug: string): Promise<RoomRow | null> {
    if (!ROOM_SLUG.test(slug)) return null;
    const rows = await this.db.query<RoomRow & { mask: unknown; style: unknown }>('select * from rooms where id = $1', [slug]);
    if (!rows[0]) return null;
    return { ...rows[0], mask: parseMask(rows[0].mask, rows[0].size), style: normalizeStyle(rows[0].style) };
  }

  async homeRoom(userId: string): Promise<string | null> {
    const rows = await this.db.query<{ id: string }>('select id from rooms where owner_id = $1 order by created_at limit 1', [userId]);
    return rows[0]?.id ?? null;
  }

  async saveLayout(slug: string, layout: Placement[]) {
    await this.db.query('update rooms set layout = $2, updated_at = now() where id = $1', [slug, JSON.stringify(layout)]);
  }

  async updateRoom(slug: string, patch: { name?: unknown; category?: unknown; is_public?: unknown; style?: unknown }): Promise<boolean> {
    const name = patch.name !== undefined ? sanitizeRoomName(patch.name) : undefined;
    if (patch.name !== undefined && !name) return false;
    if (patch.style !== undefined) {
      if (!patch.style || typeof patch.style !== 'object') return false;
      const cur = await this.room(slug);
      if (!cur) return false;
      await this.db.query('update rooms set style = $2, updated_at = now() where id = $1', [slug, JSON.stringify(normalizeStyle(patch.style, cur.style))]);
    }
    const category = patch.category !== undefined ? String(patch.category) : undefined;
    if (category !== undefined && !(ROOM_CATEGORIES as readonly string[]).includes(category)) return false;
    const isPublic = patch.is_public !== undefined ? Boolean(patch.is_public) : undefined;
    await this.db.query(
      `update rooms set
         name = coalesce($2, name),
         category = coalesce($3, category),
         is_public = coalesce($4, is_public),
         updated_at = now()
       where id = $1`,
      [slug, name ?? null, category ?? null, isPublic ?? null],
    );
    return true;
  }

  async recordVisit(slug: string, userId: string) {
    // one row per user per room per hour keeps the table small without a unique index dance
    const recent = await this.db.query('select 1 from room_visits where room_id = $1 and user_id = $2 and at > now() - interval \'1 hour\'', [
      slug,
      userId,
    ]);
    if (recent.length) return;
    await this.db.query('insert into room_visits (room_id, user_id) values ($1, $2)', [slug, userId]);
  }

  async listPublic(sort: 'new' | 'top', limit = 50): Promise<RoomSummary[]> {
    const order = sort === 'new' ? 'r.created_at desc' : 'visitors24h desc, r.created_at desc';
    const rows = await this.db.query<{
      id: string;
      name: string;
      category: string;
      theme: string;
      handle: string;
      visitors24h: number;
      created_at: string;
    }>(
      `select r.id, r.name, r.category, r.theme, u.handle, r.created_at,
              (select count(distinct v.user_id) from room_visits v where v.room_id = r.id and v.at > now() - interval '24 hours')::int as visitors24h
       from rooms r join users u on u.id = r.owner_id
       where r.is_public
       order by ${order}
       limit $1`,
      [limit],
    );
    return rows.map((r) => ({
      slug: r.id,
      name: r.name,
      category: r.category,
      theme: r.theme,
      owner: r.handle,
      visitors24h: r.visitors24h,
      createdAt: String(r.created_at),
    }));
  }
}
