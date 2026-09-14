import { beforeEach, describe, expect, it } from 'vitest';
import { ICE, currentIce, isOtherCallBusy, loadIce, resetIceForTests, setOtherCallBusy } from './call';

describe('ICE config', () => {
  beforeEach(() => resetIceForTests());

  it('uses server ICE servers once loaded, fetching only once', async () => {
    let calls = 0;
    const servers = [{ urls: ['stun:s'] }, { urls: ['turn:t'], username: 'u', credential: 'p' }];
    const fetcher = async () => {
      calls++;
      return servers;
    };
    expect(currentIce()).toBe(ICE);
    expect(await loadIce(fetcher)).toEqual({ iceServers: servers });
    await loadIce(fetcher);
    expect(calls).toBe(1);
    expect(currentIce()).toEqual({ iceServers: servers });
  });

  it('falls back to STUN-only on null or a thrown fetch', async () => {
    expect(await loadIce(async () => null)).toBe(ICE);
    resetIceForTests();
    expect(await loadIce(async () => Promise.reject(new Error('offline')))).toBe(ICE);
  });

  it('lets another call type mark the user busy', () => {
    expect(isOtherCallBusy()).toBe(false);
    setOtherCallBusy(() => true);
    expect(isOtherCallBusy()).toBe(true);
    setOtherCallBusy(() => false);
  });
});
