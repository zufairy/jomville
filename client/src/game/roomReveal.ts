import type { Container } from 'pixi.js';
import { mountRoomReveal, setRevealView } from '../ui/RoomReveal';
import {
  AVATAR_FADE_MS,
  PIECE_MS,
  REVEAL_FADE_MS,
  REVEAL_MELT_MS,
  RevealGate,
  easeOutCubic,
  pieceProgress,
  pieceScale,
  revealOrder,
  staggerDelay,
  staggerTotal,
} from './reveal';

/** rendered frames to wait once ready, so freshly baked furniture textures reach the GPU under the frost */
const SETTLE_FRAMES = 2;

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Blur-to-sharp room reveal. While a room loads the frosted overlay covers the
 * canvas and taps are ignored; once the join and the first full state sync are
 * in (or 4 s pass) the blur melts away, the initial furniture pops in back to
 * front and avatars fade in. Anything added after the reveal starts is left
 * alone. Only the world game uses this; kitchen rounds never touch it.
 */
export class RoomReveal {
  private gate = new RevealGate();
  private reduced = false;
  private readyFrames = 0;
  /** furniture and avatars that arrived while loading */
  private loadingPieces: Container[] = [];
  private loadingAvatars: Container[] = [];
  /** the running stagger: pieces in order with their start delays */
  private pieces: Container[] = [];
  private delays: number[] = [];
  private avatars: Container[] = [];
  private pieceMs = PIECE_MS;
  private avatarMs = AVATAR_FADE_MS;
  private unmount: (() => void) | null = null;
  /** fires once per reveal, as the blur starts melting (enter-room chime) */
  onStart: (() => void) | null = null;

  attach(host: HTMLElement) {
    if (this.unmount) return;
    this.unmount = mountRoomReveal(host);
    window.addEventListener('beforeunload', this.onLeaving);
    window.addEventListener('pageshow', this.onPageShow);
  }

  /** a room starts loading: first mount or a rejoin after a drop */
  begin() {
    this.finish();
    this.loadingPieces.length = 0;
    this.loadingAvatars.length = 0;
    this.readyFrames = 0;
    this.reduced = prefersReducedMotion();
    this.gate.begin(performance.now());
    setRevealView({ phase: 'loading', reduced: this.reduced });
  }

  joined() {
    this.gate.markJoined();
  }

  /** the first full state (with the room's furniture) has been applied */
  synced() {
    this.gate.markSynced();
  }

  addFurniture(c: Container) {
    // stays visible under the frost; hidden and staggered in when the reveal starts
    if (this.gate.phase === 'loading') this.loadingPieces.push(c);
  }

  addAvatar(c: Container) {
    if (this.gate.phase !== 'loading') return;
    c.alpha = 0;
    this.loadingAvatars.push(c);
  }

  /** movement and taps wait until the reveal starts */
  get inputOpen(): boolean {
    return this.gate.inputOpen;
  }

  /** once per rendered frame */
  tick(now: number) {
    const g = this.gate;
    if (g.phase === 'shown') return;
    if (g.phase === 'loading') {
      if (!g.ready(now)) {
        this.readyFrames = 0;
        return;
      }
      if (++this.readyFrames > SETTLE_FRAMES) this.start(now);
      return;
    }
    const t = g.elapsed(now);
    const reduced = this.reduced;
    for (let i = 0; i < this.pieces.length; i++) {
      const c = this.pieces[i];
      if (c.destroyed) continue;
      const p = pieceProgress(t, this.delays[i], this.pieceMs);
      c.alpha = p;
      c.scale.set(pieceScale(p, reduced));
    }
    const a = t >= this.avatarMs ? 1 : easeOutCubic(t / this.avatarMs);
    for (let i = 0; i < this.avatars.length; i++) if (!this.avatars[i].destroyed) this.avatars[i].alpha = a;
    if (g.settle(now)) {
      this.finish();
      setRevealView({ phase: 'shown' });
    }
  }

  private start(now: number) {
    const reduced = this.reduced;
    const live = this.loadingPieces.filter((c) => !c.destroyed);
    const ordered = revealOrder(live.map((c, i) => ({ id: String(i).padStart(5, '0'), depth: c.zIndex, c })));
    const n = ordered.length;
    this.pieces = ordered.map((o) => o.c);
    this.delays = ordered.map((_, i) => (reduced ? 0 : staggerDelay(i, n)));
    this.pieceMs = reduced ? REVEAL_FADE_MS : PIECE_MS;
    this.avatarMs = reduced ? REVEAL_FADE_MS : AVATAR_FADE_MS;
    for (const c of this.pieces) {
      c.alpha = 0;
      if (!reduced) c.scale.set(pieceScale(0, false));
    }
    this.avatars = this.loadingAvatars.filter((c) => !c.destroyed);
    this.loadingPieces.length = 0;
    this.loadingAvatars.length = 0;
    const duration = reduced ? REVEAL_FADE_MS : Math.max(REVEAL_MELT_MS, staggerTotal(n), AVATAR_FADE_MS);
    this.gate.start(now, duration);
    setRevealView({ phase: 'revealing', reduced });
    this.onStart?.();
  }

  /** snap whatever is mid-animation to its final look */
  private finish() {
    for (const c of this.pieces) {
      if (c.destroyed) continue;
      c.alpha = 1;
      c.scale.set(1);
    }
    for (const c of this.avatars) if (!c.destroyed) c.alpha = 1;
    this.pieces = [];
    this.delays = [];
    this.avatars = [];
  }

  /** navigating to another room (map, browser, goToRoom): frost the old room at once */
  private onLeaving = () => {
    setRevealView({ phase: 'loading', reduced: prefersReducedMotion() }, true);
  };

  /** back from the bfcache: the rejoin calls begin(); before that, show the real phase again */
  private onPageShow = () => {
    if (this.gate.phase === 'shown') setRevealView({ phase: 'shown' });
  };

  dispose() {
    window.removeEventListener('beforeunload', this.onLeaving);
    window.removeEventListener('pageshow', this.onPageShow);
    this.finish();
    this.unmount?.();
    this.unmount = null;
  }
}
