import { create } from 'zustand';
import { loadIce, setOtherCallBusy } from './call';
import { useAppStore } from './store';
import { deviceToken } from './identity';

/**
 * Friend calls: 1-to-1 voice/video with a friend in any room. Signaling goes
 * through whichever room this tab is in (server routes by userId). Room changes
 * reload the page, so a live call is parked in sessionStorage and resumed when
 * the next room joins; the server holds it for 10 s.
 */
export type FriendCallPhase = 'idle' | 'ringing_out' | 'ringing_in' | 'connecting' | 'active' | 'rejoining';

export interface FriendPeer {
  id: string;
  handle: string;
  avatar: string;
}

export interface FriendCallView {
  phase: FriendCallPhase;
  peer: FriendPeer | null;
  video: boolean;
  /** this side sends the offers */
  initiator: boolean;
  micOn: boolean;
  camOn: boolean;
  remoteHasVideo: boolean;
  collapsed: boolean;
  ringingSince: number;
}

export const IDLE_FRIEND_CALL: FriendCallView = {
  phase: 'idle',
  peer: null,
  video: false,
  initiator: false,
  micOn: true,
  camOn: true,
  remoteHasVideo: false,
  collapsed: false,
  ringingSince: 0,
};

export const useFriendCall = create<FriendCallView & { patch: (p: Partial<FriendCallView>) => void; reset: () => void }>((set) => ({
  ...IDLE_FRIEND_CALL,
  patch: (p) => set(p),
  reset: () => set({ ...IDLE_FRIEND_CALL }),
}));

export const STORAGE_KEY = 'leypark.fcall';
export const RESUME_MAX_AGE_MS = 15_000;
export const REJOIN_GRACE_MS = 10_000;
export const CONNECT_TIMEOUT_MS = 30_000;

export interface SavedCall {
  peer: FriendPeer;
  video: boolean;
  initiator: boolean;
  savedAt: number;
  /**
   * A short, non-reversible fingerprint of the device token this call was parked under
   * (see `accountFingerprint`); a resume under a different account is dropped. Not the
   * room roster's userId: that comes from Colyseus schema sync, which may not have
   * delivered our own player entry yet at resume time (right after onJoined), and the
   * roster is cleared on every room leave — both would make a legitimate resume look
   * like an account mismatch.
   */
  account: string;
}

/**
 * Small, non-reversible 32-bit fingerprint (FNV-1a) of the device token, used only to
 * tell "same account" from "different account" for a parked call — never meant to be
 * secret-safe or reversible, just stable and cheap.
 */
export function accountFingerprint(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const session = (): KV | null => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

export function saveCall(s: SavedCall, storage: KV | null = session()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: the call just won't survive a room change */
  }
}

/**
 * `expectAccount`, when given, must match the saved call's `account` fingerprint: a call
 * parked by one account must never be handed to whoever is signed in when the page comes
 * back (a shared device, a re-login, a stale tab). An entry with no fingerprint is treated
 * as a mismatch too. A mismatch is treated the same as a broken or expired entry: dropped
 * and cleared.
 */
export function loadCall(now = Date.now(), storage: KV | null = session(), expectAccount?: string): SavedCall | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedCall;
    if (
      !s?.peer?.id ||
      typeof s.savedAt !== 'number' ||
      now - s.savedAt > RESUME_MAX_AGE_MS ||
      (expectAccount !== undefined && s.account !== expectAccount)
    ) {
      storage?.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearCall(storage: KV | null = session()) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clampPos(p: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }, margin = 8) {
  return {
    x: Math.min(Math.max(margin, p.x), Math.max(margin, view.w - size.w - margin)),
    y: Math.min(Math.max(margin, p.y), Math.max(margin, view.h - size.h - margin)),
  };
}

type Send = (type: string, data?: unknown) => void;
let send: Send | null = null;
export function bindFriendCallSender(fn: Send | null) {
  send = fn;
}

