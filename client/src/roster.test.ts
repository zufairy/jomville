import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, serializeAvatar } from '@dovey/shared';
import { avatarOf, useRoster } from './roster';

describe('roster', () => {
  beforeEach(() => useRoster.getState().clear());

  it('upserts, reads and removes players', () => {
    const avatar = serializeAvatar({ ...DEFAULT_AVATAR, body: 'female' });
    useRoster.getState().upsert('s1', { handle: 'mia', userId: 'u1', avatar });
    expect(useRoster.getState().players.s1.handle).toBe('mia');
    expect(avatarOf('s1')?.body).toBe('female');
    useRoster.getState().remove('s1');
    expect(avatarOf('s1')).toBeNull();
  });

  it('returns null for unknown or empty ids', () => {
    expect(avatarOf('nope')).toBeNull();
    expect(avatarOf('')).toBeNull();
    expect(avatarOf(null)).toBeNull();
  });

  it('clear empties everything', () => {
    useRoster.getState().upsert('s1', { handle: 'a', userId: 'u', avatar: '' });
    useRoster.getState().clear();
    expect(useRoster.getState().players).toEqual({});
  });

  it('upsert with identical data keeps the same players object', () => {
    useRoster.getState().upsert('s1', { handle: 'a', userId: 'u', avatar: 'x' });
    const before = useRoster.getState().players;
    useRoster.getState().upsert('s1', { handle: 'a', userId: 'u', avatar: 'x' });
    expect(useRoster.getState().players).toBe(before);
    useRoster.getState().upsert('s1', { handle: 'a', userId: 'u', avatar: 'y' });
    expect(useRoster.getState().players).not.toBe(before);
  });
});
