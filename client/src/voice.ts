import { tileDistance, voiceGain, voiceInitiator, wantsVoiceLink } from '@dovey/shared';
import { ICE, unlockAudio } from './call';
import { useAppStore } from './store';

/**
 * Proximity voice: an open mic heard by people standing nearby, louder the
 * closer they are. One small P2P audio link per nearby pair; the room only
 * relays signaling. Every link carries a sendrecv audio transceiver from the
 * start, so turning a mic on or off swaps the track without renegotiating.
 */
export interface VoicePeer {
  id: string;
  x: number;
  y: number;
  voice: boolean;
}

export interface VoiceSignal {
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
  bye?: boolean;
}

interface Link {
  pc: RTCPeerConnection;
  sender: RTCRtpSender | null;
  /** Chrome only feeds WebAudio from a remote stream that is also attached to a media element */
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode | null;
  gain: GainNode | null;
  meter: AnalyserNode | null;
  pendingIce: RTCIceCandidateInit[];
}

/** don't re-offer to someone for this long after a link closed */
const REOPEN_MS = 3000;
const SPEAK_RMS = 0.04;

export class ProximityVoice {
  private links = new Map<string, Link>();
  private closedAt = new Map<string, number>();
  private mic: MediaStream | null = null;
  private localMeter: { src: MediaStreamAudioSourceNode; an: AnalyserNode } | null = null;
  /** on a 1:1 call: send nothing and play nothing here */
  private busy = false;
  private buf = new Uint8Array(256);
  /** session ids audibly talking right now (me included); refreshed by update() */
  readonly speaking = new Set<string>();

  constructor(
    private signal: (to: string, data: VoiceSignal) => void,
    private announce: (on: boolean) => void,
  ) {}

  get micOn() {
    return !!this.mic;
  }

  async setMic(on: boolean) {
    const st = useAppStore.getState();
    if (on === this.micOn) return;
    if (!on) {
      this.stopMic();
      this.announce(false);
      st.setVoiceMic(false);
      return;
    }
    const ctx = unlockAudio();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      console.error('[voice] mic denied', e);
      st.flash('mic blocked');
      return;
    }
    if (this.mic) {
      // a second tap raced the permission prompt
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.mic = stream;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    this.localMeter = { src, an };
    this.applyTrack();
    this.announce(true);
    st.setVoiceMic(true);
  }

  /** After a reconnect the new session starts with voice off and no links. */
  rejoin() {
    this.closeAll();
    if (this.mic) this.announce(true);
  }

  /** Run a few times a second with everyone's current tile position. */
  update(me: string | null, self: { x: number; y: number } | null, peers: VoicePeer[]) {
    const st = useAppStore.getState();
    const busy = st.call.phase !== 'idle';
    if (busy !== this.busy) {
      this.busy = busy;
      this.applyTrack();
    }
    this.speaking.clear();
    if (!me || !self) return this.closeAll();
    if (this.localMeter && !busy && this.loud(this.localMeter.an)) this.speaking.add(me);

    const now = performance.now();
    const present = new Set<string>();
    for (const p of peers) {
      if (p.id === me || p.id.startsWith('bot:')) continue;
      present.add(p.id);
      const d = tileDistance(self.x, self.y, p.x, p.y);
      const link = this.links.get(p.id);
      const want = !st.blocked.includes(p.id) && wantsVoiceLink(d, this.micOn || p.voice, !!link);
      if (!want) {
        if (link) this.close(p.id, true);
        continue;
      }
      if (!link) {
        const recentlyClosed = now - (this.closedAt.get(p.id) ?? -Infinity) < REOPEN_MS;
        if (voiceInitiator(me, p.id) && !recentlyClosed) void this.open(p.id);
        continue;
      }
      const g = busy || st.muted.includes(p.id) ? 0 : voiceGain(d);
      link.gain?.gain.setTargetAtTime(g, link.gain.context.currentTime, 0.15);
      if (g > 0 && p.voice && link.meter && this.loud(link.meter)) this.speaking.add(p.id);
    }
    for (const id of [...this.links.keys()]) if (!present.has(id)) this.close(id, false);
    for (const id of [...this.closedAt.keys()]) if (!present.has(id)) this.closedAt.delete(id);
  }

