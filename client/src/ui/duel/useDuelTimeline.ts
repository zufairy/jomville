import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DUEL_PICK_MS } from '@dovey/shared';

/**
 * The reveal choreography as a pure function of elapsed time, so it can be
 * tested with a fake clock and resumes correctly when a hidden tab wakes up.
 *
 *   0-600    count    ROCK (0) PAPER (200) SCISSORS (400), fists pump
 *   600-850  shoot    SHOOT! hands slam to the centre
 *   850-1050 clash    flash, sparks, shake
 *   1050-1650 resolve winner pushes through / loser cracks, or DRAW stamp
 *   1650-1800 settle  hold
 */
export const REVEAL_MS = 1800;
export type RevealPhase = 'count' | 'shoot' | 'clash' | 'resolve' | 'settle' | 'done';
export const COUNT_WORDS = ['ROCK', 'PAPER', 'SCISSORS'] as const;
export type RevealCue = 'tick0' | 'tick1' | 'tick2' | 'shoot' | 'clash' | 'result' | 'done';

const PHASES: ReadonlyArray<{ phase: Exclude<RevealPhase, 'done'>; from: number; to: number }> = [
  { phase: 'count', from: 0, to: 600 },
  { phase: 'shoot', from: 600, to: 850 },
  { phase: 'clash', from: 850, to: 1050 },
  { phase: 'resolve', from: 1050, to: 1650 },
  { phase: 'settle', from: 1650, to: 1800 },
];

export const REVEAL_CUES: ReadonlyArray<{ at: number; cue: RevealCue }> = [
  { at: 0, cue: 'tick0' },
  { at: 200, cue: 'tick1' },
  { at: 400, cue: 'tick2' },
  { at: 600, cue: 'shoot' },
  { at: 850, cue: 'clash' },
  { at: 1050, cue: 'result' },
  { at: 1800, cue: 'done' },
];

export interface RevealFrame {
  phase: RevealPhase;
  /** 0..1 through the current phase */
  progress: number;
  /** which count word shows during 'count' */
  beat: 0 | 1 | 2 | null;
}

export const IDLE_FRAME: RevealFrame = { phase: 'done', progress: 1, beat: null };

export function revealFrame(elapsedMs: number): RevealFrame {
  const t = Math.max(0, elapsedMs);
  if (t >= REVEAL_MS) return { phase: 'done', progress: 1, beat: null };
  const p = PHASES.find((x) => t < x.to)!;
  const progress = (t - p.from) / (p.to - p.from);
  const beat = p.phase === 'count' ? (Math.min(2, Math.floor(t / 200)) as 0 | 1 | 2) : null;
  return { phase: p.phase, progress, beat };
}

/** Cues whose time falls in (prevMs, nowMs]. Start with prev = -1 to include the cue at 0. */
export function cuesBetween(prevMs: number, nowMs: number): RevealCue[] {
  return REVEAL_CUES.filter((c) => c.at > prevMs && c.at <= nowMs).map((c) => c.cue);
}

export interface RevealHandlers {
  onCue?: (cue: Exclude<RevealCue, 'done'>) => void;
  onDone?: () => void;
}

/** Feeds elapsed time in, fires every crossed cue exactly once, and finishes once. */
export class RevealRunner {
  private prev = -1;
  private finished = false;
  constructor(private on: RevealHandlers) {}

  advance(elapsedMs: number): RevealFrame {
    for (const cue of cuesBetween(this.prev, elapsedMs)) {
      if (cue !== 'done') this.on.onCue?.(cue);
      else if (!this.finished) {
        this.finished = true;
        this.on.onDone?.();
      }
    }
    this.prev = Math.max(this.prev, elapsedMs);
    return revealFrame(elapsedMs);
  }

  get done(): boolean {
    return this.finished;
  }
}

export interface RevealClock {
  now: () => number;
  raf: (cb: () => void) => number;
  caf: (id: number) => void;
}

/**
 * Runs a reveal on animation frames, with a timer fallback: a background tab gets
 * no frames, and without the fallback duelRevealDone would never fire and the
 * server's pick sweep would eat the next round. Returns a stop function.
 */
export function driveReveal(on: RevealHandlers, onFrame: (f: RevealFrame) => void, clock: RevealClock): () => void {
  const runner = new RevealRunner(on);
  const start = clock.now();
  let id = 0;
  let stopped = false;
  const fallback = setTimeout(() => {
    if (stopped || runner.done) return;
    clock.caf(id);
    onFrame(runner.advance(Math.max(REVEAL_MS, clock.now() - start)));
  }, REVEAL_MS + 100);
  const tick = () => {
    if (stopped) return;
    onFrame(runner.advance(clock.now() - start));
    if (!runner.done) id = clock.raf(tick);
    else clearTimeout(fallback);
  };
  tick();
  return () => {
    stopped = true;
    clock.caf(id);
    clearTimeout(fallback);
  };
}

export const COUNT_UP_MS = 1200;

/** Result-screen coin counter: ease-out cubic from 0 to total over `ms`. */
export function countUp(elapsedMs: number, total: number, ms = COUNT_UP_MS): number {
  if (total <= 0) return 0;
  const k = Math.min(1, Math.max(0, elapsedMs / ms));
  return Math.round(total * (1 - Math.pow(1 - k, 3)));
}

/** The server's pick clock restarts when a round resolves, so rounds after the first lose the reveal. */
export function pickRingMs(round: number): number {
  return round <= 1 ? DUEL_PICK_MS : DUEL_PICK_MS - REVEAL_MS;
}

/**
 * Plays the reveal for `runKey` (null = nothing on show) on requestAnimationFrame.
 * Re-renders only when the phase or count beat changes; handlers always see the latest props.
 */
export function useDuelTimeline(runKey: string | null, on: RevealHandlers & { now?: () => number } = {}): RevealFrame {
  const [frame, setFrame] = useState<RevealFrame>(IDLE_FRAME);
  const latest = useRef(on);
  latest.current = on;
  useLayoutEffect(() => {
    if (runKey === null) {
      setFrame(IDLE_FRAME);
      return;
    }
    return driveReveal(
      { onCue: (c) => latest.current.onCue?.(c), onDone: () => latest.current.onDone?.() },
      (f) => setFrame((prev) => (prev.phase === f.phase && prev.beat === f.beat ? prev : f)),
      { now: latest.current.now ?? (() => performance.now()), raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id) },
    );
  }, [runKey]);
  return frame;
}

/** Counts 0 → total over COUNT_UP_MS for `runKey`; calls onStep whenever the shown number changes. */
export function useCountUp(runKey: string | null, total: number, onStep?: (value: number) => void): number {
  const [value, setValue] = useState(0);
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => {
    if (runKey === null) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let id = 0;
    let last = -1;
    const tick = () => {
      const v = countUp(performance.now() - start, total);
      if (v !== last) {
        last = v;
        setValue(v);
        step.current?.(v);
      }
      if (v < total) id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [runKey, total]);
  return value;
}
