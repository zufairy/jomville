import { create } from 'zustand';
import { AvatarConfig, parseAvatar } from '@dovey/shared';

/**
 * Who is in the room right now, by sessionId. Popups need a player's look
 * (portraits) without reaching into the Pixi world; net.ts keeps this in step
 * with room state.
 */
export interface RosterEntry {
  handle: string;
  userId: string;
  avatar: string;
}

interface RosterStore {
  players: Record<string, RosterEntry>;
  upsert: (id: string, e: RosterEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useRoster = create<RosterStore>((set) => ({
  players: {},
  upsert: (id, e) => set((s) => ({ players: { ...s.players, [id]: e } })),
  remove: (id) =>
    set((s) => {
      const players = { ...s.players };
      delete players[id];
      return { players };
    }),
  clear: () => set({ players: {} }),
}));

export function avatarOf(sessionId: string | null | undefined): AvatarConfig | null {
  if (!sessionId) return null;
  const p = useRoster.getState().players[sessionId];
  return p ? parseAvatar(p.avatar) : null;
}