const END_TEXT: Record<string, string> = {
  declined: 'They did not answer',
  busy: 'Your friend is busy',
  cancelled: 'Call cancelled',
  ended: 'Call ended',
  left: 'They left',
  timeout: 'No answer',
  lost: 'Call dropped',
};

/**
 * Text for fcall_invite/fcall_report failures, delivered over their own `fcall_fail`
 * channel rather than the shared `sys` one: `sys` codes like rate_limited and
 * bad_request are also sent by chat, duel and edit limits, so reacting to them here
 * would tear a call down because of something unrelated happening elsewhere.
 */
const FAIL_TEXT: Record<string, string> = {
  bad_request: 'nope',
  self: "that's you",
  not_friends: 'you can only invite friends',
  blocked_pair: 'you cannot call someone you blocked',
  friend_offline: 'they went offline',
  busy_self: 'you are already on a call',
  busy_peer: 'they are already on a call',
  rate_limited: 'slow down',
  no_invite: 'call expired',
  no_call: 'no call to report',
};

const LIVE: FriendCallPhase[] = ['connecting', 'active', 'rejoining'];

export class FriendCallManager {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private remote: MediaStream | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private pendingSdp: RTCSessionDescriptionInit | null = null;
  private acceptedHere = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private videoEls: { local: HTMLVideoElement; remote: HTMLVideoElement } | null = null;

  constructor(private storage: KV | null = session()) {}

  private get s() {
    return useFriendCall.getState();
  }

  private patch(p: Partial<FriendCallView>) {
    useFriendCall.getState().patch(p);
  }

  private busy(): boolean {
    return this.s.phase !== 'idle' || useAppStore.getState().call.phase !== 'idle';
  }

  /** once, at game start: busy hook for same-room calls, park the call on navigation */
  install() {
    setOtherCallBusy(() => this.s.phase !== 'idle');
    window.addEventListener('pagehide', () => this.park());
  }

  /** fingerprint of this device's token: synchronous and account-scoped, unlike the room roster */
  private ownAccount(): string {
    return accountFingerprint(deviceToken());
  }

  private park() {
    const s = this.s;
    if (!s.peer || !LIVE.includes(s.phase)) return;
    saveCall({ peer: s.peer, video: s.video, initiator: s.initiator, savedAt: Date.now(), account: this.ownAccount() }, this.storage);
  }

  els() {
    this.videoEls ??= (() => {
      const local = document.createElement('video');
      const remote = document.createElement('video');
      for (const el of [local, remote]) {
        el.autoplay = true;
        el.playsInline = true;
      }
      local.muted = true;
      return { local, remote };
    })();
    return this.videoEls;
  }

  // ---- user intents
  invite(peer: FriendPeer, video: boolean) {
    if (this.busy()) return useAppStore.getState().flash('you are already on a call');
    send?.('fcall_invite', { toUserId: peer.id, video });
    this.patch({ ...IDLE_FRIEND_CALL, phase: 'ringing_out', peer, video, initiator: true, ringingSince: Date.now() });
  }

  accept() {
    if (this.s.phase !== 'ringing_in') return;
    this.acceptedHere = true;
    send?.('fcall_accept');
    this.patch({ phase: 'connecting' });
  }

  decline() {
    const phase = this.s.phase;
    if (phase === 'idle') return;
    if (phase === 'ringing_in' || phase === 'ringing_out') send?.('fcall_decline', {});
    else send?.('fcall_end');
    this.teardown();
  }

  hangup() {
    this.decline();
  }

  toggleMic() {
    const on = !this.s.micOn;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.patch({ micOn: on });
  }

  toggleCam() {
    const on = !this.s.camOn;
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.patch({ camOn: on });
  }

  setCollapsed(collapsed: boolean) {
    this.patch({ collapsed });
  }

