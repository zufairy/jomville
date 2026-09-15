import { useEffect, useRef, useState } from "react";
import { googleSignIn } from "../api";
import { afterGoogleLink } from "../googleLink";
import { navigate } from "../router";
import { useAppStore } from "../store";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: {
            client_id: string;
            callback: (r: { credential: string }) => void;
            ux_mode?: string;
          }) => void;
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
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        s.remove();
        scriptPromise = null;
        reject(new Error("gis failed"));
      };
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
  const [state, setState] = useState<"loading" | "idle" | "busy" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const adoptMe = useAppStore((s) => s.adoptMe);
  const flash = useAppStore((s) => s.flash);

  useEffect(() => {
    if (!CLIENT_ID || !host.current) return;
    let alive = true;
    setState("loading");
    loadGis()
      .then(() => {
        if (!alive || !host.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            if (!alive) return;
            setState("busy");
            try {
              // the user the open room connection joined as
              const prevId = useAppStore.getState().me?.id;
              const me = await googleSignIn(credential);
              if (!alive) return;
              adoptMe(me);
              afterGoogleLink(prevId, me, {
                // same account: show the adopted look on my sprite without a reload
                resend: () => {
                  const s = useAppStore.getState();
                  s.actions?.setAvatar(s.avatar);
                },
                // switched account: rejoin as the linked user
                rejoin: () =>
                  void navigate(location.pathname + location.search),
              });
              flash(`hi ${me.handle}!`);
              setState("idle");
              onDone?.();
            } catch (e) {
              if (!alive) return;
              setState("error");
              flash((e as Error).message);
            }
          },
        });
        host.current.replaceChildren();
        window.google.accounts.id.renderButton(host.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          width: 280,
          text: "continue_with",
        });
        setState("idle");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [adoptMe, flash, onDone, attempt]);

  if (!CLIENT_ID) {
    return (
      <button
        className="btn gbtn gbtn--off"
        disabled
        title="set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID"
      >
        <span className="gbtn__g">G</span> continue with Google
        <span className="gbtn__note">not configured yet</span>
      </button>
    );
  }
  return (
    <div
      className="gbtn__host"
      aria-busy={state === "busy" || state === "loading"}
    >
      <div ref={host} />
      {state === "loading" && (
        <span className="gbtn__note" role="status">
          Loading Google sign-in…
        </span>
      )}
      {state === "error" && (
        <span className="gbtn__error" role="alert">
          Google sign-in couldn’t finish. Check your connection and try again.
          <button
            className="gbtn__retry"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </span>
      )}
      {state === "busy" && <span className="gbtn__note">signing in…</span>}
    </div>
  );
}