  async onSignal(from: string, data: VoiceSignal) {
    if (data.bye) {
      this.close(from, false);
      return;
    }
    if (data.sdp?.type === 'offer') return this.answer(from, data.sdp);
    const link = this.links.get(from);
    if (!link) return;
    try {
      if (data.sdp?.type === 'answer') {
        await link.pc.setRemoteDescription(data.sdp);
        await this.flushIce(link);
      } else if (data.ice) {
        if (link.pc.remoteDescription) await link.pc.addIceCandidate(data.ice);
        else link.pendingIce.push(data.ice);
      }
    } catch (e) {
      console.error('[voice] signal failed', e);
      this.close(from, true);
    }
  }

  /** The room says this pair can no longer hear each other (a block). */
  drop(id: string) {
    this.close(id, false);
  }

  closeAll() {
    for (const id of [...this.links.keys()]) this.close(id, false);
    this.speaking.clear();
  }

  teardown() {
    this.closeAll();
    this.stopMic();
    this.closedAt.clear();
    useAppStore.getState().setVoiceMic(false);
  }

  private async open(id: string) {
    const link = this.createLink(id);
    const tr = link.pc.addTransceiver('audio', { direction: 'sendrecv' });
    link.sender = tr.sender;
    try {
      await tr.sender.replaceTrack(this.track());
      const offer = await link.pc.createOffer();
      if (this.links.get(id) !== link) return;
      await link.pc.setLocalDescription(offer);
      this.signal(id, { sdp: link.pc.localDescription!.toJSON() });
    } catch (e) {
      console.error('[voice] offer failed', e);
      this.close(id, true);
    }
  }

  private async answer(from: string, sdp: RTCSessionDescriptionInit) {
    if (useAppStore.getState().blocked.includes(from)) return this.signal(from, { bye: true });
    // a fresh offer replaces any half-open link
    this.close(from, false);
    const link = this.createLink(from);
    try {
      await link.pc.setRemoteDescription(sdp);
      const tr = link.pc.getTransceivers()[0];
      if (tr) {
        tr.direction = 'sendrecv';
        link.sender = tr.sender;
        await tr.sender.replaceTrack(this.track());
      }
      const answer = await link.pc.createAnswer();
      if (this.links.get(from) !== link) return;
      await link.pc.setLocalDescription(answer);
      this.signal(from, { sdp: link.pc.localDescription!.toJSON() });
      await this.flushIce(link);
    } catch (e) {
      console.error('[voice] answer failed', e);
      this.close(from, true);
    }
  }

  private createLink(id: string): Link {
    const pc = new RTCPeerConnection(ICE);
    const el = new Audio();
    el.autoplay = true;
    el.muted = true;
    const link: Link = { pc, sender: null, el, src: null, gain: null, meter: null, pendingIce: [] };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.signal(id, { ice: ev.candidate.toJSON() });
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      el.srcObject = stream;
      void el.play().catch(() => {});
      const ctx = unlockAudio();
      link.src?.disconnect();
      link.src = ctx.createMediaStreamSource(stream);
      if (!link.gain) {
        link.gain = ctx.createGain();
        link.gain.gain.value = 0;
        link.gain.connect(ctx.destination);
        link.meter = ctx.createAnalyser();
        link.meter.fftSize = 256;
      }
      link.src.connect(link.gain);
      link.src.connect(link.meter!);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && this.links.get(id) === link) this.close(id, true);
    };
    this.links.set(id, link);
    return link;
  }

  private async flushIce(link: Link) {
    const ice = link.pendingIce;
    link.pendingIce = [];
    for (const c of ice) await link.pc.addIceCandidate(c).catch(() => {});
  }

  private close(id: string, notify: boolean) {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    this.closedAt.set(id, performance.now());
    if (notify) this.signal(id, { bye: true });
    link.pc.close();
    link.src?.disconnect();
    link.gain?.disconnect();
    link.el.srcObject = null;
  }

  private track(): MediaStreamTrack | null {
    return this.busy ? null : (this.mic?.getAudioTracks()[0] ?? null);
  }

  private applyTrack() {
    const t = this.track();
    for (const l of this.links.values()) void l.sender?.replaceTrack(t).catch(() => {});
  }

  private stopMic() {
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.localMeter?.src.disconnect();
    this.localMeter = null;
    this.applyTrack();
  }

  private loud(an: AnalyserNode): boolean {
    an.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const d = (this.buf[i] - 128) / 128;
      sum += d * d;
    }
    return Math.sqrt(sum / this.buf.length) > SPEAK_RMS;
  }
}
