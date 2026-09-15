import { AvatarConfig, DEFAULT_AVATAR, SLOTS, normalizeAvatar } from '@dovey/shared';
import { Repo, User } from './repo';
import { canEquip } from './vending';

/** Premium cosmetics must be owned: anything that isn't goes back to the starter default. */
export async function equippableLook(repo: Repo, userId: string, look: AvatarConfig): Promise<AvatarConfig> {
  const cfg: Record<string, string> = { ...normalizeAvatar(look) };
  for (const slot of SLOTS) {
    if (!(await canEquip(repo, userId, cfg[slot]))) {
      cfg[slot] = DEFAULT_AVATAR[slot];
      cfg[`${slot}Colour`] = DEFAULT_AVATAR[`${slot}Colour` as keyof AvatarConfig] as string;
    }
  }
  return normalizeAvatar(cfg);
}

/**
 * The look a player wears on joining a room. The server-saved look is the source of
 * truth: the join options' avatar is ignored (it is only a seed when the user is created),
 * so a stale or random client look can't replace the saved outfit on every room switch.
 */
export function joinLook(repo: Repo, user: User, _options?: { avatar?: unknown }): Promise<AvatarConfig> {
  return equippableLook(repo, user.id, user.avatar);
}
