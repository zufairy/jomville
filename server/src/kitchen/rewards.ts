import { kitchen } from '@dovey/shared';

const HOUR_MS = 3_600_000;

/** End-of-round coins: stars × 10, at most KITCHEN_COINS_HOURLY_CAP per user per rolling hour. */
export class KitchenRewards {
  private earned = new Map<string, Array<{ at: number; coins: number }>>();

  constructor(private now: () => number = Date.now) {}

  grant(userId: string, stars: number): number {
    const since = this.now() - HOUR_MS;
    const recent = (this.earned.get(userId) ?? []).filter((e) => e.at > since);
    const got = recent.reduce((sum, e) => sum + e.coins, 0);
    const coins = Math.max(0, Math.min(stars * kitchen.KITCHEN_COINS_PER_STAR, kitchen.KITCHEN_COINS_HOURLY_CAP - got));
    if (coins) recent.push({ at: this.now(), coins });
    this.earned.set(userId, recent);
    return coins;
  }
}
