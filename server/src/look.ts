import { AvatarConfig, DEFAULT_AVATAR, SLOTS, normalizeAvatar, serializeAvatar } from '@dovey/shared';
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
 * The user's stored look with unowned items stripped. When stripping changed it, the
 * cleaned look is written back so every other reader (/api/me, friends, leaderboards)
 * stops showing items the user doesn't own.
 */
export async function ownedLook(repo: Repo, user: User): Promise<AvatarConfig> {
  const look = await equippableLook(repo, user.id, user.avatar);
  if (serializeAvatar(look) !== serializeAvatar(user.avatar)) await repo.setAvatar(user.id, look);
  return look;
}

/** look saves still being written, per user: a join waits for these before reading the row */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Persist a look the client asked to wear (ownership-checked). Resolves only once the
 * write has landed, with the look actually saved, so the caller can ack it. Saves for
 * one user run in order.
 */
export function saveLook(repo: Repo, userId: string, config: unknown): Promise<AvatarConfig> {
  const prev = inflight.get(userId) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const look = await equippableLook(repo, userId, normalizeAvatar(config));
      await repo.setAvatar(userId, look);
      return look;
    });
  inflight.set(userId, run);
  run
    .finally(() => {
      if (inflight.get(userId) === run) inflight.delete(userId);
    })
    .catch(() => undefined);
  return run;
}

/**
 * The look a player wears on joining a room. The server-saved look is the source of
 * truth: the join options' avatar is ignored (it is only a seed when the user is created),
 * so a stale or random client look can't replace the saved outfit on every room switch.
 * A save still in flight from the page that just navigated away is waited for first.
 */
export async function joinLook(repo: Repo, user: User, _options?: { avatar?: unknown }): Promise<AvatarConfig> {
  const pending = inflight.get(user.id);
  if (pending) {
    await pending.catch(() => undefined);
    user = (await repo.userById(user.id)) ?? user;
  }
  return ownedLook(repo, user);
}
