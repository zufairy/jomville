import { describe, expect, it } from 'vitest';
import { RateLimiter, sanitizeChat, CHAT_MAX_LEN } from './chat';
import { censor, containsProfanity } from './profanity';

describe('RateLimiter', () => {
  it('allows N per window then blocks, then frees', () => {
    const rl = new RateLimiter(4, 3000);
    for (let i = 0; i < 4; i++) expect(rl.allow('a', 1000 + i)).toBe(true);
    expect(rl.allow('a', 1010)).toBe(false);
    expect(rl.allow('b', 1010)).toBe(true);
    expect(rl.allow('a', 4001)).toBe(true);
  });
});

describe('sanitizeChat', () => {
  it('rejects non-strings and blanks', () => {
    expect(sanitizeChat(42)).toBeNull();
    expect(sanitizeChat('   \n ')).toBeNull();
  });
  it('collapses whitespace, strips control chars, clamps', () => {
    expect(sanitizeChat('  hi \n there ')).toBe('hi there');
    expect(sanitizeChat('a' + String.fromCharCode(7) + 'b')).toBe('a b');
    expect(sanitizeChat('x'.repeat(500))!.length).toBe(CHAT_MAX_LEN);
  });
});

describe('profanity', () => {
  it('detects with leetspeak', () => {
    expect(containsProfanity('what the sh1t')).toBe(true);
    expect(containsProfanity('FUUUCK')).toBe(true);
    expect(containsProfanity('hello friend')).toBe(false);
  });
  it('censors tokens', () => {
    expect(censor('oh shit hi')).toBe('oh **** hi');
  });
});
