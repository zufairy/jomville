import { describe, expect, it } from 'vitest';
import { footerState } from './leaderboardFooter';

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
