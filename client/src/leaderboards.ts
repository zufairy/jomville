import { storedToken } from './identity';

/** Mirrors server/src/leaderboards.ts. Kept free of the game store so the page chunk stays small. */
export type BoardKey = 'coins' | 'assets' | 'timeWeek' | 'timeAll';
export interface BoardRow {
  rank: number;
  handle: string;
  avatar: string;
  value: number;
}
export type Boards = { generatedAt: string } & Record<BoardKey, BoardRow[]>;
export interface MyRank {
  rank: number | null;
  value: number;
}
export type MyRanks = { hidden: true } | ({ hidden: false } & Record<BoardKey, MyRank>);

export type Tab = 'coins' | 'assets' | 'time';
export type TimeSpan = 'week' | 'all';

export const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'coins', label: 'Richest' },
  { id: 'assets', label: 'Assets' },
  { id: 'time', label: 'Play Time' },
];

export const SPANS: Array<{ id: TimeSpan; label: string }> = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' },
];

export function boardKey(tab: Tab, span: TimeSpan): BoardKey {
  if (tab === 'time') return span === 'week' ? 'timeWeek' : 'timeAll';
  return tab;
}

export function isTimeBoard(key: BoardKey): boolean {
  return key === 'timeWeek' || key === 'timeAll';
}

/** 1234567 -> "1,234,567" (no Intl: the same output on every device) */
export function formatCoins(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 750 -> "12h 30m", 45 -> "45m" */
export function formatPlayTime(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export function formatValue(key: BoardKey, value: number): string {
  return isTimeBoard(key) ? formatPlayTime(value) : formatCoins(value);
}

export function rankLabel(me: MyRanks | null, key: BoardKey): string | null {
  if (!me) return null;
  if (me.hidden) return 'Your rank: Hidden';
  const r = me[key].rank;
  return `Your rank: ${r === null ? '–' : `#${r}`}`;
}

const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** `fresh` skips the HTTP cache (after the hide toggle). */
export async function fetchBoards(fresh = false): Promise<Boards> {
  const r = await fetch(`${base}/api/leaderboards`, fresh ? { cache: 'no-store' } : undefined);
  if (!r.ok) throw new Error('leaderboards failed');
  return r.json();
}

export async function fetchMyRanks(): Promise<MyRanks | null> {
  const token = storedToken();
  if (!token) return null;
  try {
    const r = await fetch(`${base}/api/leaderboards/me`, send('POST', { token }));
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function setHideRank(hide: boolean): Promise<boolean> {
  const token = storedToken();
  if (!token) return false;
  try {
    const r = await fetch(`${base}/api/me`, send('PATCH', { token, hideRank: hide }));
    return r.ok;
  } catch {
    return false;
  }
}
