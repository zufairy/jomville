/**
 * Keeps small sounds from piling up in busy rooms: at least `minGapMs` between
 * plays and at most `maxInWindow` plays in any `windowMs`. Fixed ring buffer,
 * no allocation per call.
 */
export class SfxThrottle {
  private times: number[];
  private next = 0;
  private last = -Infinity;

  constructor(
    private minGapMs: number,
    private maxInWindow = 1,
    private windowMs = minGapMs,
  ) {
    this.times = new Array<number>(Math.max(1, maxInWindow)).fill(-Infinity);
  }

  /** true (and records the play) when a sound may play now */
  allow(now: number): boolean {
    if (now - this.last < this.minGapMs) return false;
    // the oldest recorded play sits at `next`; the window is full while it is still inside
    if (now - this.times[this.next] < this.windowMs) return false;
    this.times[this.next] = now;
    this.next = (this.next + 1) % this.times.length;
    this.last = now;
    return true;
  }
}
