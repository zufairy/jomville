import { RoomTheme } from './constants';

/**
 * Love Meter: a system room with two queue lanes (blue + pink). The heads of
 * both lanes are auto-matched, seated on the booth loveseat, put on a 30 s
 * video call, and the whole room watches the meter reveal their score.
 */
export const LOVE_ROOM = {
  slug: 'lovemeter',
  name: 'Love Meter',
  category: 'games',
  theme: 'love' as RoomTheme,
  size: 22,
} as const;

export const LOVE_SIDES = ['blue', 'pink'] as const;
export type LoveSide = 0 | 1;

/** lane columns, front row, slots per lane (front first) */
export const LOVE_LANES = [
  { x: 7, front: 6, len: 10 },
  { x: 14, front: 6, len: 10 },
] as const;

/** loveseat tiles on the booth: blue sits left, pink right */
export const LOVE_SEATS = [
  { x: 10, y: 2 },
  { x: 11, y: 2 },
] as const;

/** tile the giant meter stands on (2x1, behind the loveseat) */
export const LOVE_METER_TILE = { x: 10, y: 0 } as const;

export const LOVE_READY_MS = 5_000;
export const LOVE_CALL_MS = 30_000;
export const LOVE_REVEAL_MS = 8_000;

/** What every client in the room gets on each queue/match change. */
export interface LoveSnapshot {
  /** sessionIds per lane, front first */
  lanes: [string[], string[]];
  pair: {
    a: string;
    b: string;
    ah: string;
    bh: string;
    phase: 'ready' | 'call' | 'reveal';
    /** ms left in the phase when sent (clients count down from receipt, no clock skew) */
    left: number;
    score: number | null;
  } | null;
  /** latest results, newest first — the FOMO ticker */
  recent: Array<{ ah: string; bh: string; score: number }>;
}

export function laneSpot(side: LoveSide, i: number): { x: number; y: number } {
  const l = LOVE_LANES[side];
  return { x: l.x, y: l.front + Math.min(i, l.len - 1) };
}

/**
 * Voice-activity summary of a call, sampled a few times a second on the client
 * (one AnalyserNode per stream, RMS threshold). Cheap: no video processing.
 */
export interface LoveVibe {
  /** samples where A was talking */
  aTalk: number;
  bTalk: number;
  /** samples where both talked at once (laughing, excitement) */
  both: number;
  /** speaker switches A->B or B->A */
  turns: number;
  /** total samples */
  n: number;
}

export function normalizeVibe(raw: unknown): LoveVibe | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = Number(o.n);
  if (!Number.isInteger(n) || n <= 0 || n > 1000) return null;
  const clampInt = (v: unknown) => {
    const k = Math.round(Number(v));
    return Number.isFinite(k) ? Math.max(0, Math.min(n, k)) : 0;
  };
  return { aTalk: clampInt(o.aTalk), bTalk: clampInt(o.bTalk), both: clampInt(o.both), turns: clampInt(o.turns), n };
}

/** FNV-1a, 0..1 — the pair's fixed "chemistry" so a rematch lands near the same number */
export function pairSeed(a: string, b: string): number {
  const s = [a, b].sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Score 1..100. Rewards a balanced, lively back-and-forth; a silent call still
 * gets a small chemistry-based score so nobody sees a bare zero.
 */
export function loveScore(v: LoveVibe | null, seed: number): number {
  if (!v || v.aTalk + v.bTalk === 0) return Math.round(8 + seed * 22);
  const total = v.aTalk + v.bTalk;
  const activity = Math.min(1, total / (v.n * 0.9)); // ~45% talk time each = full marks
  const balance = 1 - Math.abs(v.aTalk - v.bTalk) / total;
  const turnRate = Math.min(1, v.turns / Math.max(6, v.n / 10)); // a switch every ~2.5s is great
  const laughs = Math.min(1, v.both / Math.max(1, v.n * 0.08));
  const raw = 12 + activity * 22 + balance * 26 + turnRate * 22 + laughs * 6 + seed * 14;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

/** merge the two sides' reports (each reports itself as A) into the pair's A/B frame */
export function mergeVibes(fromA: LoveVibe | null, fromB: LoveVibe | null): LoveVibe | null {
  const flipped = fromB && { aTalk: fromB.bTalk, bTalk: fromB.aTalk, both: fromB.both, turns: fromB.turns, n: fromB.n };
  if (!fromA) return flipped;
  if (!flipped) return fromA;
  const avg = (x: number, y: number) => Math.round((x + y) / 2);
  return {
    aTalk: avg(fromA.aTalk, flipped.aTalk),
    bTalk: avg(fromA.bTalk, flipped.bTalk),
    both: avg(fromA.both, flipped.both),
    turns: avg(fromA.turns, flipped.turns),
    n: avg(fromA.n, flipped.n),
  };
}

export function loveLabel(score: number): string {
  if (score >= 90) return 'soulmates';
  if (score >= 75) return 'sparks flying';
  if (score >= 55) return 'cute match';
  if (score >= 35) return 'maybe friends';
  return 'no spark';
}
