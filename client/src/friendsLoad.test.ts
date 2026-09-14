import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchFriends = vi.fn();
vi.mock('./api', () => ({ fetchFriends: (...args: unknown[]) => fetchFriends(...args) }));

import { useFriends } from './friends';

describe('friends store load ordering', () => {
  beforeEach(() => {
    fetchFriends.mockReset();
    useFriends.setState({ friends: [], incoming: [], outgoing: [], invites: [], open: false });
  });

  it('keeps the payload from the most recently started load, even if an earlier one resolves later', async () => {
    let resolveFirst!: (v: unknown) => void;
    const first = new Promise((r) => (resolveFirst = r));
    const second = { friends: [], incoming: [], outgoing: [{ id: 'x', handle: 'second', avatar: '', at: '' }] };

    fetchFriends.mockImplementationOnce(() => first);
    fetchFriends.mockImplementationOnce(() => Promise.resolve(second));

    const load1 = useFriends.getState().load();
    const load2 = useFriends.getState().load();

    // second load resolves first
    await load2;
    expect(useFriends.getState().outgoing).toEqual(second.outgoing);

    // first load resolves after; its stale payload must not clobber the newer one
    resolveFirst({ friends: [], incoming: [], outgoing: [{ id: 'y', handle: 'first', avatar: '', at: '' }] });
    await load1;
    expect(useFriends.getState().outgoing).toEqual(second.outgoing);
  });
});
