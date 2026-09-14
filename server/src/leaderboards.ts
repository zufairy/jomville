import { FURNITURE } from '@dovey/shared';

/**
 * Leaderboards: who is richest in coins, in furniture, and who hangs out the
 * most. Pure helpers here; SQL lives in Repo, routes in api.ts.
 */
export type BoardKey = 'coins' | 'assets' | 'timeWeek' | 'timeAll';
export const BOARD_KEYS: BoardKey[] = ['coins', 'assets', 'timeWeek', 'timeAll'];

export interface BoardRow {
  rank: number;
  handle: string;
  /** serialized avatar (serializeAvatar) */
  avatar: string;
  value: number;
}
export type BoardSet = Record<BoardKey, BoardRow[]>;
export interface Boards extends BoardSet {
  generatedAt: string;
}
export interface MyRank {
  /** null when the value is 0 (not on the board) */
  rank: number | null;
  value: number;
}
export type MyRanks = { hidden: true } | ({ hidden: false } & Record<BoardKey, MyRank>);

export const BOARD_SIZE = 50;
/** limited-edition instances are worth this many times their shop price */
export const LTD_ASSET_MULTIPLIER = 3;
export const LEADERBOARD_TTL_MS = 60_000;
/** a user earns at most one online minute per this gap, however many rooms/tabs they have open */
export const PLAY_MINUTE_GAP_MS = 50_000;

/** Malaysia is UTC+8 all year (no DST). */
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Monday (Asia/Kuala_Lumpur) starting the week that contains `now`, as YYYY-MM-DD. */
export function klMonday(now: Date): string {
  const kl = new Date(now.getTime() + KL_OFFSET_MS);
  const sinceMonday = (kl.getUTCDay() + 6) % 7;
  kl.setUTCDate(kl.getUTCDate() - sinceMonday);
  return kl.toISOString().slice(0, 10);
}

/** Catalog prices as JSON for SQL (jsonb_each_text); unpriced defs are left out so they count 0. */
export function priceTable(defs: ReadonlyArray<{ id: string; price: number }> = FURNITURE): string {
  const out: Record<string, number> = {};
  for (const d of defs) if (d.price > 0) out[d.id] = d.price;
  return JSON.stringify(out);
}

/** Every room ticks its own minute; this keeps one minute per user per tick across all of them. */
export class PlayMinuteGate {
  private last = new Map<string, number>();

  constructor(private gapMs = PLAY_MINUTE_GAP_MS) {}

  take(userIds: Iterable<string>, now: number): string[] {
    const out: string[] = [];
    for (const id of userIds) {
      const prev = this.last.get(id);
      if (prev !== undefined && now - prev < this.gapMs) continue;
      this.last.set(id, now);
      out.push(id);
    }
    return out;
  }
}

export const playMinutes = new PlayMinuteGate();

/**
 * Boards are recomputed at most once per TTL. Concurrent callers share one
 * load; invalidate() (hide toggle) makes the next get reload and discards an
 * in-flight result started before it.
 */
export class LeaderboardCache {
  private value: Boards | null = null;
  private at = 0;
  private inflight: Promise<Boards> | null = null;
  private gen = 0;

  constructor(
    private load: () => Promise<BoardSet>,
    private ttlMs = LEADERBOARD_TTL_MS,
    private now: () => number = Date.now,
  ) {}

  get(): Promise<Boards> {
    const t = this.now();
    if (this.value && t - this.at < this.ttlMs) return Promise.resolve(this.value);
    if (this.inflight) return this.inflight;
    const gen = this.gen;
    const p = this.load()
      .then((set) => {
        const boards: Boards = { generatedAt: new Date(t).toISOString(), ...set };
        if (gen === this.gen) {
          this.value = boards;
          this.at = t;
        }
        return boards;
      })
      .finally(() => {
        if (this.inflight === p) this.inflight = null;
      });
    this.inflight = p;
    return p;
  }

  invalidate() {
    this.gen++;
    this.value = null;
    this.inflight = null;
  }
}
