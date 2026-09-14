import { describe, expect, it } from 'vitest';
import { STUN_URLS, iceServersFromEnv } from './ice';

describe('iceServersFromEnv', () => {
  it('STUN only without full TURN config', () => {
    expect(iceServersFromEnv({})).toEqual([{ urls: STUN_URLS }]);
    expect(iceServersFromEnv({ TURN_URLS: 'turn:t.example:3478', TURN_USERNAME: 'u' })).toEqual([{ urls: STUN_URLS }]);
    expect(iceServersFromEnv({ TURN_URLS: ' , ', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' })).toEqual([{ urls: STUN_URLS }]);
  });
  it('adds TURN when urls, username and credential are all set', () => {
    expect(
      iceServersFromEnv({ TURN_URLS: 'turn:t.example:3478?transport=udp, turns:t.example:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' }),
    ).toEqual([
      { urls: STUN_URLS },
      { urls: ['turn:t.example:3478?transport=udp', 'turns:t.example:5349'], username: 'u', credential: 'p' },
    ]);
  });
});
