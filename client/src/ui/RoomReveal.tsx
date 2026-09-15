import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { create } from 'zustand';
import { useAppStore } from '../store';
import { LeyparkMark } from './LeyparkLogo';
import { REVEAL_FADE_MS, REVEAL_MELT_MS, RevealPhase } from '../game/reveal';
import './room-reveal.css';

interface RevealView {
  phase: RevealPhase;
  reduced: boolean;
}

/** what the frosted loading overlay shows; driven by the game's RoomReveal controller */
export const useRevealView = create<RevealView>(() => ({ phase: 'shown', reduced: false }));

/** Update the overlay; `now` renders it before returning (the page may be unloading). */
export function setRevealView(v: Partial<RevealView>, now = false) {
  if (now) flushSync(() => useRevealView.setState(v));
  else useRevealView.setState(v);
}

/**
 * Frosted overlay over the game canvas while a room loads: blurred, dimmed
 * room behind a small card with the room name and a pulsing Leypark smiley.
 * It lives inside the stage element, under the HUD, so chat and the room bar
 * stay usable while it is up.
 */
export function RoomReveal() {
  const phase = useRevealView((s) => s.phase);
  const reduced = useRevealView((s) => s.reduced);
  const name = useAppStore((s) => s.room?.name);
  const status = useAppStore((s) => s.status);
  if (phase === 'shown') return null;
  const style = { ['--rr-melt' as string]: `${reduced ? REVEAL_FADE_MS : REVEAL_MELT_MS}ms` };
  return (
    <div className={`room-reveal room-reveal--${phase}`} style={style} aria-hidden={phase !== 'loading'}>
      <div className="room-reveal__frost" />
      <div className="room-reveal__card" role="status" aria-live="polite">
        <LeyparkMark size={40} className="room-reveal__mark" />
        <div className="room-reveal__text">
          <span className="room-reveal__name">{name || 'leypark'}</span>
          <span className="room-reveal__hint">{status === 'reconnecting' ? 'reconnecting…' : 'getting the room ready…'}</span>
        </div>
        <i className="room-reveal__bar" />
      </div>
    </div>
  );
}

/** Render the overlay into its own root inside `host` (the game stage). Returns the unmount. */
export function mountRoomReveal(host: HTMLElement): () => void {
  const el = document.createElement('div');
  el.className = 'room-reveal-host';
  host.appendChild(el);
  const root = createRoot(el);
  root.render(createElement(RoomReveal));
  return () => {
    // unmounting synchronously inside another root's commit warns; defer a tick
    setTimeout(() => {
      root.unmount();
      el.remove();
    }, 0);
  };
}
