import { useEffect, useRef, useState } from 'react';
import { googleSignIn } from '../api';
import { afterGoogleLink } from '../googleLink';
import { navigate } from '../router';
import { useAppStore } from '../store';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('gis failed'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Sign in with Google (Google Identity Services). The ID token goes to our
 * server, which verifies it and links the account to this device's identity.
 * Renders a disabled placeholder when no client id is configured.
 */
export function GoogleButton({ onDone }: { onDone?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const adoptMe = useAppStore((s) => s.adoptMe);
  const flash = useAppStore((s) => s.flash);

  useEffect(() => {
    if (!CLIENT_ID || !host.current) return;
    let alive = true;
    loadGis()
      .then(() => {
        if (!alive || !host.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            setState('busy');
            try {
              // the user the open room connection joined as
              const prevId = useAppStore.getState().me?.id;
              const me = await googleSignIn(credential);
              adoptMe(me);
              afterGoogleLink(prevId, me, {
                // same account: show the adopted look on my sprite without a reload
                resend: () => {
                  const s = useAppStore.getState();
                  s.actions?.setAvatar(s.avatar);
                },
                // switched account: rejoin as the linked user
                rejoin: () => void navigate(location.pathname + location.search),
              });
              flash(`hi ${me.handle}!`);
              onDone?.();
            } catch (e) {
              setState('error');
              flash((e as Error).message);
            }
          },
        });
        window.google.accounts.id.renderButton(host.current, { theme: 'outline', size: 'large', shape: 'pill', width: 280, text: 'continue_with' });
      })
      .catch(() => setState('error'));
    return () => {
      alive = false;
    };
  }, [adoptMe, flash, onDone]);

  if (!CLIENT_ID) {
    return (
      <button className="btn gbtn gbtn--off" disabled title="set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID">
        <span className="gbtn__g">G</span> continue with Google
        <span className="gbtn__note">not configured yet</span>
      </button>
    );
  }
  return (
    <div className="gbtn__host">
      <div ref={host} />
      {state === 'busy' && <span className="gbtn__note">signing in…</span>}
    </div>
  );
}
