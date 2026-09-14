import { beforeEach, describe, expect, it } from 'vitest';
import type { FriendView } from './api';
import { sortFriends, useFriends } from './friends';

const f = (id: string, handle: string, online: boolean): FriendView => ({ id, handle, avatar: '', since: '', online, room: online ? { slug: 'lobby', name: 'Main Lobby' } : null });

describe('friends store', () => {
  beforeEach(() => useFriends.setState({ friends: [], incoming: [], outgoing: [], invites: [], open: false }));

  it('sorts online friends first, then by handle', () => {
    expect(sortFriends([f('1', 'zed', false), f('2', 'bob', true), f('3', 'amy', false), f('4', 'cat', true)]).map((x) => x.handle)).toEqual(['bob', 'cat', 'amy', 'zed']);
  });

  it('applies presence updates and re-sorts', () => {
    useFriends.getState().setData({ friends: [f('1', 'amy', false), f('2', 'bob', true)], incoming: [], outgoing: [] });
    useFriends.getState().applyPresence({ id: '1', online: true, room: { slug: 'casino', name: 'Casino' } });
    expect(useFriends.getState().friends[0]).toMatchObject({ id: '1', online: true, room: { slug: 'casino', name: 'Casino' } });
    useFriends.getState().applyPresence({ id: '2', online: false, room: null });
    expect(useFriends.getState().friends.map((x) => [x.handle, x.online])).toEqual([
      ['amy', true],
      ['bob', false],
    ]);
    useFriends.getState().applyPresence({ id: 'stranger', online: true, room: null });
    expect(useFriends.getState().friends.length).toBe(2);
  });

  it('queues invites without duplicates and dismisses by key', () => {
    const inv = { from: { id: '1', handle: 'amy', avatar: '' }, room: { slug: 'casino', name: 'Casino' } };
    useFriends.getState().pushInvite(inv);
    useFriends.getState().pushInvite(inv);
    useFriends.getState().pushInvite({ ...inv, from: { ...inv.from, id: '2', handle: 'bob' } });
    const invites = useFriends.getState().invites;
    expect(invites.map((i) => i.from.handle)).toEqual(['amy', 'bob']);
    useFriends.getState().dismissInvite(invites[0].key);
    expect(useFriends.getState().invites.map((i) => i.from.handle)).toEqual(['bob']);
  });
});
