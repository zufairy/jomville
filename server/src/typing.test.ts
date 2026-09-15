import { describe, expect, it } from 'vitest';
import { TYPING_EXPIRE_MS, TYPING_RATE, TypingBook } from './typing';

describe('TypingBook', () => {
  it('broadcasts only real transitions', () => {
    const b = new TypingBook();
    expect(b.request('a', true, 0)).toBe(true);
    expect(b.request('a', true, 100)).toBeNull(); // heartbeat
    expect(b.request('a', false, 200)).toBe(false);
    expect(b.request('a', false, 300)).toBeNull(); // already off
  });

  it('drops "on" beyond the rate limit silently', () => {
    const b = new TypingBook();
    const out: Array<boolean | null> = [];
    for (let i = 0; i < 6; i++) {
      out.push(b.request('a', true, i * 10));
      out.push(b.request('a', false, i * 10 + 1));
    }
    expect(out.filter((x) => x === true)).toHaveLength(TYPING_RATE.count);
    // every broadcast "on" is matched by one "off", nothing more
    expect(out.filter((x) => x === false)).toHaveLength(TYPING_RATE.count);
    // the window slides: allowed again later
    expect(b.request('a', true, TYPING_RATE.windowMs + 100)).toBe(true);
  });

  it('limits each client separately', () => {
    const b = new TypingBook();
    for (let i = 0; i < TYPING_RATE.count; i++) b.request('a', true, i);
    expect(b.request('a', true, 10)).toBeNull();
    expect(b.request('b', true, 10)).toBe(true);
  });

  it('expires a stuck "on" and refreshes on heartbeat', () => {
    const b = new TypingBook();
    b.request('a', true, 0);
    b.request('b', true, 0);
    b.request('b', true, 3000);
    expect(b.expire(TYPING_EXPIRE_MS - 1)).toEqual([]);
    expect(b.expire(TYPING_EXPIRE_MS)).toEqual(['a']);
    expect(b.expire(3000 + TYPING_EXPIRE_MS)).toEqual(['b']);
    expect(b.size).toBe(0);
  });

  it('chat and leave clear the indicator', () => {
    const b = new TypingBook();
    b.request('a', true, 0);
    expect(b.stop('a')).toBe(true);
    expect(b.stop('a')).toBe(false);
    b.request('c', true, 0);
    expect(b.forget('c')).toBe(true);
    expect(b.forget('nobody')).toBe(false);
  });
});
