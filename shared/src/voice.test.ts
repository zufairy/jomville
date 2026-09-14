import { describe, expect, it } from 'vitest';
import { VOICE_CONNECT, VOICE_DISCONNECT, VOICE_FULL, VOICE_RADIUS, voiceGain, voiceInitiator, wantsVoiceLink } from './voice';

describe('voiceGain', () => {
  it('is full volume up close', () => {
    expect(voiceGain(0)).toBe(1);
    expect(voiceGain(VOICE_FULL)).toBe(1);
  });
  it('fades monotonically to silence at the radius', () => {
    let prev = 1;
    for (let d = VOICE_FULL; d <= VOICE_RADIUS; d += 0.25) {
      const g = voiceGain(d);
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
    expect(voiceGain(VOICE_RADIUS)).toBe(0);
    expect(voiceGain(VOICE_RADIUS + 5)).toBe(0);
  });
  it('treats bad input as silent', () => {
    expect(voiceGain(NaN)).toBe(0);
    expect(voiceGain(-1)).toBe(0);
  });
});

describe('wantsVoiceLink', () => {
  it('needs at least one open mic', () => {
    expect(wantsVoiceLink(1, false, false)).toBe(false);
    expect(wantsVoiceLink(1, true, false)).toBe(true);
  });
  it('keeps an existing link a bit further out than it opens one', () => {
    const edge = (VOICE_CONNECT + VOICE_DISCONNECT) / 2;
    expect(wantsVoiceLink(edge, true, false)).toBe(false);
    expect(wantsVoiceLink(edge, true, true)).toBe(true);
    expect(wantsVoiceLink(VOICE_DISCONNECT + 0.1, true, true)).toBe(false);
  });
});

describe('voiceInitiator', () => {
  it('picks exactly one side of a pair', () => {
    expect(voiceInitiator('a', 'b')).not.toBe(voiceInitiator('b', 'a'));
  });
});
