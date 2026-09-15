import type { Me } from './api';

/**
 * After Google sign-in has adopted the returned `me`. The open room connection is still
 * authenticated as the user it joined as (prevId). If the link repointed this device at a
 * different account, sending the look on that connection would save it onto the old user,
 * so rejoin instead (the new join re-resolves the token and wears the linked look).
 */
export function afterGoogleLink(prevId: string | undefined, me: Me, deps: { resend: () => void; rejoin: () => void }) {
  if (prevId && me.id && prevId === me.id) {
    if (me.avatar) deps.resend();
    return;
  }
  deps.rejoin();
}