  /** the call stays up until the server's fcall_end confirms the report (it hangs up both sides) */
  report(reason: string, note?: string) {
    if (this.s.phase === 'idle') return;
    send?.('fcall_report', { reason, note });
  }

  /** every room (re)join: continue a parked or live call */
  resume() {
    const s = this.s;
    if (s.phase !== 'idle') {
      if (LIVE.includes(s.phase)) send?.('fcall_resume');
      return;
    }
    const saved = loadCall(Date.now(), this.storage, this.ownAccount());
    if (!saved) return;
    this.patch({ ...IDLE_FRIEND_CALL, phase: 'rejoining', peer: saved.peer, video: saved.video, initiator: saved.initiator });
    this.startTimer(REJOIN_GRACE_MS, 'Call dropped');
    send?.('fcall_resume');
  }

  // ---- server events
  onIncoming(m: { from: FriendPeer; video: boolean }) {
    if (this.busy()) {
      send?.('fcall_decline', { busy: true });
      return;
    }
    this.patch({ ...IDLE_FRIEND_CALL, phase: 'ringing_in', peer: m.from, video: m.video, initiator: false, ringingSince: Date.now() });
  }

  async onStart(m: { peer: string; video: boolean; initiator: boolean }) {
    const s = this.s;
    const mine =
      s.peer?.id === m.peer && ((s.phase === 'ringing_out' && m.initiator) || (s.phase === 'connecting' && this.acceptedHere && !m.initiator));
    if (!mine) {
      // answered in another tab of mine
      if (s.phase === 'ringing_in' && s.peer?.id === m.peer) this.teardown();
      return;
    }
    this.patch({ phase: 'connecting', video: m.video, initiator: m.initiator });
    this.park();
    await this.connect(m.initiator, CONNECT_TIMEOUT_MS);
  }

