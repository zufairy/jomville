import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, SKIN_TONES, normalizeAvatar, serializeAvatar } from '@dovey/shared';
import { chefLook } from './looks';

const mine = normalizeAvatar({ body: 'female', skin: SKIN_TONES[1] });
const hers = normalizeAvatar({ body: 'female', skin: SKIN_TONES[2] });
const inWorld = normalizeAvatar({ body: 'male', skin: SKIN_TONES[3] });

describe('chefLook', () => {
  it('uses the kitchen room look for a crewmate who is not in the world roster', () => {
    expect(chefLook('u2', { me: 'u1', myAvatar: mine, looks: { u2: serializeAvatar(hers) }, roster: {} })).toEqual(hers);
  });

  it('prefers the kitchen room look over the world roster, which is only a fallback', () => {
    const roster = { s2: { handle: 'bo', userId: 'u2', avatar: serializeAvatar(inWorld) } };
    expect(chefLook('u2', { me: 'u1', myAvatar: mine, looks: { u2: serializeAvatar(hers) }, roster })).toEqual(hers);
    expect(chefLook('u2', { me: 'u1', myAvatar: mine, looks: {}, roster })).toEqual(inWorld);
  });

  it('uses your own live look for you, and null (retry later) when nobody knows the chef', () => {
    expect(chefLook('u1', { me: 'u1', myAvatar: mine, looks: { u1: serializeAvatar(hers) }, roster: {} })).toEqual(mine);
    expect(chefLook('u3', { me: 'u1', myAvatar: mine, looks: {}, roster: {} })).toBeNull();
    expect(DEFAULT_AVATAR).toBeTruthy();
  });
});
