import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, openTestDb } from './db';

let db: Db;

beforeAll(async () => {
  db = await openTestDb();
  await db.query('create table tx_probe (id int primary key, v text not null)');
});
afterAll(() => db.close());

describe('db.transaction', () => {
  it('commits every write when the callback resolves and returns its value', async () => {
    const out = await db.transaction(async (tx) => {
      await tx.query('insert into tx_probe (id, v) values (1, $1)', ['one']);
      await tx.query('insert into tx_probe (id, v) values (2, $1)', ['two']);
      return 'done';
    });
    expect(out).toBe('done');
    expect(await db.query('select id from tx_probe order by id')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('rolls back every write when the callback throws', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into tx_probe (id, v) values (3, $1)', ['three']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.query('select id from tx_probe where id = 3')).toEqual([]);
  });

  it('rolls back earlier writes when a later statement fails', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into tx_probe (id, v) values (4, $1)', ['four']);
        await tx.query('insert into tx_probe (id, v) values (1, $1)', ['clash']); // primary key clash
      }),
    ).rejects.toThrow();
    expect(await db.query('select id from tx_probe where id = 4')).toEqual([]);
  });
});
