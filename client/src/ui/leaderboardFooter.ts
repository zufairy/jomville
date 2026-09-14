import { MyRanks } from '../leaderboards';

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
