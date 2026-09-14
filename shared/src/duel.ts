/**
 * Rock-paper-scissors duel wagers. Shared so the client's stake picker and the
 * server's validation can never disagree.
 */
export const DUEL_STAKES = [0, 25, 50, 100, 250, 500] as const;
export type DuelStake = (typeof DUEL_STAKES)[number];

/** coins the winner of a free (stake 0) duel earns from the house */
export const DUEL_REWARD = 25;
/** a duel still undecided once the round counter passes this ends (tied = draw) */
export const DUEL_MAX_ROUNDS = 6;
/** how long each side has to throw a hand */
export const DUEL_PICK_MS = 20_000;

export function isDuelStake(v: unknown): v is DuelStake {
  return typeof v === 'number' && (DUEL_STAKES as readonly number[]).includes(v);
}

/** What the winner is credited: both stakes, or the house reward for a free duel. */
export function duelPrize(stake: DuelStake): number {
  return stake > 0 ? stake * 2 : DUEL_REWARD;
}
