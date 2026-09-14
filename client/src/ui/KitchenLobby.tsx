import { useState } from 'react';
import { KITCHEN_WORLD } from '@dovey/shared';
import { useAppStore } from '../store';
import { useKitchen } from '../kitchen/store';
import { sendToWorld } from '../net';

/** Kitchen world card: your crew, its code, Start; or join a friend's crew by code. */
export function KitchenLobby() {
  const slug = useAppStore((s) => s.room?.slug);
  const crew = useKitchen((s) => s.crew);
  const phase = useKitchen((s) => s.phase);
  const [code, setCode] = useState('');
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
        <span>cooking…</span>
      ) : (
        <button className="btn kl__start" onClick={() => sendToWorld('k_start')}>
          start cooking
        </button>
      )}
      <small>WASD move · Space grab · E chop · Shift dash</small>
    </div>
  );
}
