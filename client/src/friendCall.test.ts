import { beforeEach, describe, expect, it } from 'vitest';
import { IDLE_CALL } from './call';
import { useAppStore } from './store';
import {
  FriendCallManager,
  IDLE_FRIEND_CALL,
  RESUME_MAX_AGE_MS,
  STORAGE_KEY,
  bindFriendCallSender,
  clampPos,
  loadCall,
  saveCall,
  useFriendCall,
} from './friendCall';
import { onAdultRequired, useAdultGate } from './adultGate';

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const PEER = { id: 'u2', handle: 'bob', avatar: '{}' };

describe('friend call storage and layout', () => {
  it('saves and restores a call within the resume window only', () => {
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: false, savedAt: 1000 }, s);
    expect(JSON.parse(s.m.get(STORAGE_KEY)!)).toMatchObject({ peer: PEER });
    expect(loadCall(1000 + RESUME_MAX_AGE_MS, s)).toEqual({ peer: PEER, video: true, initiator: false, savedAt: 1000 });
    expect(loadCall(1001 + RESUME_MAX_AGE_MS, s)).toBeNull();
    expect(s.m.has(STORAGE_KEY)).toBe(false);
    s.setItem(STORAGE_KEY, '{broken');
    expect(loadCall(0, s)).toBeNull();
  });

  it('clamps the window inside the viewport', () => {
    expect(clampPos({ x: -50, y: 900 }, { w: 200, h: 150 }, { w: 400, h: 800 })).toEqual({ x: 8, y: 642 });
    expect(clampPos({ x: 100, y: 100 }, { w: 200, h: 150 }, { w: 400, h: 800 })).toEqual({ x: 100, y: 100 });
    expect(clampPos({ x: 100, y: 100 }, { w: 500, h: 150 }, { w: 400, h: 800 })).toEqual({ x: 8, y: 100 });
  });
});

describe('FriendCallManager signaling (no media)', () => {
  let sent: Array<[string, unknown]>;
  let m: FriendCallManager;
  beforeEach(() => {
    sent = [];
    bindFriendCallSender((type, data) => sent.push([type, data]));
    useFriendCall.getState().reset();
    useAppStore.getState().setCall(IDLE_CALL);
    m = new FriendCallManager(memStorage());
  });

  it('invites, and a rejection code resets the ring', () => {
    m.invite(PEER, true);
    expect(sent).toEqual([['fcall_invite', { toUserId: 'u2', video: true }]]);
    expect(useFriendCall.getState()).toMatchObject({ phase: 'ringing_out', peer: PEER, video: true, initiator: true });
    m.onSys('busy_peer');
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('auto-declines as busy while a same-room call is on', () => {
    useAppStore.getState().setCall({ ...IDLE_CALL, phase: 'active', peer: 's1' });
    m.onIncoming({ from: PEER, video: false });
    expect(sent).toEqual([['fcall_decline', { busy: true }]]);
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('rings in, declines, and ignores a start meant for another tab', () => {
    m.onIncoming({ from: PEER, video: false });
    expect(useFriendCall.getState()).toMatchObject({ phase: 'ringing_in', peer: PEER, initiator: false });
    // another tab of mine accepted: this tab stops ringing
    void m.onStart({ peer: 'u2', video: false, initiator: false });
    expect(useFriendCall.getState().phase).toBe('idle');
    m.onIncoming({ from: PEER, video: false });
    m.decline();
    expect(sent.at(-1)).toEqual(['fcall_decline', {}]);
    expect(useFriendCall.getState()).toMatchObject(IDLE_FRIEND_CALL);
  });

  it('ignores signals and rejoins when idle; ends clear the view', () => {
    void m.onSignal({ from: 'u2', data: { ice: {} } });
    void m.onRejoin({ peer: 'u2', video: false, initiator: true });
    expect(useFriendCall.getState().phase).toBe('idle');
    m.onIncoming({ from: PEER, video: false });
    m.onEnd({ reason: 'cancelled' });
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('resume with a saved call asks the server to rejoin', () => {
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: true, savedAt: Date.now() }, s);
    const r = new FriendCallManager(s);
    r.resume();
    expect(sent).toEqual([['fcall_resume', undefined]]);
    expect(useFriendCall.getState()).toMatchObject({ phase: 'rejoining', peer: PEER, initiator: true });
    r.teardown();
  });
});

describe('adult gate', () => {
  it('turns a rejected same-room invite into a pending confirmation', () => {
    useAppStore.getState().setCall({ ...IDLE_CALL, phase: 'ringing_out', peer: 's9', handle: 'zed', video: true });
    onAdultRequired();
    expect(useAdultGate.getState().pending).toEqual({ peer: 's9', handle: 'zed', video: true });
    expect(useAppStore.getState().call.phase).toBe('idle');
    useAdultGate.getState().close();
    expect(useAdultGate.getState().pending).toBeNull();
  });
});
