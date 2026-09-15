/**
 * Room reveal: pure timing and ordering, no Pixi or DOM, so it is unit tested.
 *
 * A room is "ready" once the join resolved AND the first full state sync landed
 * (the initial furniture batch is in). Then the renderer gets a couple of frames
 * to upload the freshly baked furniture textures before the blur melts away.
 * A safety timeout reveals regardless.
 */

/** blur melt and overlay fade */
export const REVEAL_MELT_MS = 520;
/** reduced motion: a quick crossfade instead */
export const REVEAL_FADE_MS = 200;
/** one furniture piece pops in over this long */
export const PIECE_MS = 180;
/** gap between pieces before the cap squeezes it */
export const PIECE_STEP_MS = 45;
/** the last piece starts no later than this */
export const STAGGER_CAP_MS = 500;
/** avatars fade in over this long */
export const AVATAR_FADE_MS = 320;
/** always reveal after this, whatever is still loading */
export const REVEAL_TIMEOUT_MS = 4000;
/** pieces start this small */
export const PIECE_SCALE_FROM = 0.9;

export type RevealPhase = 'loading' | 'revealing' | 'shown';

/** Start delay of piece i of n: evenly spaced, the whole stagger capped at STAGGER_CAP_MS. */
export function staggerDelay(i: number, n: number, step = PIECE_STEP_MS, cap = STAGGER_CAP_MS): number {
  if (n <= 1 || i <= 0) return 0;
  const gap = Math.min(step, cap / (n - 1));
  return Math.min(cap, i * gap);
}

/** How long the whole furniture stagger runs for n pieces. */
export function staggerTotal(n: number, pieceMs = PIECE_MS): number {
  return n ? staggerDelay(n - 1, n) + pieceMs : 0;
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Eased 0..1 progress of a piece that starts at `delay` and lasts `dur`. */
export function pieceProgress(elapsed: number, delay: number, dur = PIECE_MS): number {
  if (elapsed <= delay) return 0;
  if (dur <= 0 || elapsed >= delay + dur) return 1;
  return easeOutCubic((elapsed - delay) / dur);
}

/** Scale of a piece at progress p (its alpha is p itself); reduced motion keeps the scale at 1. */
export function pieceScale(p: number, reduced: boolean): number {
  return reduced ? 1 : PIECE_SCALE_FROM + (1 - PIECE_SCALE_FROM) * p;
}

/**
 * Pieces in reveal order: bottom to top by iso depth (the far corner first, the
 * front last), ties broken by id so every client animates the same way.
 */
export function revealOrder<T extends { id: string; depth: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Ready gate for one load: flips to `revealing` once joined and synced (or the
 * timeout passes), and to `shown` when the reveal animation has run its course.
 */
export class RevealGate {
  phase: RevealPhase = 'shown';
  private joined = false;
  private synced = false;
  private startedAt = 0;
  private revealAt = 0;
  private revealMs = 0;

  /** a new room is loading (first mount, reconnect) */
  begin(now: number) {
    this.phase = 'loading';
    this.joined = false;
    this.synced = false;
    this.startedAt = now;
  }

  markJoined() {
    this.joined = true;
  }

  markSynced() {
    this.synced = true;
  }

  /** true when the loading room may be revealed now */
  ready(now: number): boolean {
    if (this.phase !== 'loading') return false;
    return (this.joined && this.synced) || now - this.startedAt >= REVEAL_TIMEOUT_MS;
  }

  /** the reveal animation starts; it lasts `durationMs` */
  start(now: number, durationMs: number) {
    this.phase = 'revealing';
    this.revealAt = now;
    this.revealMs = durationMs;
  }

  /** ms since the reveal started */
  elapsed(now: number): number {
    return this.phase === 'loading' ? 0 : now - this.revealAt;
  }

  /** @returns true when this call finished the reveal */
  settle(now: number): boolean {
    if (this.phase !== 'revealing' || now - this.revealAt < this.revealMs) return false;
    this.phase = 'shown';
    return true;
  }

  /** movement is ignored only while loading */
  get inputOpen(): boolean {
    return this.phase !== 'loading';
  }
}
