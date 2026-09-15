import { RateLimiter } from '@dovey/shared';

/** "on" messages per client allowed in the window; the excess is dropped silently */
export const TYPING_RATE = { count: 4, windowMs: 2000 };
/** a stuck "on" (tab closed mid-word, lost "off") clears after this */
export const TYPING_EXPIRE_MS = 6000;

/**
 * Who is typing in a room. Decides which `typing` messages are worth a
 * broadcast: only real on/off transitions, never repeats, never the excess.
 */
export class TypingBook {
  private limiter = new RateLimiter(TYPING_RATE.count, TYPING_RATE.windowMs);
  /** sessionId -> last "on" time */
  private since = new Map<string, number>();

  /**
   * A client says it started or stopped typing.
   * @returns the state to broadcast, or null to stay quiet
   */
  request(id: string, on: boolean, now: number): boolean | null {
    if (!on) return this.stop(id) ? false : null;
    if (!this.limiter.allow(id, now)) return null;
    const was = this.since.has(id);
    this.since.set(id, now); // a repeat "on" is a heartbeat: it only refreshes the expiry
    return was ? null : true;
  }

  /** @returns true when `id` was typing (so an "off" should go out) */
  stop(id: string): boolean {
    return this.since.delete(id);
  }

  /** the client left: forget it entirely; true when an "off" should go out */
  forget(id: string): boolean {
    this.limiter.forget(id);
    return this.stop(id);
  }

  /** ids whose "on" went stale; they are cleared and need an "off" broadcast */
  expire(now: number): string[] {
    const out: string[] = [];
    for (const [id, t] of this.since) if (now - t >= TYPING_EXPIRE_MS) out.push(id);
    for (const id of out) this.since.delete(id);
    return out;
  }

  get size(): number {
    return this.since.size;
  }
}
