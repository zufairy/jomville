import type { Placement, RoomStyle } from '@dovey/shared';
import { deviceToken } from './identity';
import { useAppStore } from './store';

export interface RoomListing {
  slug: string;
  name: string;
  owner: string;
  category: string;
  theme: string;
  /** one of the app's own rooms (lobby, harbor, Wonder Dome...) rather than a player's house */
  system: boolean;
  live: number;
  visitors24h: number;
  /** showcase system room, listed first with a badge */
  featured?: boolean;
}

export type RoomTab = 'busy' | 'new' | 'top' | 'personal';

/** What a room looks like, enough to draw its thumbnail. */
export interface RoomPreview {
  size: number;
  theme: string;
  mask: string[] | null;
  style: RoomStyle;
  layout: Placement[];
}

const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface Me {
  handle: string;
  home: string;
  lobby: string;
  onboarded: boolean;
  linked: boolean;
  googleEnabled: boolean;
  /** the server-saved look (AvatarConfig JSON); normalize before use */
  avatar?: unknown;
}

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export async function fetchMe(): Promise<Me> {
  const r = await fetch(`${base}/api/me`, json({ token: deviceToken(), avatar: useAppStore.getState().avatar }));
  if (!r.ok) throw new Error('me failed');
  return r.json();
}

export async function patchMe(patch: { handle?: string; onboarded?: boolean }): Promise<Me | { error: string }> {
  const r = await fetch(`${base}/api/me`, { ...json({ token: deviceToken(), ...patch }), method: 'PATCH' });
  return r.json();
}

export async function googleSignIn(credential: string): Promise<Me> {
  const r = await fetch(`${base}/api/auth/google`, json({ token: deviceToken(), credential, avatar: useAppStore.getState().avatar }));
  if (!r.ok) throw new Error((await r.json()).error ?? 'sign-in failed');
  return r.json();
}

export async function fetchRooms(tab: RoomTab): Promise<RoomListing[]> {
  const query = tab === 'personal' ? 'sort=busy&kind=personal' : `sort=${tab}`;
  const r = await fetch(`${base}/api/rooms?${query}`);
  if (!r.ok) return [];
  return r.json();
}

export async function fetchRoomPreview(slug: string): Promise<RoomPreview | null> {
  const r = await fetch(`${base}/api/rooms/${encodeURIComponent(slug)}/preview`);
  if (!r.ok) return null;
  return r.json();
}

export async function fetchRandomRoom(not: string): Promise<string | null> {
  const r = await fetch(`${base}/api/rooms/random?not=${encodeURIComponent(not)}`);
  if (!r.ok) return null;
  return (await r.json()).slug;
}

export interface InstanceItem {
  id: string;
  def: string;
  serial: number | null;
  placed: string | null;
}

export interface Inventory {
  coins: number;
  items: Record<string, number>;
  instances: InstanceItem[];
}

export async function fetchInventory(): Promise<Inventory | null> {
  const r = await fetch(`${base}/api/inventory`, json({ token: deviceToken() }));
  if (!r.ok) return null;
  return r.json();
}

export async function buyItem(def: string, qty = 1): Promise<Inventory | { error: string }> {
  const r = await fetch(`${base}/api/shop/buy`, json({ token: deviceToken(), def, qty }));
  return r.json();
}

export async function fetchShopStock(): Promise<Record<string, { sold: number; cap: number }>> {
  const r = await fetch(`${base}/api/shop/stock`);
  if (!r.ok) return {};
  return r.json();
}

export async function fetchWardrobe(): Promise<{ owned: string[]; credits: number } | null> {
  const r = await fetch(`${base}/api/wardrobe`, json({ token: deviceToken() }));
  if (!r.ok) return null;
  return r.json();
}

export async function claimDaily(): Promise<{ granted: boolean; coins: number } | null> {
  const r = await fetch(`${base}/api/daily`, json({ token: deviceToken() }));
  if (!r.ok) return null;
  return r.json();
}

// ---- friends
export interface FriendRoom {
  slug: string;
  name: string;
}
export interface FriendView {
  id: string;
  handle: string;
  avatar: string;
  since: string;
  online: boolean;
  room: FriendRoom | null;
}
export interface FriendRequestView {
  id: string;
  handle: string;
  avatar: string;
  at: string;
}
export interface FriendsPayload {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

export async function fetchFriends(): Promise<FriendsPayload | null> {
  try {
    const r = await fetch(`${base}/api/friends`, json({ token: deviceToken() }));
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

export async function friendAction(path: 'request' | 'respond' | 'cancel' | 'remove', body: Record<string, unknown>): Promise<string> {
  try {
    const r = await fetch(`${base}/api/friends/${path}`, json({ token: deviceToken(), ...body }));
    const data = (await r.json().catch(() => null)) as { result?: string } | null;
    return data?.result ?? 'error';
  } catch {
    return 'error';
  }
}

// ---- calls
export async function fetchIceServers(): Promise<RTCIceServer[] | null> {
  try {
    const r = await fetch(`${base}/api/ice`, json({ token: deviceToken() }));
    if (!r.ok) return null;
    return ((await r.json()) as { iceServers?: RTCIceServer[] }).iceServers ?? null;
  } catch {
    return null;
  }
}

export async function confirmAdult(): Promise<boolean> {
  try {
    const r = await fetch(`${base}/api/me/adult`, json({ token: deviceToken() }));
    return r.ok;
  } catch {
    return false;
  }
}
