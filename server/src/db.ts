import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Thin SQL layer. Dev uses PGlite (embedded Postgres, on-disk). Production
 * points DATABASE_URL at a real Postgres; the SQL is plain Postgres either way.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

const SCHEMA = `
create table if not exists users (
  id text primary key,
  token_hash text unique not null,
  handle text unique not null,
  avatar jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists rooms (
  id text primary key,
  owner_id text not null references users(id),
  name text not null,
  category text not null default 'hangout',
  size int not null default 10,
  layout jsonb not null default '[]',
  is_public boolean not null default true,
  theme text not null default 'indoor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table rooms add column if not exists theme text not null default 'indoor';
create index if not exists rooms_owner on rooms(owner_id);
create table if not exists device_tokens (
  token_hash text primary key,
  user_id text not null references users(id),
  created_at timestamptz not null default now()
);
create table if not exists room_visits (
  room_id text not null references rooms(id),
  user_id text not null references users(id),
  at timestamptz not null default now()
);
create index if not exists room_visits_room_at on room_visits(room_id, at);
create table if not exists blocks (
  blocker_id text not null references users(id),
  blocked_id text not null references users(id),
  at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create index if not exists blocks_blocked on blocks(blocked_id);
create table if not exists reports (
  id serial primary key,
  reporter_id text not null references users(id),
  target_id text not null references users(id),
  room_id text,
  reason text not null,
  context text,
  status text not null default 'open',
  at timestamptz not null default now()
);
create index if not exists reports_status_at on reports(status, at);
create table if not exists pulls (
  id serial primary key,
  user_id text not null references users(id),
  item_id text not null,
  at timestamptz not null default now()
);
create table if not exists inventory (
  user_id text not null references users(id),
  def text not null,
  qty int not null default 0,
  primary key (user_id, def)
);
create table if not exists items (
  id text primary key,
  def text not null,
  owner_id text not null references users(id),
  serial int,
  state jsonb not null default '{}',
  placed_room text,
  created_at timestamptz not null default now()
);
create index if not exists items_owner on items(owner_id);
create unique index if not exists items_def_serial on items(def, serial) where serial is not null;
create table if not exists ltd_stock (
  def text primary key,
  sold int not null default 0,
  cap int not null
);
create table if not exists rolls (
  id serial primary key,
  room_id text not null,
  furni_id text not null,
  user_id text not null,
  kind text not null,
  result int not null,
  at timestamptz not null default now()
);
create index if not exists rolls_room_at on rolls(room_id, at);
create table if not exists friend_requests (
  from_id text not null references users(id),
  to_id text not null references users(id),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);
create index if not exists friend_requests_to on friend_requests(to_id);
create table if not exists friendships (
  user_a text not null references users(id),
  user_b text not null references users(id),
  since timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on friendships(user_b);
`;

/** Additive column migrations, applied one by one (PGlite chokes on batched ADD COLUMN IF NOT EXISTS). */
const COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'users', column: 'daily_at', ddl: 'alter table users add column daily_at timestamptz' },
  { table: 'users', column: 'google_sub', ddl: 'alter table users add column google_sub text unique' },
  { table: 'users', column: 'email', ddl: 'alter table users add column email text' },
  { table: 'users', column: 'display_name', ddl: 'alter table users add column display_name text' },
  { table: 'users', column: 'onboarded', ddl: 'alter table users add column onboarded boolean not null default false' },
  { table: 'users', column: 'coins', ddl: 'alter table users add column coins int not null default 1500' },
  { table: 'rooms', column: 'mask', ddl: 'alter table rooms add column mask jsonb' },
  { table: 'rooms', column: 'style', ddl: 'alter table rooms add column style jsonb' },
];

async function migrate(pg: PGlite) {
  await pg.exec(SCHEMA);
  for (const m of COLUMNS) {
    const r = await pg.query('select 1 from information_schema.columns where table_name = $1 and column_name = $2', [m.table, m.column]);
    if (!r.rows.length) await pg.exec(m.ddl);
  }
}

export async function openDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL set but the pg driver is not wired yet; use PGlite for now');
  }
  const dir = process.env.PGLITE_DIR ?? path.resolve(process.cwd(), 'data/pglite');
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  await migrate(pg);
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pg.query<T>(sql, params);
      return r.rows;
    },
    close: () => pg.close(),
  };
}

/** In-memory PGlite for tests. */
export async function openTestDb(): Promise<Db> {
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(pg);
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pg.query<T>(sql, params);
      return r.rows;
    },
    close: () => pg.close(),
  };
}
