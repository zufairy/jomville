import { describe, expect, it } from 'vitest';
import { openTestDb } from './db';
import { PlayMinuteGate, klMonday, priceTable } from './leaderboards';

describe('klMonday', () => {
  it('uses Monday 00:00 Asia/Kuala_Lumpur as the week start', () => {
    // KL Sunday 23:59:59 -> previous Monday
    expect(klMonday(new Date('2026-09-13T15:59:59.000Z'))).toBe('2026-09-07');
    // KL Monday 00:00:00 -> that Monday
    expect(klMonday(new Date('2026-09-13T16:00:00.000Z'))).toBe('2026-09-14');
    expect(klMonday(new Date('2026-09-20T15:59:59.000Z'))).toBe('2026-09-14');
    // crosses a year boundary (KL Thursday 08:00)
    expect(klMonday(new Date('2026-01-01T00:00:00.000Z'))).toBe('2025-12-29');
  });
});

describe('priceTable', () => {
  it('keeps priced defs only', () => {
    const t = JSON.parse(priceTable([
      { id: 'a', price: 10 },
      { id: 'free', price: 0 },
      { id: 'b', price: 25000 },
    ]));
    expect(t).toEqual({ a: 10, b: 25000 });
  });
  it('defaults to the catalog', () => {
    const t = JSON.parse(priceTable()) as Record<string, number>;
    expect(Object.keys(t).length).toBeGreaterThan(0);
    expect(Object.values(t).every((p) => p > 0)).toBe(true);
  });
});

describe('PlayMinuteGate', () => {
  it('counts a user at most once per gap across rooms and sessions', () => {
    const g = new PlayMinuteGate(50_000);
    expect(g.take(['u1', 'u2', 'u1'], 0)).toEqual(['u1', 'u2']);
    // another room ticking 10 s later
    expect(g.take(['u1', 'u3'], 10_000)).toEqual(['u3']);
    expect(g.take(['u1', 'u2'], 49_999)).toEqual([]);
    expect(g.take(['u1', 'u2'], 60_000)).toEqual(['u1', 'u2']);
  });
});

describe('leaderboard columns', () => {
  it('migrates play time and hide_rank columns on users', async () => {
    const db = await openTestDb();
    const rows = await db.query<{ column_name: string; data_type: string; column_default: string | null }>(
      `select column_name, data_type, column_default from information_schema.columns
       where table_name = 'users' and column_name in ('play_minutes', 'play_week', 'play_week_start', 'hide_rank')
       order by column_name`,
    );
    expect(rows.map((r) => [r.column_name, r.data_type])).toEqual([
      ['hide_rank', 'boolean'],
      ['play_minutes', 'integer'],
      ['play_week', 'integer'],
      ['play_week_start', 'date'],
    ]);
    await db.close();
  });
});
