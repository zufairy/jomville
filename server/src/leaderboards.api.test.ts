import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { buildApi } from './api';

const PORT = 2596;
const BASE = `http://localhost:${PORT}`;
const TOKEN = 'l'.repeat(32);

let db: Db;
let repo: Repo;
let server: Server;
let userId = '';

const post = (path: string, body: unknown, method = 'POST') =>
  fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  const u = await repo.createUser(TOKEN, DEFAULT_AVATAR);
  userId = u.id;
  await db.query("update users set handle = 'lb_rich', coins = 9000 where id = $1", [userId]);
  const app = buildApi(repo);
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => resolve());
  });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

describe('leaderboards api', () => {
  it('serves cached boards, personal ranks and the hide toggle', async () => {
    const r1 = await fetch(`${BASE}/api/leaderboards`);
    expect(r1.status).toBe(200);
    expect(r1.headers.get('cache-control')).toBe('public, max-age=30');
    const b1 = await r1.json();
    expect(Object.keys(b1).sort()).toEqual(['assets', 'coins', 'generatedAt', 'timeAll', 'timeWeek']);
    expect(b1.coins[0]).toMatchObject({ rank: 1, handle: 'lb_rich', value: 9000 });

    const me = await (await post('/api/leaderboards/me', { token: TOKEN })).json();
    expect(me).toMatchObject({ hidden: false, coins: { rank: 1, value: 9000 } });
    expect((await post('/api/leaderboards/me', { token: 'z'.repeat(32) })).status).toBe(401);
    expect((await post('/api/leaderboards/me', {})).status).toBe(401);

    // cached: a change in the db does not show within the TTL
    await db.query('update users set coins = 100 where id = $1', [userId]);
    const b2 = await (await fetch(`${BASE}/api/leaderboards`)).json();
    expect(b2.generatedAt).toBe(b1.generatedAt);
    expect(b2.coins[0].value).toBe(9000);

    // hiding invalidates the cache
    expect((await post('/api/me', { token: TOKEN, hideRank: true }, 'PATCH')).status).toBe(200);
    const b3 = await (await fetch(`${BASE}/api/leaderboards`)).json();
    expect(b3.coins.some((r: { handle: string }) => r.handle === 'lb_rich')).toBe(false);
    expect(await (await post('/api/leaderboards/me', { token: TOKEN })).json()).toEqual({ hidden: true });

    await post('/api/me', { token: TOKEN, hideRank: false }, 'PATCH');
    const b4 = await (await fetch(`${BASE}/api/leaderboards`)).json();
    expect(b4.coins[0]).toMatchObject({ handle: 'lb_rich', value: 100 });
  });
});
