import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AVATAR, normalizeAvatar, parseAvatar, serializeAvatar } from '@dovey/shared';
import type { Me } from './api';

// the store reads/writes localStorage at module load; node has none, so stub one that
// survives across simulated page loads (vi.resetModules gives a fresh store each time)
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

const saved = normalizeAvatar({ ...DEFAULT_AVATAR, body: 'female', torsoColour: 'red', hat: 'none' });
const me = (avatar: unknown): Me => ({
  handle: 'mia',
  home: 'abcd1234',
  lobby: 'lobby',
  onboarded: true,
  linked: false,
  googleEnabled: false,
  state: 'Selangor',
  birthdate: '2000-01-01',
  avatar,
});

async function freshPageLoad() {
  vi.resetModules();
  return (await import('./store')).useAppStore;
}

describe('outfit persists across page loads', () => {
  beforeEach(() => mem.clear());

  it('adopting /api/me replaces a random local look with the saved look and caches it', async () => {
    const store = await freshPageLoad();
    store.getState().adoptMe(me(saved));
    expect(store.getState().me?.handle).toBe('mia');
    expect(store.getState().avatar).toEqual(saved);
    expect(parseAvatar(mem.get('dovey.avatar'))).toEqual(saved);
  });

  it('keeps the local look when the server has none', async () => {
    mem.set('dovey.avatar', serializeAvatar(saved));
    const store = await freshPageLoad();
    store.getState().adoptMe(me(undefined));
    expect(store.getState().avatar).toEqual(saved);
  });

  it('two room switches with empty storage and a fixed server look keep the same outfit', async () => {
    const looks = [];
    for (let load = 0; load < 2; load++) {
      if (load === 0) expect(mem.get('dovey.avatar')).toBeUndefined();
      const store = await freshPageLoad();
      store.getState().adoptMe(me(saved)); // what Game does before joining
      looks.push(store.getState().avatar);
    }
    expect(looks[0]).toEqual(saved);
    expect(looks[1]).toEqual(saved);
  });

  it('a brand-new device caches the look it created the user with', async () => {
    const store = await freshPageLoad();
    const sent = store.getState().avatar; // fetchMe sends this; server stores and echoes it
    store.getState().adoptMe(me(sent));
    const next = await freshPageLoad();
    expect(next.getState().avatar).toEqual(sent);
  });
});
