import { describe, expect, it } from 'vitest';
import { TYPING_DEBOUNCE_MS, TYPING_HEARTBEAT_MS, TYPING_IDLE_MS, TypingSender } from './typingState';

function sender() {
  const sent: boolean[] = [];
  return { s: new TypingSender((on) => sent.push(on)), sent };
}

describe('TypingSender', () => {
  it('sends on once typing lasts past the debounce', () => {
    const { s, sent } = sender();
    s.input('h', 1000);
    s.tick(1000 + TYPING_DEBOUNCE_MS - 1);
    expect(sent).toEqual([]);
    s.input('hi', 1100);
    s.tick(1000 + TYPING_DEBOUNCE_MS);
    expect(sent).toEqual([true]);
    s.input('hi!', 1400);
    s.tick(1500);
    expect(sent).toEqual([true]);
  });

  it('a key typed and deleted within the debounce sends nothing', () => {
    const { s, sent } = sender();
    s.input('x', 0);
    s.input('', 100);
    s.tick(1000);
    expect(sent).toEqual([]);
    expect(s.active).toBe(false);
  });

  it('goes off after idling', () => {
    const { s, sent } = sender();
    s.input('hey', 0);
    s.tick(TYPING_DEBOUNCE_MS);
    expect(s.tick(TYPING_IDLE_MS - 1)).toBe(true);
    expect(s.tick(TYPING_IDLE_MS)).toBe(false);
    expect(sent).toEqual([true, false]);
  });

  it('clearing, blurring or sending turns it off exactly once', () => {
    const { s, sent } = sender();
    s.input('hey', 0);
    s.tick(TYPING_DEBOUNCE_MS);
    s.stop();
    s.stop();
    s.input('', 400);
    expect(sent).toEqual([true, false]);
  });

  it('repeats on while a long message is still being typed', () => {
    const { s, sent } = sender();
    s.input('a', 0);
    s.tick(TYPING_DEBOUNCE_MS);
    for (let t = 500; t <= TYPING_DEBOUNCE_MS + TYPING_HEARTBEAT_MS + 500; t += 500) {
      s.input('a'.repeat(t / 100), t);
      s.tick(t);
    }
    expect(sent).toEqual([true, true]);
  });
});
