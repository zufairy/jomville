import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, openTestDb } from './db';

let db: Db;
const rows = async () => (await db.query<{ n: number }>('select n from tx_probe order by n')).map((r) => r.n);

beforeAll(async () => {
  db = await openTestDb();
  await db.query('create table tx_probe (n int not null)');
});
afterAll(() => db.close());

describe('Db.transaction', () => {
  it('commits every write and returns the callback value', async () => {
    const out = await db.transaction(async (tx) => {
      await tx.query('insert into tx_probe (n) values (1)');
      await tx.query('insert into tx_probe (n) values (2)');
      return 'done';
    });
    expect(out).toBe('done');
    expect(await rows()).toEqual([1, 2]);
  });

  it('a throw rolls back all writes and rethrows', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into tx_probe (n) values (3)');
        await tx.query('update tx_probe set n = n + 100');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await rows()).toEqual([1, 2]);
  });

  it('a failing statement rolls back earlier writes', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into tx_probe (n) values (4)');
        await tx.query('insert into tx_probe (n) values (null)');
      }),
    ).rejects.toThrow();
    expect(await rows()).toEqual([1, 2]);
  });

  it('keeps the thrown error identity so callers can map codes', async () => {
    class Custom extends Error {
      code = 'x';
    }
    const err = await db
      .transaction(async () => {
        throw new Custom('custom');
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Custom);
    expect((err as Custom).code).toBe('x');
  });
});
