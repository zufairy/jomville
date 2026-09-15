import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type Server } from 'node:http';
import { rmSync } from 'node:fs';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo } from './repo';
import { buildApi } from './api';

const SOCK = `/tmp/leypark-onboarding-api-${process.pid}.sock`;
const TOKEN = 'o'.repeat(32);
let db: Db;
let repo: Repo;
let server: Server;

function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      { socketPath: SOCK, method, path, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: buf ? JSON.parse(buf) : null }));
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

describe('onboarding api', () => {
  it('requires a valid Malaysia state or Overseas and birthdate before onboarded is true', async () => {
    expect((await call('PATCH', '/api/me', { token: TOKEN, onboarded: true })).status).toBe(400);

    const invalid = await call('PATCH', '/api/me', {
      token: TOKEN,
      handle: 'along_kl',
      state: 'Narnia',
      birthdate: '2000-01-01',
    });
    expect(invalid.status).toBe(400);

    const saved = await call('PATCH', '/api/me', {
      token: TOKEN,
      handle: 'along_kl',
      state: 'Selangor',
      birthdate: '2000-01-01',
    });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({ handle: 'along_kl', state: 'Selangor', birthdate: '2000-01-01', onboarded: false });

    const done = await call('PATCH', '/api/me', { token: TOKEN, onboarded: true });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ state: 'Selangor', birthdate: '2000-01-01', onboarded: true });
  });
});
