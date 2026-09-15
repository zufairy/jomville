import { BoardKey, BoardRow, MyRanks } from '../leaderboards';

/**
 * What the "you" footer on the leaderboards page should show. Pure so it is
 * testable without a DOM. `fetchMyRanks()` returns null both when there is no
 * token (a visitor) and when the request failed (401/network) — those two
 * cases must NOT look the same: a visitor gets a "play to get ranked" CTA, a
 * signed-in player whose request failed gets no footer at all.
 */
export type FooterState = 'none' | 'cta' | 'hidden' | 'ranked';

export function footerState(token: string | null, me: MyRanks | null, checked: boolean): FooterState {
  if (token === null) return 'cta';
  if (!checked || me === null) return 'none';
  return me.hidden ? 'hidden' : 'ranked';
}

export type Medal = 'gold' | 'silver' | 'bronze';

/** Medal from the player's real rank, not their list index: two players tied at #1 both get gold. */
export function medalForRank(rank: number): Medal | null {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
}

/** Handles are unique; matching by rank would highlight everyone tied with you. */
export function myHandle(me: MyRanks | null): string | null {
  return me !== null && !me.hidden ? me.handle : null;
}

export function isMyRow(row: BoardRow, me: MyRanks | null): boolean {
  const h = myHandle(me);
  return h !== null && row.handle === h;
}

/** The in-game popup always has a token, so there is no CTA: only hidden, ranked, or nothing. */
export type BarState = 'none' | 'hidden' | 'ranked';

export function popupBarState(me: MyRanks | null, checked: boolean): BarState {
  if (!checked || me === null) return 'none';
  return me.hidden ? 'hidden' : 'ranked';
}

/** "#23", or "–" when you are not on this board yet. Null when there is no ranked bar. */
export function myRankText(me: MyRanks | null, key: BoardKey): string | null {
  if (me === null || me.hidden) return null;
  const r = me[key].rank;
  return r === null ? '–' : `#${r}`;
}

/** Entrance stagger for list rows, capped so a 50-row board doesn't crawl in. */
export function staggerMs(index: number, step = 35, cap = 350): number {
  return Math.min(Math.max(0, index) * step, cap);
}
