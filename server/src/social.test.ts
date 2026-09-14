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

  it('lists sessions per user, most recent last, and notifySession targets just one', () => {
    const p = new Presence();
    const got: Array<[string, string]> = [];
    p.join('u1', 's1', { slug: 'a', name: 'A' }, (type) => got.push(['s1', type]));
    p.join('u1', 's2', { slug: 'b', name: 'B' }, (type) => got.push(['s2', type]));
    expect(p.sessions('u1')).toEqual([
      { sessionId: 's1', room: { slug: 'a', name: 'A' } },
      { sessionId: 's2', room: { slug: 'b', name: 'B' } },
    ]);
    expect(p.sessions('nobody')).toEqual([]);
    expect(p.notifySession('u1', 's2', 'ping', { x: 1 })).toBe(true);
    expect(got).toEqual([['s2', 'ping']]);
    expect(p.notifySession('u1', 'nope', 'ping', {})).toBe(false);
    expect(p.notifySession('nobody', 's1', 'ping', {})).toBe(false);
  });

  it('notifySession does not throw when the session send fails', () => {
    const p = new Presence();
    p.join('u1', 's1', { slug: 'a', name: 'A' }, () => {
      throw new Error('socket closed');
    });
    expect(p.notifySession('u1', 's1', 'ping', {})).toBe(true);
  });

  it('renameRoom updates every session in that room and reports affected users', () => {
    const p = new Presence();
    p.join('u1', 's1', { slug: 'r1', name: 'Old' }, () => {});
    p.join('u2', 's2', { slug: 'r1', name: 'Old' }, () => {});
    p.join('u2', 's3', { slug: 'r2', name: 'Other' }, () => {});
    p.join('u3', 's4', { slug: 'r2', name: 'Other' }, () => {});
    const affected = p.renameRoom('r1', 'New Name');
    expect(new Set(affected)).toEqual(new Set(['u1', 'u2']));
    expect(p.where('u1')).toEqual({ slug: 'r1', name: 'New Name' });
    expect(p.sessions('u2')).toEqual([
      { sessionId: 's2', room: { slug: 'r1', name: 'New Name' } },
      { sessionId: 's3', room: { slug: 'r2', name: 'Other' } },
    ]);
    expect(p.where('u3')).toEqual({ slug: 'r2', name: 'Other' });
    expect(p.renameRoom('unknown', 'x')).toEqual([]);
  });
});
