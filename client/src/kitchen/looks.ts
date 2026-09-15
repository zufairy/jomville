import { AvatarConfig, parseAvatar } from '@dovey/shared';
import type { RosterEntry } from '../roster';

export interface LookSources {
  /** local user id in the kitchen */
  me: string;
  /** the local player's live look (customizer changes land here first) */
  myAvatar: AvatarConfig;
  /** user id -> serialized avatar, sent by the kitchen room on join */
  looks: Readonly<Record<string, string>>;
  /** the world roster, by session id: only a fallback (crewmates from other rooms aren't in it) */
  roster: Readonly<Record<string, RosterEntry>>;
}

/** A chef's avatar: yours, else the kitchen room's copy, else the world roster; null when nobody knows yet. */
export function chefLook(id: string, src: LookSources): AvatarConfig | null {
  if (id === src.me) return src.myAvatar;
  const look = src.looks[id];
  if (look) return parseAvatar(look);
  const entry = Object.values(src.roster).find((p) => p.userId === id);
  return entry ? parseAvatar(entry.avatar) : null;
}
