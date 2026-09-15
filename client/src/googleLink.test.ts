import { describe, expect, it, vi } from 'vitest';
import type { Me } from './api';
import { afterGoogleLink } from './googleLink';

const me = (id: string | undefined, avatar: unknown = { body: 'female' }): Me => ({
  id,
  handle: 'mia',
  home: 'abcd1234',
  lobby: 'lobby',
  onboarded: true,
  linked: true,
  googleEnabled: true,
  avatar,
});

describe('after a Google link', () => {
  it('same user: re-sends the adopted look to the open room, no rejoin', () => {
    const resend = vi.fn();
    const rejoin = vi.fn();
    afterGoogleLink('u1', me('u1'), { resend, rejoin });
    expect(resend).toHaveBeenCalledTimes(1);
    expect(rejoin).not.toHaveBeenCalled();
  });

  it('device repointed to a different user: never sends on the old connection, rejoins instead', () => {
    const resend = vi.fn();
    const rejoin = vi.fn();
    afterGoogleLink('u1', me('u2'), { resend, rejoin });
    expect(resend).not.toHaveBeenCalled();
    expect(rejoin).toHaveBeenCalledTimes(1);
  });

  it('identity unknown: rejoins rather than risk writing to the wrong account', () => {
    const resend = vi.fn();
    const rejoin = vi.fn();
    afterGoogleLink(undefined, me('u2'), { resend, rejoin });
    afterGoogleLink('u1', me(undefined), { resend, rejoin });
    expect(resend).not.toHaveBeenCalled();
    expect(rejoin).toHaveBeenCalledTimes(2);
  });
});