  async onSignal(m: { from: string; data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit } }) {
    const s = this.s;
    if (s.phase === 'idle' || s.peer?.id !== m.from || !m.data) return;
    if (m.data.sdp) {
      if (!this.pc) {
        this.pendingSdp = m.data.sdp;
        return;
      }
      await this.applySdp(m.data.sdp);
    } else if (m.data.ice) {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(m.data.ice).catch(() => {});
      else this.pendingIce.push(m.data.ice);
    }
  }

  onHold(m: { peer: string }) {
    if (this.s.peer?.id !== m.peer) return;
    this.pc?.close();
    this.pc = null;
    this.hold();
  }

  async onRejoin(m: { peer: string; video: boolean; initiator: boolean }) {
    const s = this.s;
    if (s.phase === 'idle' || s.peer?.id !== m.peer) return;
    this.patch({ phase: 'rejoining', initiator: m.initiator, video: m.video });
    const pc = this.pc;
    if (pc && pc.connectionState === 'connected') {
      // only the websocket blipped: keep the connection, restart ICE
      this.startTimer(REJOIN_GRACE_MS, 'Call dropped');
      if (m.initiator) {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        send?.('fsig', { toUserId: m.peer, data: { sdp: pc.localDescription } });
      }
      this.patch({ phase: 'active' });
      this.clearTimer();
      return;
    }
    this.pendingSdp = null;
    this.pendingIce = [];
    await this.connect(m.initiator, REJOIN_GRACE_MS);
  }

  onEnd(m: { reason: string }) {
    if (this.s.phase === 'idle') return;
    // 'elsewhere': another tab of mine took the call
    if (m.reason !== 'elsewhere') useAppStore.getState().flash(END_TEXT[m.reason] ?? 'Call ended');
    this.teardown();
  }

  /**
   * fcall_invite/fcall_report failure, on its own `fcall_fail` channel (never `sys`, whose
   * codes are shared with unrelated systems). Only an invite failure while our ring is still
   * going out tears the call down; a report failure just shows the message and the call stays up.
   */
  onFail(m: { action: 'invite' | 'report'; code: string }) {
    useAppStore.getState().flash(FAIL_TEXT[m.code] ?? 'nope');
    if (m.action === 'invite' && this.s.phase === 'ringing_out') this.teardown();
  }

  // ---- media
  private async connect(initiator: boolean, timeoutMs: number) {
    const peer = this.s.peer;
    if (!peer) return;
    this.startTimer(timeoutMs, 'Could not connect');
    if (!this.local) {
      try {
        this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.s.video ? { facingMode: 'user', width: { ideal: 640 } } : false });
      } catch {
        useAppStore.getState().flash('mic/camera blocked');
        send?.('fcall_end');
        this.teardown();
        return;
      }
      this.local.getAudioTracks().forEach((t) => (t.enabled = this.s.micOn));
      this.local.getVideoTracks().forEach((t) => (t.enabled = this.s.camOn));
    }
    const els = this.els();
    els.local.srcObject = this.local;
    this.pc?.close();
    const remote = new MediaStream();
    this.remote = remote;
    els.remote.srcObject = remote;
    const pc = new RTCPeerConnection(await loadIce());
    this.pc = pc;
    for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    pc.ontrack = (ev) => {
      if (this.pc !== pc) return;
      remote.addTrack(ev.track);
      if (ev.track.kind === 'video') this.patch({ remoteHasVideo: true });
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.pc === pc) send?.('fsig', { toUserId: peer.id, data: { ice: ev.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'connected') {
        this.clearTimer();
        this.patch({ phase: 'active' });
        this.park();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.hold();
      }
    };
    if (this.pendingSdp) {
      const sdp = this.pendingSdp;
      this.pendingSdp = null;
      await this.applySdp(sdp);
    }
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send?.('fsig', { toUserId: peer.id, data: { sdp: pc.localDescription } });
    }
  }

  private async applySdp(sdp: RTCSessionDescriptionInit) {
    const pc = this.pc;
    const peer = this.s.peer;
    if (!pc || !peer) return;
    await pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send?.('fsig', { toUserId: peer.id, data: { sdp: pc.localDescription } });
    }
    for (const c of this.pendingIce) await pc.addIceCandidate(c).catch(() => {});
    this.pendingIce = [];
  }

  private hold() {
    if (!LIVE.includes(this.s.phase)) return;
    this.patch({ phase: 'rejoining' });
    if (!this.timer) this.startTimer(REJOIN_GRACE_MS, 'Call dropped');
  }

  private startTimer(ms: number, text: string) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      const phase = this.s.phase;
      if (phase === 'connecting' || phase === 'rejoining') {
        useAppStore.getState().flash(text);
        send?.('fcall_end');
        this.teardown();
      }
    }, ms);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  teardown() {
    this.clearTimer();
    this.pc?.close();
    this.pc = null;
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.remote = null;
    if (this.videoEls) {
      this.videoEls.local.srcObject = null;
      this.videoEls.remote.srcObject = null;
    }
    this.pendingIce = [];
    this.pendingSdp = null;
    this.acceptedHere = false;
    clearCall(this.storage);
    useFriendCall.getState().reset();
  }
}

export const friendCall = new FriendCallManager();

/** Server message handlers; registered in Net.join() after the friends handlers. */
export const onFriendCallIncoming = (m: { from: FriendPeer; video: boolean }) => friendCall.onIncoming(m);
export const onFriendCallStart = (m: { peer: string; video: boolean; initiator: boolean }) => void friendCall.onStart(m);
export const onFriendCallEnd = (m: { reason: string }) => friendCall.onEnd(m);
export const onFriendCallHold = (m: { peer: string }) => friendCall.onHold(m);
export const onFriendCallRejoin = (m: { peer: string; video: boolean; initiator: boolean }) => void friendCall.onRejoin(m);
export const onFriendSignal = (m: { from: string; data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit } }) => void friendCall.onSignal(m);
export const onFriendCallFail = (m: { action: 'invite' | 'report'; code: string }) => friendCall.onFail(m);
