import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { buildApi } from '../api';
import { Db, openTestDb } from '../db';
import { Repo } from '../repo';

// the only ports this worktree may use: 2596 (this test / manual check), 2597 (smoke)
const PORT = 2596;
const BASE = `http://127.0.0.1:${PORT}`;
let db: Db;
let server: Server;
let aId: string;
let aHandle: string;

beforeAll(async () => {
  process.env.MOD_TOKEN = 'mod-secret-token-123';
  db = await openTestDb();
  const repo = new Repo(db);
  const a = await repo.createUser('modApiA'.padEnd(32, 'm'), DEFAULT_AVATAR);
  const b = await repo.createUser('modApiB'.padEnd(32, 'n'), DEFAULT_AVATAR);
  aId = a.id;
  aHandle = a.handle;
  expect((await repo.executeTrade(a.id, b.id, { slots: [], coins: 25 }, { slots: [], coins: 0 }, 'modroom')).ok).toBe(true);
  const app = buildApi(repo);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  delete process.env.MOD_TOKEN;
});

describe('GET /api/mod/trades', () => {
  it('hides behind the mod token', async () => {
    expect((await fetch(`${BASE}/api/mod/trades?user=${aId}`)).status).toBe(404);
    expect((await fetch(`${BASE}/api/mod/trades?user=${aId}`, { headers: { 'x-mod-token': 'wrong' } })).status).toBe(404);
  });

  it('needs a user id', async () => {
    const r = await fetch(`${BASE}/api/mod/trades`, { headers: { 'x-mod-token': 'mod-secret-token-123' } });
    expect(r.status).toBe(400);
  });

  it("lists the user's trades with handles and offers", async () => {
    const r = await fetch(`${BASE}/api/mod/trades?user=${aId}`, { headers: { 'x-mod-token': 'mod-secret-token-123' } });
    expect(r.status).toBe(200);
    const rows = await r.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ a_id: aId, a_handle: aHandle, room_id: 'modroom', a_offer: { coins: 25, slots: [] } });
  });
});
