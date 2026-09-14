import { create } from 'zustand';
import { FriendRequestView, FriendRoom, FriendView, FriendsPayload, fetchFriends, friendAction } from './api';
import { useAppStore } from './store';

/**
 * Friends: accepted friends with live presence, pending requests both ways,
 * and room invites waiting for an answer. Kept out of the main store like the
 * Love Meter and table games; only friends messages and the friends sheet touch it.
 */
export interface FriendInvite {
  key: number;
  from: { id: string; handle: string; avatar: string };
  room: FriendRoom;
}

const MAX_INVITES = 5;
let inviteSeq = 0;
let loadSeq = 0;

export function sortFriends(list: FriendView[]): FriendView[] {
  return [...list].sort((a, b) => Number(b.online) - Number(a.online) || a.handle.localeCompare(b.handle));
}

interface FriendsStore {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  invites: FriendInvite[];
  open: boolean;
  setOpen: (v: boolean) => void;
  setData: (p: FriendsPayload) => void;
  load: () => Promise<void>;
  applyPresence: (p: { id: string; online: boolean; room: FriendRoom | null }) => void;
  pushInvite: (i: Omit<FriendInvite, 'key'>) => void;
  dismissInvite: (key: number) => void;
}

export const useFriends = create<FriendsStore>((set, get) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  invites: [],
  open: false,
  setOpen: (open) => set({ open }),
  setData: (p) => set({ friends: sortFriends(p.friends), incoming: p.incoming, outgoing: p.outgoing }),
  load: async () => {
    const seq = ++loadSeq;
    const p = await fetchFriends();
    if (p && seq === loadSeq) get().setData(p);
  },
  applyPresence: ({ id, online, room }) => {
    const friends = get().friends;
    if (!friends.some((f) => f.id === id)) return;
    set({ friends: sortFriends(friends.map((f) => (f.id === id ? { ...f, online, room } : f))) });
  },
  pushInvite: (i) =>
    set((s) => {
      if (s.invites.some((x) => x.from.id === i.from.id && x.room.slug === i.room.slug)) return s;
      return { invites: [...s.invites, { ...i, key: ++inviteSeq }].slice(-MAX_INVITES) };
    }),
  dismissInvite: (key) => set((s) => ({ invites: s.invites.filter((i) => i.key !== key) })),
}));

type Send = (type: string, data?: unknown) => void;
let send: Send | null = null;

export function bindFriendSender(fn: Send | null) {
  send = fn;
}

const RESULT_TEXT: Record<string, string> = {
  sent: 'friend request sent',
  accepted: "you're friends now 🎉",
  already: 'already friends',
  pending: 'request already sent',
  blocked: "can't add this player",
  self: "that's you",
  limit: 'friend list is full',
  no_user: 'player not found',
  declined: 'request declined',
  no_request: 'that request is gone',
  error: 'something went wrong, try again',
  rate_limited: 'slow down',
};

async function act(path: 'request' | 'respond' | 'cancel' | 'remove', body: Record<string, unknown>) {
  const result = await friendAction(path, body);
  const text = RESULT_TEXT[result];
  if (text) useAppStore.getState().flash(text);
  await useFriends.getState().load();
  return result;
}

export const friends = {
  request: (userId: string) => act('request', { toUserId: userId }),
  respond: (fromId: string, accept: boolean) => act('respond', { fromUserId: fromId, accept }),
  cancel: (toId: string) => act('cancel', { toUserId: toId }),
  remove: (id: string) => act('remove', { userId: id }),
  invite: (toUserId: string) => send?.('friend_invite', { toUserId }),
};

/** Server message handlers; registered inside Net.join() so they survive rejoins. */
export function onFriendRequest(m: { from: { id: string; handle: string } }) {
  useAppStore.getState().flash(`${m.from.handle} sent you a friend request`);
  void useFriends.getState().load();
}

export function onFriendUpdate() {
  void useFriends.getState().load();
}

export function onFriendPresence(m: { id: string; online: boolean; room: FriendRoom | null }) {
  useFriends.getState().applyPresence(m);
}

export function onFriendInvite(m: { from: { id: string; handle: string; avatar: string }; room: FriendRoom }) {
  useFriends.getState().pushInvite(m);
}

export function onFriendInviteSent() {
  useAppStore.getState().flash('invite sent');
}
