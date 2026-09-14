import { describe, expect, it } from 'vitest';
import { exitIntent } from './vipModalIntent';

describe('exitIntent', () => {
  it('closes straight away when no match is live', () => {
    expect(exitIntent({ live: false, confirming: false, source: 'x' })).toBe('close');
    expect(exitIntent({ live: false, confirming: false, source: 'exit' })).toBe('close');
    expect(exitIntent({ live: false, confirming: false, source: 'key', key: 'Escape' })).toBe('close');
  });
  it('asks to confirm when a match is live', () => {
    expect(exitIntent({ live: true, confirming: false, source: 'x' })).toBe('confirm');
    expect(exitIntent({ live: true, confirming: false, source: 'exit' })).toBe('confirm');
    expect(exitIntent({ live: true, confirming: false, source: 'key', key: 'Escape' })).toBe('confirm');
  });
  it('leave button inside the confirm closes', () => {
    expect(exitIntent({ live: true, confirming: true, source: 'exit' })).toBe('close');
  });
  it('the ✕ inside the confirm also closes', () => {
    expect(exitIntent({ live: true, confirming: true, source: 'x' })).toBe('close');
  });
  it('Escape or backdrop backs out of the confirm', () => {
    expect(exitIntent({ live: true, confirming: true, source: 'key', key: 'Escape' })).toBe('cancel-confirm');
    expect(exitIntent({ live: true, confirming: true, source: 'backdrop' })).toBe('cancel-confirm');
  });
  it('ignores other keys and backdrop clicks', () => {
    expect(exitIntent({ live: false, confirming: false, source: 'key', key: 'a' })).toBe('none');
    expect(exitIntent({ live: true, confirming: false, source: 'backdrop' })).toBe('none');
  });
});
