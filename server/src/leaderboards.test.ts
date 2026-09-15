import { describe, expect, it } from 'vitest';
import { openTestDb } from './db';
import { LeaderboardCache, PlayMinuteGate, klMonday, priceTable } from './leaderboards';
import type { BoardSet } from './leaderboards';

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

  it('prunes stale entries once the map grows large, instead of growing forever', () => {
    const g = new PlayMinuteGate(50_000);
    const many = Array.from({ length: 1001 }, (_, i) => `u${i}`);
    g.take(many, 0);
    expect((g as unknown as { last: Map<string, number> }).last.size).toBe(1001);
    // Everyone above is long past the gap; a later tick for one new user should
    // prune the stale entries rather than merely appending to an ever-growing map.
    g.take(['fresh'], 1_000_000);
    expect((g as unknown as { last: Map<string, number> }).last.size).toBe(1);
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

const EMPTY: BoardSet = { coins: [], assets: [], timeWeek: [], timeAll: [] };

describe('LeaderboardCache', () => {
  it('reuses a load for 60 s and shares an in-flight load', async () => {
    let t = 1_000_000;
    let loads = 0;
    const cache = new LeaderboardCache(async () => {
      loads++;
      return EMPTY;
    }, 60_000, () => t);
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    expect(loads).toBe(1);
    expect(a).toBe(b);
    expect(a.generatedAt).toBe(new Date(1_000_000).toISOString());
    t += 59_999;
    await cache.get();
    expect(loads).toBe(1);
    t += 1;
    const c = await cache.get();
    expect(loads).toBe(2);
    expect(c.generatedAt).toBe(new Date(1_060_000).toISOString());
  });

  it('invalidate forces the next get to reload, even over an in-flight load', async () => {
    let loads = 0;
    let release: () => void = () => {};
    const cache = new LeaderboardCache(async () => {
      loads++;
      if (loads === 1) await new Promise<void>((r) => (release = r));
      return EMPTY;
    }, 60_000, () => 0);
    const first = cache.get();
    cache.invalidate();
    release();
    await first;
    await cache.get();
    expect(loads).toBe(2);
  });
});
