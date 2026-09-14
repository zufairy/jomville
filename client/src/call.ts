import { useAppStore } from './store';

/**
 * Peer-to-peer WebRTC call between two players in the same room. Signaling
 * goes through the Colyseus room; the server only relays after both accepted.
 * Media is requested only once the call is accepted on both sides.
 */
export type CallPhase = 'idle' | 'ringing_out' | 'ringing_in' | 'connecting' | 'active';

export interface CallInfo {
  phase: CallPhase;
  peer: string; // sessionId
  handle: string;
  video: boolean;
  micOn: boolean;
  camOn: boolean;
  remoteHasVideo: boolean;
}

export const IDLE_CALL: CallInfo = { phase: 'idle', peer: '', handle: '', video: false, micOn: true, camOn: true, remoteHasVideo: false };

export interface Signaler {
  invite: (to: string, video: boolean) => void;
  accept: () => void;
  decline: () => void;
  end: () => void;
  rtc: (to: string, data: unknown) => void;
}

let audio: AudioContext | null = null;

/**
 * One AudioContext for the page. Call it from a tap (Love Meter "join"):
 * Chrome keeps contexts created without a user gesture suspended, and a
 * suspended analyser only ever reads silence.
 */
export function unlockAudio(): AudioContext {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume().catch(() => {});
  return audio;
}

export const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

/**
 * SAFETY TODO (Phase 2 age gate): calls must be disabled by default for under-18
 * accounts and only enabled between mutual follows. Wire the gate in `invite()`
 * and in the server's call_invite handler once age_bracket exists.
 */
export class CallManager {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private remote = new MediaStream();
  private pendingIce: RTCIceCandidateInit[] = [];
  private pendingSdp: RTCSessionDescriptionInit | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  readonly localEl = document.createElement('video');
  readonly remoteEl = document.createElement('video');
  /** Love Meter: cumulative voice-activity counts, pushed every 2s while connected */
  onVibe: ((v: { aTalk: number; bTalk: number; both: number; turns: number; n: number }) => void) | null = null;
  private vad: { nodes: AudioNode[]; timer: ReturnType<typeof setInterval> } | null = null;

  constructor(private sig: Signaler) {
    for (const el of [this.localEl, this.remoteEl]) {
      el.autoplay = true;
      el.playsInline = true;
    }
    this.localEl.muted = true;
    this.remoteEl.srcObject = this.remote;
  }

  private set(patch: Partial<CallInfo>) {
    const st = useAppStore.getState();
    st.setCall({ ...st.call, ...patch });
  }

  // ---- user intents
  invite(peer: string, handle: string, video: boolean) {
    if (useAppStore.getState().call.phase !== 'idle') return;
    this.sig.invite(peer, video);
    this.set({ phase: 'ringing_out', peer, handle, video, remoteHasVideo: false });
  }

  accept() {
    if (useAppStore.getState().call.phase !== 'ringing_in') return;
    this.sig.accept();
    this.set({ phase: 'connecting' });
  }

  decline() {
    const c = useAppStore.getState().call;
    if (c.phase === 'idle') return;
    if (c.phase === 'ringing_in') this.sig.decline();
    else this.sig.end();
    this.teardown();
  }

  hangup() {
    this.decline();
  }

  toggleMic() {
    const c = useAppStore.getState().call;
    const on = !c.micOn;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.set({ micOn: on });
  }

  toggleCam() {
    const c = useAppStore.getState().call;
    const on = !c.camOn;
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.set({ camOn: on });
  }

  // ---- signaling events
  onIncoming(from: string, handle: string, video: boolean) {
    if (useAppStore.getState().call.phase !== 'idle') {
      this.sig.decline();
      return;
    }
    this.set({ phase: 'ringing_in', peer: from, handle, video, remoteHasVideo: false });
  }

