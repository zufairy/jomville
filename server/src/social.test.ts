import { describe, expect, it } from 'vitest';
import { Presence } from './social';

describe('Presence', () => {
  it('tracks sessions per user, latest room wins, notify fans out', () => {
    const p = new Presence();
    const got: Array<[string, string, unknown]> = [];
    const send = (tag: string) => (type: string, payload: unknown) => got.push([tag, type, payload]);
    expect(p.isOnline('u1')).toBe(false);
    expect(p.where('u1')).toBeNull();
    p.join('u1', 's1', { slug: 'lobby', name: 'Main Lobby' }, send('s1'));
    p.join('u1', 's2', { slug: 'casino', name: 'Casino' }, send('s2'));
    expect(p.isOnline('u1')).toBe(true);
    expect(p.where('u1')).toEqual({ slug: 'casino', name: 'Casino' });
    p.notify('u1', 'friend_update', { x: 1 });
    expect(got).toEqual([
      ['s1', 'friend_update', { x: 1 }],
      ['s2', 'friend_update', { x: 1 }],
    ]);
    p.leave('u1', 's2');
    expect(p.where('u1')).toEqual({ slug: 'lobby', name: 'Main Lobby' });
    p.leave('u1', 's1');
    expect(p.isOnline('u1')).toBe(false);
    p.notify('u1', 'x', null);
    expect(got.length).toBe(2);
  });

  it('leave of an unknown session is harmless', () => {
    const p = new Presence();
    p.leave('nobody', 'nope');
    expect(p.isOnline('nobody')).toBe(false);
  });

  it('one failing session does not stop delivery to the others or throw', () => {
    const p = new Presence();
    const got: string[] = [];
    p.join('u1', 's1', { slug: 'a', name: 'A' }, () => {
      throw new Error('socket closed');
    });
    p.join('u1', 's2', { slug: 'b', name: 'B' }, (type) => got.push(type));
    expect(() => p.notify('u1', 'friend_update', {})).not.toThrow();
    expect(got).toEqual(['friend_update']);
  });
});
