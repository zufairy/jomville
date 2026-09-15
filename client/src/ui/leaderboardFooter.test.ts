import { describe, expect, it } from 'vitest';
import { footerState, isMyRow, medalForRank, myHandle, myRankText, popupBarState, staggerMs } from './leaderboardFooter';

const RANKED: import('../leaderboards').MyRanks = {
  hidden: false,
  handle: 'me',
  coins: { rank: 3, value: 100 },
  assets: { rank: 1, value: 50 },
  timeWeek: { rank: 2, value: 60 },
  timeAll: { rank: 2, value: 600 },
};
const HIDDEN: import('../leaderboards').MyRanks = { hidden: true };

describe('footerState', () => {
  it('shows the CTA for a visitor with no token, regardless of ranks/checked', () => {
    expect(footerState(null, null, false)).toBe('cta');
    expect(footerState(null, null, true)).toBe('cta');
    expect(footerState(null, RANKED, true)).toBe('cta');
  });

  it('shows nothing while the request is in flight', () => {
    expect(footerState('tok', null, false)).toBe('none');
  });

  it('shows nothing for a signed-in player whose /me request failed', () => {
    expect(footerState('tok', null, true)).toBe('none');
  });

  it('shows the hidden state for a signed-in, hidden player', () => {
    expect(footerState('tok', HIDDEN, true)).toBe('hidden');
  });

  it('shows the ranked state for a signed-in, visible player', () => {
    expect(footerState('tok', RANKED, true)).toBe('ranked');
  });
});

describe('medalForRank', () => {
  it('maps ranks 1-3 to gold/silver/bronze and anything else to none', () => {
    expect(medalForRank(1)).toBe('gold');
    expect(medalForRank(2)).toBe('silver');
    expect(medalForRank(3)).toBe('bronze');
    expect(medalForRank(4)).toBeNull();
    expect(medalForRank(0)).toBeNull();
  });

  it('uses rank, not position: a tie at #1 gives both gold', () => {
    const rows = [
      { rank: 1, handle: 'a', avatar: '', value: 9 },
      { rank: 1, handle: 'b', avatar: '', value: 9 },
      { rank: 3, handle: 'c', avatar: '', value: 5 },
    ];
    expect(rows.map((r) => medalForRank(r.rank))).toEqual(['gold', 'gold', 'bronze']);
  });
});

describe('own row matching', () => {
  const row = (handle: string, rank = 1) => ({ rank, handle, avatar: '', value: 1 });

  it('matches by handle only', () => {
    expect(isMyRow(row('me'), RANKED)).toBe(true);
    expect(isMyRow(row('someone', 3), RANKED)).toBe(false);
  });

  it('never matches when hidden or unknown', () => {
    expect(isMyRow(row('me'), HIDDEN)).toBe(false);
    expect(isMyRow(row('me'), null)).toBe(false);
    expect(myHandle(HIDDEN)).toBeNull();
    expect(myHandle(RANKED)).toBe('me');
  });
});

describe('popupBarState', () => {
  it('shows nothing while loading or after a failed /me request', () => {
    expect(popupBarState(null, false)).toBe('none');
    expect(popupBarState(null, true)).toBe('none');
    expect(popupBarState(RANKED, false)).toBe('none');
  });

  it('shows hidden or ranked once checked', () => {
    expect(popupBarState(HIDDEN, true)).toBe('hidden');
    expect(popupBarState(RANKED, true)).toBe('ranked');
  });
});

describe('myRankText', () => {
  it('formats the rank for the chosen board', () => {
    expect(myRankText(RANKED, 'coins')).toBe('#3');
    expect(myRankText(RANKED, 'timeAll')).toBe('#2');
  });

  it('shows a dash when unranked on that board and null when hidden/unknown', () => {
    expect(myRankText({ ...RANKED, assets: { rank: null, value: 0 } } as typeof RANKED, 'assets')).toBe('–');
    expect(myRankText(HIDDEN, 'coins')).toBeNull();
    expect(myRankText(null, 'coins')).toBeNull();
  });
});

describe('staggerMs', () => {
  it('grows per row and caps', () => {
    expect(staggerMs(0)).toBe(0);
    expect(staggerMs(2)).toBe(70);
    expect(staggerMs(49)).toBe(350);
    expect(staggerMs(-1)).toBe(0);
  });
});
