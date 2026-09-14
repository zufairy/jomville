import { describe, expect, it } from 'vitest';
import { roomUrl, routeFromPath, slugFromPath } from './router';

describe('router', () => {
  it('parses room slugs', () => {
    expect(slugFromPath('/r/abcd1234')).toBe('abcd1234');
    expect(slugFromPath('/r/abcd1234/')).toBe('abcd1234');
    expect(slugFromPath('/')).toBeNull();
    expect(slugFromPath('/r/ABCD')).toBeNull();
    expect(slugFromPath('/r/a')).toBeNull();
  });
  it('routes landing, play, room', () => {
    expect(routeFromPath('/')).toEqual({ kind: 'landing' });
    expect(routeFromPath('/play')).toEqual({ kind: 'play' });
    expect(routeFromPath('/r/abcd1234')).toEqual({ kind: 'room', slug: 'abcd1234' });
    expect(routeFromPath('/nope')).toEqual({ kind: 'landing' });
    expect(routeFromPath('/leaderboards')).toEqual({ kind: 'leaderboards' });
    expect(routeFromPath('/leaderboards/')).toEqual({ kind: 'leaderboards' });
    expect(routeFromPath('/leaderboardsx')).toEqual({ kind: 'landing' });
  });
  it('builds urls', () => {
    expect(roomUrl('abcd1234')).toBe('/r/abcd1234');
  });
});
