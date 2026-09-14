import { DUEL_REWARD, DUEL_STAKES, DuelStake } from '@dovey/shared';

export type StakeBlock = 'coins' | 'bot' | null;
export interface StakeChoice {
  stake: DuelStake;
  enabled: boolean;
  /** why a chip is disabled */
  blocked: StakeBlock;
}

/** The stake chips: free is always on; the rest need the coins, and locals never play for coins. */
export function stakeChoices(balance: number | null, opts: { bot?: boolean } = {}): StakeChoice[] {
  return DUEL_STAKES.map((stake) => {
    if (stake === 0) return { stake, enabled: true, blocked: null };
    if (opts.bot) return { stake, enabled: false, blocked: 'bot' };
    if (balance === null || balance < stake) return { stake, enabled: false, blocked: 'coins' };
    return { stake, enabled: true, blocked: null };
  });
}

/** Can this wallet put in the stake? */
export function canCover(balance: number | null, stake: number): boolean {
  return stake === 0 || (balance !== null && balance >= stake);
}

/** Lobby locals carry `bot:` account ids. */
export function isBotUser(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith('bot:');
}

/** Coins the result screen counts up: the prize for a win, the refund for a draw, nothing for a loss. */
export function resultCoins(stake: number, won: boolean | null): number {
  if (won === true) return stake > 0 ? stake * 2 : DUEL_REWARD;
  if (won === null) return stake;
  return 0;
}

/** Net wallet change the result screen shows under the counter. */
export function resultNet(stake: number, won: boolean | null): number {
  if (won === true) return stake > 0 ? stake : DUEL_REWARD;
  if (won === null) return 0;
  return -stake;
}
