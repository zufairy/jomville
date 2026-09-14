import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_CALL } from './call';
import { useAppStore } from './store';
import { useRoster } from './roster';
import { deviceToken } from './identity';
import {
  FriendCallManager,
  IDLE_FRIEND_CALL,
  RESUME_MAX_AGE_MS,
  STORAGE_KEY,
  accountFingerprint,
  bindFriendCallSender,
  clampPos,
  loadCall,
  saveCall,
  useFriendCall,
} from './friendCall';
import { onAdultRequired, useAdultGate } from './adultGate';

// deviceToken() reads/writes localStorage, which this test's vitest environment (node) does
// not provide. Stub a minimal in-memory version so it returns a stable value across calls,
// the same way it persists across calls within a real browser tab.
const memoryLocalStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
};
(globalThis as unknown as { localStorage: Storage }).localStorage = memoryLocalStorage();
const ME_ACCOUNT = accountFingerprint(deviceToken());

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const PEER = { id: 'u2', handle: 'bob', avatar: '{}' };

describe('friend call storage and layout', () => {
  it('saves and restores a call within the resume window only', () => {
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: false, savedAt: 1000, account: ME_ACCOUNT }, s);
    expect(JSON.parse(s.m.get(STORAGE_KEY)!)).toMatchObject({ peer: PEER, account: ME_ACCOUNT });
    expect(loadCall(1000 + RESUME_MAX_AGE_MS, s)).toEqual({ peer: PEER, video: true, initiator: false, savedAt: 1000, account: ME_ACCOUNT });
    expect(loadCall(1001 + RESUME_MAX_AGE_MS, s)).toBeNull();
    expect(s.m.has(STORAGE_KEY)).toBe(false);
    s.setItem(STORAGE_KEY, '{broken');
    expect(loadCall(0, s)).toBeNull();
  });

  it('drops and clears a saved call parked under a different account', () => {
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: false, savedAt: 1000, account: ME_ACCOUNT }, s);
    expect(loadCall(1000, s, accountFingerprint('a-totally-different-token'))).toBeNull();
    expect(s.m.has(STORAGE_KEY)).toBe(false);
    // a matching fingerprint still resolves
    saveCall({ peer: PEER, video: true, initiator: false, savedAt: 1000, account: ME_ACCOUNT }, s);
    expect(loadCall(1000, s, ME_ACCOUNT)).toMatchObject({ peer: PEER });
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

  it('invites, and an invite failure resets the ring', () => {
    m.invite(PEER, true);
    expect(sent).toEqual([['fcall_invite', { toUserId: 'u2', video: true }]]);
    expect(useFriendCall.getState()).toMatchObject({ phase: 'ringing_out', peer: PEER, video: true, initiator: true });
    m.onFail({ action: 'invite', code: 'busy_peer' });
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('a failure from an unrelated action does not tear down an outgoing ring', () => {
    m.invite(PEER, true);
    // sys codes like rate_limited are shared with chat/duel/edit limits; only an
    // invite failure (never a bare code) may tear down the ring
    m.onFail({ action: 'report', code: 'rate_limited' });
    expect(useFriendCall.getState().phase).toBe('ringing_out');
    m.onFail({ action: 'invite', code: 'busy_peer' });
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
    saveCall({ peer: PEER, video: true, initiator: true, savedAt: Date.now(), account: ME_ACCOUNT }, s);
    const r = new FriendCallManager(s);
    r.resume();
    expect(sent).toEqual([['fcall_resume', { fresh: true }]]);
    expect(useFriendCall.getState()).toMatchObject({ phase: 'rejoining', peer: PEER, initiator: true });
    r.teardown();
  });

  it('resumes even when the room roster is empty, as long as the device token matches (regression: identity must not depend on roster/schema-sync timing)', () => {
    useRoster.getState().clear();
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: true, savedAt: Date.now(), account: ME_ACCOUNT }, s);
    const r = new FriendCallManager(s);
    r.resume();
    expect(sent).toEqual([['fcall_resume', { fresh: true }]]);
    expect(useFriendCall.getState()).toMatchObject({ phase: 'rejoining', peer: PEER, initiator: true });
    r.teardown();
  });

  it('ignores and clears a saved call parked under a different device token', () => {
    const s = memStorage();
    saveCall({ peer: PEER, video: true, initiator: true, savedAt: Date.now(), account: accountFingerprint('a-totally-different-token') }, s);
    const r = new FriendCallManager(s);
    r.resume();
    expect(sent).toEqual([]);
    expect(useFriendCall.getState().phase).toBe('idle');
    expect(s.m.has(STORAGE_KEY)).toBe(false);
  });

  it('reports without tearing down; the call ends only once the server confirms', () => {
    useFriendCall.getState().patch({ phase: 'active', peer: PEER, initiator: true, video: false });
    m.report('spam', 'note');
    expect(sent).toEqual([['fcall_report', { reason: 'spam', note: 'note' }]]);
    expect(useFriendCall.getState().phase).toBe('active');
    m.onEnd({ reason: 'ended' });
    expect(useFriendCall.getState().phase).toBe('idle');
  });

  it('a live tab with no peer connection resumes as fresh', () => {
    useFriendCall.getState().patch({ phase: 'rejoining', peer: PEER, initiator: true, video: false });
    m.resume();
    expect(sent).toEqual([['fcall_resume', { fresh: true }]]);
    m.teardown();
  });

  it('accept starts the connect timeout', () => {
    vi.useFakeTimers();
    try {
      m.onIncoming({ from: PEER, video: false });
      m.accept();
      expect(useFriendCall.getState().phase).toBe('connecting');
      vi.advanceTimersByTime(30_000);
      expect(useFriendCall.getState().phase).toBe('idle');
      expect(sent.at(-1)).toEqual(['fcall_end', undefined]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a report failure keeps the call up', () => {
    useFriendCall.getState().patch({ phase: 'active', peer: PEER, initiator: true, video: false });
    m.report('spam');
    m.onFail({ action: 'report', code: 'no_call' });
    expect(useFriendCall.getState().phase).toBe('active');
  });
});

describe('FriendCallManager media release (regression: call ends during connect awaits)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops tracks acquired after teardown and sends nothing', async () => {
    const sent: Array<[string, unknown]> = [];
    bindFriendCallSender((type, data) => sent.push([type, data]));
    useFriendCall.getState().reset();
    useAppStore.getState().setCall(IDLE_CALL);
    let resolveMedia!: (s: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => (resolveMedia = resolve)));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const pcCtor = vi.fn();
    vi.stubGlobal('RTCPeerConnection', pcCtor);
    vi.stubGlobal('MediaStream', vi.fn());
    const tracks = [{ kind: 'audio', enabled: true, stop: vi.fn() }, { kind: 'video', enabled: true, stop: vi.fn() }];
    const stream = { getTracks: () => tracks, getAudioTracks: () => [tracks[0]], getVideoTracks: () => [tracks[1]] } as unknown as MediaStream;

    const m = new FriendCallManager(memStorage());
    m.invite(PEER, true);
    const starting = m.onStart({ peer: 'u2', video: true, initiator: true });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    sent.length = 0;
    m.onEnd({ reason: 'ended' }); // the call ends while getUserMedia is still pending
    resolveMedia(stream);
    await starting;

    for (const t of tracks) expect(t.stop).toHaveBeenCalled();
    expect(pcCtor).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    expect(useFriendCall.getState().phase).toBe('idle');
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
