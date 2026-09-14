import {
  LOVE_CALL_MS,
  LOVE_LANES,
  LOVE_READY_MS,
  LOVE_REVEAL_MS,
  LoveSide,
  LoveVibe,
  loveScore,
  mergeVibes,
  pairSeed,
} from '@dovey/shared';

/**
 * Love Meter queue + match state machine. Pure; the room applies the events
 * (moving avatars, starting/ending the call, broadcasting).
 *
 *   idle --(both lanes have a free head)--> ready --5s--> call --30s--> reveal --8s--> idle
 *
 * Joining a lane is the consent to be matched and put on a video call; either
 * person can leave (walk away, tap leave, hang up) at any point.
 */
export type LovePhase = 'ready' | 'call' | 'reveal';

export interface LovePair {
  a: string; // blue lane sessionId
  b: string; // pink lane sessionId
  seed: number;
  phase: LovePhase;
  until: number;
  score: number | null;
  vibes: Map<string, LoveVibe>;
}

export type LoveEvent =
  | { kind: 'match'; a: string; b: string }
  | { kind: 'call'; a: string; b: string }
  | { kind: 'reveal'; a: string; b: string; score: number }
  | { kind: 'done'; a: string; b: string }
  | { kind: 'abort'; a: string; b: string; left: string };

export class LoveMeter {
  readonly lanes: [string[], string[]] = [[], []];
  pair: LovePair | null = null;
  /** userId per session, for a stable per-couple seed */
  private users = new Map<string, string>();

  sideOf(id: string): LoveSide | null {
    if (this.lanes[0].includes(id)) return 0;
    if (this.lanes[1].includes(id)) return 1;
    return null;
  }

  inPair(id: string): boolean {
    return !!this.pair && (this.pair.a === id || this.pair.b === id);
  }

  join(id: string, userId: string, side: LoveSide): string | null {
    if (side !== 0 && side !== 1) return 'bad_request';
    if (this.inPair(id)) return 'love_busy';
    if (this.sideOf(id) === side) return null;
    if (this.sideOf(id) !== null) this.leave(id);
    if (this.lanes[side].length >= LOVE_LANES[side].len) return 'love_full';
    this.users.set(id, userId);
    this.lanes[side].push(id);
    return null;
  }

  /** Leave the lane, or bail out of a running match. Returns an abort event if a match broke. */
  leave(id: string): LoveEvent | null {
    for (const lane of this.lanes) {
      const i = lane.indexOf(id);
      if (i >= 0) lane.splice(i, 1);
    }
    const p = this.pair;
    if (!p || (p.a !== id && p.b !== id)) return null;
    if (p.phase === 'reveal') return null; // score is out, nothing to break
    this.pair = null;
    return { kind: 'abort', a: p.a, b: p.b, left: id };
  }

  forget(id: string) {
    this.users.delete(id);
  }

  vibe(id: string, v: LoveVibe) {
    const p = this.pair;
    if (!p || p.phase !== 'call' || !this.inPair(id)) return;
    p.vibes.set(id, v);
  }

  /**
   * Advance timers. `canMatch` lets the room veto someone who is busy (already
   * on another call); they keep their place and are retried next tick.
   */
  tick(now: number, canMatch: (id: string) => boolean): LoveEvent[] {
    const out: LoveEvent[] = [];
    const p = this.pair;
    if (p && now >= p.until) {
      if (p.phase === 'ready') {
        p.phase = 'call';
        p.until = now + LOVE_CALL_MS;
        out.push({ kind: 'call', a: p.a, b: p.b });
      } else if (p.phase === 'call') {
        p.phase = 'reveal';
        p.until = now + LOVE_REVEAL_MS;
        p.score = loveScore(mergeVibes(p.vibes.get(p.a) ?? null, p.vibes.get(p.b) ?? null), p.seed);
        out.push({ kind: 'reveal', a: p.a, b: p.b, score: p.score });
      } else {
        this.pair = null;
        out.push({ kind: 'done', a: p.a, b: p.b });
      }
    }
    if (!this.pair) {
      const a = this.lanes[0].find(canMatch);
      const b = this.lanes[1].find(canMatch);
      if (a && b) {
        this.lanes[0].splice(this.lanes[0].indexOf(a), 1);
        this.lanes[1].splice(this.lanes[1].indexOf(b), 1);
        const seed = pairSeed(this.users.get(a) ?? a, this.users.get(b) ?? b);
        this.pair = { a, b, seed, phase: 'ready', until: now + LOVE_READY_MS, score: null, vibes: new Map() };
        out.push({ kind: 'match', a, b });
      }
    }
    return out;
  }

  /** Put someone back at the front of their lane (their match partner walked out). */
  requeueFront(id: string, side: LoveSide) {
    if (this.sideOf(id) !== null || this.inPair(id)) return;
    this.lanes[side].unshift(id);
    if (this.lanes[side].length > LOVE_LANES[side].len) this.lanes[side].pop();
  }
}
