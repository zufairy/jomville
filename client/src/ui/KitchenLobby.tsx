import { useEffect, useRef, useState } from 'react';
import { KITCHEN_WORLD } from '@dovey/shared';
import { useAppStore } from '../store';
import { useKitchen } from '../kitchen/store';
import { sendToWorld } from '../net';

/** Kitchen world card: your crew, its code, Start; or join a friend's crew by code. */
export function KitchenLobby() {
  const slug = useAppStore((s) => s.room?.slug);
  const crew = useKitchen((s) => s.crew);
  const phase = useKitchen((s) => s.phase);
  const again = useKitchen((s) => s.again);
  const [code, setCode] = useState('');
  const [coarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

  // "Play again": rounds are only created by the lobby, so start again once the old kitchen has closed.
  // `again` stays set until k_go lands (go() clears it) so a crewmate winning the race isn't an error.
  const sentAgain = useRef(false);
  useEffect(() => {
    if (!again || phase !== 'off') {
      sentAgain.current = false;
      return;
    }
    if (!crew || slug !== KITCHEN_WORLD.slug) return void useKitchen.getState().clearAgain();
    if (crew.phase !== 'open') {
      sentAgain.current = false;
      return;
    }
    if (sentAgain.current) return;
    sentAgain.current = true;
    sendToWorld('k_start');
  }, [again, crew, phase, slug]);

  if (slug !== KITCHEN_WORLD.slug || phase !== 'off') return null;

  if (!crew)
    return (
      <div className="kl">
        <b>🍳 co-op kitchen</b>
        <span>stand on a rug with up to 3 friends to form a crew</span>
        <form
          className="kl__join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) sendToWorld('k_code', { code: code.trim() });
          }}
        >
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="CODE" aria-label="crew code" />
          <button className="btn" type="submit">
            join
          </button>
        </form>
      </div>
    );

  return (
    <div className="kl">
      <b>
        crew <span className="kl__code">{crew.code}</span>
      </b>
      <span>
        {crew.names.join(', ')} · {crew.members.length}/4
      </span>
      {crew.phase === 'cooking' ? (
        <span>{again ? 'waiting for the kitchen to close, then going again…' : 'cooking…'}</span>
      ) : (
        <button className="btn kl__start" onClick={() => sendToWorld('k_start')}>
          start cooking
        </button>
      )}
      <small>{coarse ? 'tap to walk · tap a station to use it · hold the board to chop · double-tap to dash' : 'WASD move · Space grab · E chop · Shift dash · or click to walk, hold the board to chop'}</small>
    </div>
  );
}