  async onStart(peer: string, video: boolean, initiator: boolean) {
    if (import.meta.env.DEV) console.debug('[call] start', { peer, video, initiator });
    this.set({ phase: 'connecting', peer, video });
    // give up if media permission or ICE never completes
    this.connectTimer = setTimeout(() => {
      if (useAppStore.getState().call.phase === 'connecting') {
        useAppStore.getState().flash('could not connect');
        this.sig.end();
        this.teardown();
      }
    }, 30_000);
    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user', width: { ideal: 640 } } : false });
    } catch (e) {
      console.error('[call] media denied', e);
      useAppStore.getState().flash('mic/camera blocked');
      this.sig.end();
      this.teardown();
      return;
    }
    this.localEl.srcObject = this.local;
    const pc = new RTCPeerConnection(ICE);
    this.pc = pc;
    for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    pc.ontrack = (ev) => {
      this.remote.addTrack(ev.track);
      if (ev.track.kind === 'video') this.set({ remoteHasVideo: true });
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.sig.rtc(peer, { ice: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (import.meta.env.DEV) console.debug('[call] state', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.set({ phase: 'active' });
        this.startVad();
      }
      if (pc.connectionState === 'failed') {
        useAppStore.getState().flash('call dropped');
        this.sig.end();
        this.teardown();
      }
    };
    // an offer may have arrived while we were still waiting on getUserMedia
    if (this.pendingSdp) {
      const sdp = this.pendingSdp;
      this.pendingSdp = null;
      await this.applySdp(peer, sdp);
    }
    for (const c of this.pendingIce) await pc.addIceCandidate(c).catch(() => {});
    this.pendingIce = [];
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sig.rtc(peer, { sdp: pc.localDescription });
    }
  }

  async onRtc(from: string, data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }) {
    const c = useAppStore.getState().call;
    if (from !== c.peer) return;
    if (data.sdp) {
      if (!this.pc) {
        this.pendingSdp = data.sdp;
        return;
      }
      await this.applySdp(from, data.sdp);
    } else if (data.ice) {
      if (this.pc && this.pc.remoteDescription) await this.pc.addIceCandidate(data.ice).catch(() => {});
      else this.pendingIce.push(data.ice);
    }
  }

  private async applySdp(from: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.pc;
    if (!pc) return;
    await pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sig.rtc(from, { sdp: pc.localDescription });
    }
    for (const c of this.pendingIce) await pc.addIceCandidate(c).catch(() => {});
    this.pendingIce = [];
  }

  onEnd(reason: string) {
    const msgs: Record<string, string> = {
      declined: 'they said no',
      no_answer: 'no answer',
      expired: 'missed call',
      left: 'they left',
      ended: 'call ended',
      love_done: "💘 time's up! watch the meter",
      love_left: 'they left the booth — back to the front of the line',
    };
    if (useAppStore.getState().call.phase !== 'idle') useAppStore.getState().flash(msgs[reason] ?? 'call ended');
    this.teardown();
  }

  /**
   * Voice-activity detection, 4 samples/s: RMS of a 256-sample window per
   * stream. Counts who talks, overlaps and speaker switches — no media leaves
   * the device, no video processing. Feeds the Love Meter score.
   */
  private startVad() {
    if (this.vad || !this.local || !this.onVibe) return;
    const ctx = unlockAudio();
    const nodes: AudioNode[] = [];
    const meter = (s: MediaStream) => {
      if (!s.getAudioTracks().length) return null;
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      const src = ctx.createMediaStreamSource(s);
      src.connect(an);
      nodes.push(src, an);
      return an;
    };
    const mine = meter(this.local);
    const theirs = meter(this.remote);
    const buf = new Uint8Array(256);
    const loud = (an: AnalyserNode | null) => {
      if (!an) return false;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const d = (buf[i] - 128) / 128;
        sum += d * d;
      }
      return Math.sqrt(sum / buf.length) > 0.04;
    };
    const v = { aTalk: 0, bTalk: 0, both: 0, turns: 0, n: 0 };
    let last = -1;
    const timer = setInterval(() => {
      const a = loud(mine) && useAppStore.getState().call.micOn;
      const b = loud(theirs);
      v.n++;
      if (a) v.aTalk++;
      if (b) v.bTalk++;
      if (a && b) v.both++;
      const who = a && !b ? 0 : b && !a ? 1 : -1;
      if (who >= 0) {
        if (last >= 0 && last !== who) v.turns++;
        last = who;
      }
      if (v.n % 8 === 0) this.onVibe?.({ ...v });
    }, 250);
    this.vad = { nodes, timer };
  }

  private stopVad() {
    if (!this.vad) return;
    clearInterval(this.vad.timer);
    for (const n of this.vad.nodes) n.disconnect();
    this.vad = null;
  }

  teardown() {
    this.stopVad();
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    this.pc?.close();
    this.pc = null;
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.remote.getTracks().forEach((t) => this.remote.removeTrack(t));
    this.remote = new MediaStream();
    this.remoteEl.srcObject = this.remote;
    this.localEl.srcObject = null;
    this.pendingIce = [];
    this.pendingSdp = null;
    useAppStore.getState().setCall(IDLE_CALL);
  }
}
