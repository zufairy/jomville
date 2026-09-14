import { TRADE_MIN_AGE_MS, TRADE_MIN_PLAY_MINUTES } from '@dovey/shared';

/** Account-age and play-time gates guard production only; locally anyone can try trading at once. */
export function tradeGatesOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'production' && env.TRADE_GATES !== 'off';
}

export function isTooNew(standing: { createdAt: Date; playMinutes: number }, now = Date.now()): boolean {
  return now - standing.createdAt.getTime() < TRADE_MIN_AGE_MS || standing.playMinutes < TRADE_MIN_PLAY_MINUTES;
}
