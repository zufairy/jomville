export const CHAT_MAX_LEN = 120;
export const CHAT_WRAP_CHARS = 40;
export const CHAT_BUBBLE_MS = 6000;
export const CHAT_RATE = { count: 4, windowMs: 3000 };
export const EMOTE_RATE = { count: 12, windowMs: 3000 };

export const EMOTES = ['👋', '❤️', '😂', '😮', '😢', '🎉', '👍', '💤'] as const;

/** Sliding-window rate limiter keyed by string. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private count: number, private windowMs: number) {}

  /** Returns true if allowed (and records the hit). */
  allow(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.count) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  forget(key: string) {
    this.hits.delete(key);
  }
}

// ASCII control range (0x00-0x1f) plus DEL, built from code points to keep source printable.
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
);

/** Collapse whitespace, strip control chars, clamp length. Returns null if empty. */
export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > CHAT_MAX_LEN ? s.slice(0, CHAT_MAX_LEN) : s;
}
