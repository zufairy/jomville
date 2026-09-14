import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type Server } from 'node:http';
import { rmSync } from 'node:fs';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { buildApi } from './api';

/** a unix socket, so this test never takes a TCP port */
const SOCK = `/tmp/leypark-calls-api-${process.pid}.sock`;
const TOKEN = 'c'.repeat(32);
let db: Db;
let repo: Repo;
let server: Server;

function call(method: string, path: string, body?: unknown): Promise<{ status: number; headers: Record<string, unknown>; json: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      { socketPath: SOCK, method, path, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, json: buf ? JSON.parse(buf) : null }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  await repo.createUser(TOKEN, DEFAULT_AVATAR);
  rmSync(SOCK, { force: true });
  const app = buildApi(repo);
  await new Promise<void>((resolve) => {
    server = app.listen(SOCK, () => resolve());
  });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(SOCK, { force: true });
  await db.close();
});

describe('call api', () => {
  it('/api/ice needs a known user and follows the env', async () => {
    expect((await call('POST', '/api/ice', { token: 'z'.repeat(32) })).status).toBe(401);
    delete process.env.TURN_URLS;
    const plain = await call('POST', '/api/ice', { token: TOKEN });
    expect(plain.status).toBe(200);
    expect(plain.headers['cache-control']).toBe('no-store');
    expect(plain.json.iceServers).toHaveLength(1);
    process.env.TURN_URLS = 'turn:t.example:3478';
    process.env.TURN_USERNAME = 'u';
    process.env.TURN_CREDENTIAL = 'p';
    const turn = await call('POST', '/api/ice', { token: TOKEN });
    expect(turn.json.iceServers[1]).toEqual({ urls: ['turn:t.example:3478'], username: 'u', credential: 'p' });
    delete process.env.TURN_URLS;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
  });

  it('/api/me/adult confirms once, idempotently', async () => {
    const u = (await repo.userByToken(TOKEN))!;
    expect(await repo.isAdultConfirmed(u.id)).toBe(false);
    expect((await call('POST', '/api/me/adult', {})).status).toBe(401);
    expect((await call('POST', '/api/me/adult', { token: TOKEN })).json).toEqual({ adultConfirmed: true });
    const [first] = await db.query<{ at: string }>('select adult_confirmed_at::text as at from users where id = $1', [u.id]);
    await call('POST', '/api/me/adult', { token: TOKEN });
    const [second] = await db.query<{ at: string }>('select adult_confirmed_at::text as at from users where id = $1', [u.id]);
    expect(second.at).toBe(first.at);
    expect(await repo.isAdultConfirmed(u.id)).toBe(true);
  });
});
