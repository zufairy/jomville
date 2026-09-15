import { ROOM_SLUG } from '@dovey/shared';

/**
 * URL scheme:
 *   /              landing page
 *   /play          your own room
 *   /r/:slug       a specific room
 *   /leaderboards  public rankings
 */
export type Route = { kind: 'landing' } | { kind: 'play' } | { kind: 'room'; slug: string } | { kind: 'leaderboards' };

export const LEADERBOARDS_URL = '/leaderboards';

export function routeFromPath(path = location.pathname): Route {
  const slug = slugFromPath(path);
  if (slug) return { kind: 'room', slug };
  if (/^\/play\/?$/.test(path)) return { kind: 'play' };
  if (/^\/leaderboards\/?$/.test(path)) return { kind: 'leaderboards' };
  return { kind: 'landing' };
}

export function slugFromPath(path = location.pathname): string | null {
  const m = path.match(/^\/r\/([a-z0-9]+)\/?$/);
  return m && ROOM_SLUG.test(m[1]) ? m[1] : null;
}

export function roomUrl(slug: string): string {
  return `/r/${slug}`;
}

export function goToRoom(slug: string) {
  location.assign(roomUrl(slug));
}

export function goPlay() {
  location.assign('/play');
}
