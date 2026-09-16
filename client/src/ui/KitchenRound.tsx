import { useEffect, useRef, useState } from 'react';
import { kitchen } from '@dovey/shared';
import { KitchenRound } from '../kitchen/net';
import { IsoRenderer } from '../kitchen/isoRenderer';
import { bindPointer } from '../kitchen/pointerInput';
import { holdButton } from '../kitchen/holdButton';
import { dishName, useKitchen } from '../kitchen/store';
import { orderLeft } from '../kitchen/view';
import { dishItem, itemSprite } from '../kitchen/kitchenPixels';
import { mapDataUrl } from '../kitchen/pixelTexture';
import { ksfx } from '../kitchen/sounds';
import type { Vec } from '../kitchen/aim';
import { fetchInventory } from '../api';
import { useAppStore } from '../store';

const JOY_KEY = 'dovey.kitchen.joystick';

function loadJoystick(): boolean {
  try {
    return localStorage.getItem(JOY_KEY) === '1';
  } catch {
    return false;
  }
}

function saveJoystick(on: boolean) {
  try {
    localStorage.setItem(JOY_KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

const DISH_STEPS: Record<kitchen.Dish, { icons: string[]; steps: string[] }> = {
  soup_tomato: { icons: ['🍅', '🍅', '🍅', '🍲'], steps: ['chop 3 tomatoes', 'put into pot', 'wait for full cook', 'plate soup'] },
  soup_onion: { icons: ['🧅', '🧅', '🧅', '🍲'], steps: ['chop 3 onions', 'put into pot', 'wait for full cook', 'plate soup'] },
  soup_mushroom: { icons: ['🍄', '🍄', '🍄', '🍲'], steps: ['chop 3 mushrooms', 'put into pot', 'wait for full cook', 'plate soup'] },
  salad: { icons: ['🥬', '🍽️'], steps: ['chop lettuce', 'put on plate', 'serve'] },
  salad_tomato: { icons: ['🥬', '🍅', '🍽️'], steps: ['chop lettuce + tomato', 'put both on plate', 'serve'] },
};

function kitchenHintSeen() {
  try { return localStorage.getItem('dovey.kitchen.hint') === '1'; } catch { return false; }
}
function saveKitchenHintSeen() {
  try { localStorage.setItem('dovey.kitchen.hint', '1'); } catch { /* ignore */ }
}

export function KitchenRoundUI() {
  const phase = useKitchen((s) => s.phase);
  const roomId = useKitchen((s) => s.roomId);
  if (phase === 'off' || !roomId) return null;
  return <RoundScreen roomId={roomId} />;
}

function RoundScreen({ roomId }: { roomId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState<KitchenRound | null>(null);
  const [joystick, setJoystick] = useState(loadJoystick);
  const joyRef = useRef(joystick);
  joyRef.current = joystick;
  const [stick, setStick] = useState<{ knob: Vec; origin: Vec } | null>(null);
  const [dashAt, setDashAt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const r = new KitchenRound();
    const renderer = new IsoRenderer(r);
    setRound(r);
    r.onEvent = (e) => {
      if (e.type === 'served') ksfx.serve();
      else if (e.type === 'chopped' && e.chef === r.me) ksfx.ready();
      else if (e.type === 'burnt' || e.type === 'expired') ksfx.burn();
      else if (e.type === 'rejected' && e.chef === r.me) {
        ksfx.nope();
        renderer.shakeKind('window');
      }
    };
    const detachKeys = r.controls.attach(window);
    let unbind = () => {};
    let alive = true;
    // the renderer borrows the world's Pixi app (no second app); destroy() hands it back
    renderer
      .mount(host)
      .then((ok) => {
        if (!ok || !alive) return;
        unbind = bindPointer(renderer.canvas, r, renderer, {
          joystick: () => joyRef.current,
          onStick: setStick,
          onDash: () => setDashAt(performance.now()),
        });
      })
      .catch((err) => {
        console.error('[kitchen] renderer failed', err);
        if (alive) useKitchen.getState().lost();
      });
    const joinTimer = setTimeout(() => {
      if (alive && useKitchen.getState().phase === 'joining') useKitchen.getState().lost();
    }, 12000);
    r.join(roomId)
      .catch((err) => {
        console.error('[kitchen] join failed', err);
        useKitchen.getState().lost();
      })
      .finally(() => clearTimeout(joinTimer));
    return () => {
      alive = false;
      unbind();
      detachKeys();
      clearTimeout(joinTimer);
      renderer.destroy();
      r.leave();
    };
  }, [roomId]);

  return (
    <div className="kr" role="application" aria-label="kitchen round">
      <div ref={hostRef} className="kr__stage" />
      {stick && (
        <div className="kr-stick" style={{ left: stick.origin.x, top: stick.origin.y }}>
          <i style={{ transform: `translate(${stick.knob.x * 0.4}px, ${stick.knob.y * 0.4}px)` }} />
        </div>
      )}
      <Hud
        joystick={joystick}
        setJoystick={(on) => {
          setJoystick(on);
          saveJoystick(on);
        }}
      />
      {round && <TouchPad round={round} dashAt={dashAt} onDash={() => setDashAt(performance.now())} />}
      <Results />
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Hud({ joystick, setJoystick }: { joystick: boolean; setJoystick: (on: boolean) => void }) {
  const phase = useKitchen((s) => s.phase);
  const orders = useKitchen((s) => s.orders);
  const score = useKitchen((s) => s.score);
  const streak = useKitchen((s) => s.streak);
  const time = useKitchen((s) => s.time);
  const timeAt = useKitchen((s) => s.timeAt);
  const over = useKitchen((s) => s.over);
  const lag = useKitchen((s) => s.lag);
  const reconnecting = useKitchen((s) => s.reconnecting);
  const note = useKitchen((s) => s.note);
  const now = useNow(250);
  const [shownNote, setShownNote] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [hint, setHint] = useState(() => !kitchenHintSeen());

  useEffect(() => {
    if (!note) return;
    setShownNote(note);
    const t = setTimeout(() => setShownNote(null), 1800);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!hint || phase !== 'playing') return;
    const t = setTimeout(() => {
      setHint(false);
      saveKitchenHintSeen();
    }, 7000);
    return () => clearTimeout(t);
  }, [hint, phase]);

  const left = over ? time : Math.max(0, time - (now - timeAt) / 1000);
  const clock = `${Math.floor(left / 60)}:${Math.floor(left % 60)
    .toString()
    .padStart(2, '0')}`;

  return (
    <>
      <div className="kr-hud">
        <div className="kr-orders">
          {orders.map((o) => {
            const l = orderLeft(o, now);
            const k = l / o.total;
            return (
              <div key={o.id} className={`kr-ticket ${l < kitchen.ORDER_WARN ? 'kr-ticket--late' : ''}`} title={DISH_STEPS[o.dish].steps.join(' → ')}>
                <img src={mapDataUrl(itemSprite(dishItem(o.dish)).map, 3)} alt="" />
                <span className="kr-ticket__main">
                  <b>{dishName(o.dish)}</b>
                  <em>{DISH_STEPS[o.dish].icons.join(' ')}</em>
                  <small>{DISH_STEPS[o.dish].steps.join(' → ')}</small>
                </span>
                <i style={{ width: `${k * 100}%`, backgroundColor: k > 0.5 ? '#58c98b' : k > 0.25 ? '#f7c948' : '#ff3b30' }} />
              </div>
            );
          })}
          {streak > 1 && <b className="kr-streak">combo x{streak}</b>}
        </div>
        <div className="kr-side">
          <div className="kr-pill">
            <span className={left < 30 ? 'kr-time--low' : ''}>{clock}</span>
            <span>
              {score}
              <small> pts</small>
            </span>
            {lag && <span title="slow connection">📶</span>}
          </div>
          <button className="kr-icon" onClick={() => setSettings((s) => !s)} aria-label="kitchen settings" aria-expanded={settings}>
            ⚙
          </button>
          <button className="kr-icon" onClick={() => useKitchen.getState().exit()} aria-label="leave kitchen">
            ✕
          </button>
        </div>
      </div>
      {hint && phase === 'playing' && (
        <div className="kr-walkthrough">
          <b>How to cook</b>
          <span>1. Grab ingredients from crates.</span>
          <span>2. Put them on a board and hold <kbd>E</kbd> / chop.</span>
          <span>3. Soups need 3 same chopped items in the pot. Salads go straight on a plate.</span>
          <span>4. Plate it, then bring it to the window.</span>
          <button onClick={() => { setHint(false); saveKitchenHintSeen(); }}>Got it</button>
        </div>
      )}
      {settings && (
        <label className="kr-settings">
          <input type="checkbox" checked={joystick} onChange={(e) => setJoystick(e.target.checked)} />
          drag on the floor to steer (joystick)
        </label>
      )}
      {phase === 'joining' && <div className="kr-note">opening the kitchen…</div>}
      {reconnecting && <div className="kr-note">reconnecting…</div>}
      {shownNote && <div className="kr-note kr-note--pop">{shownNote}</div>}
    </>
  );
}

function TouchPad({ round, dashAt, onDash }: { round: KitchenRound; dashAt: number; onDash: () => void }) {
  const [coarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const [chopping, setChopping] = useState(false);
  const cooling = useNow(200) - dashAt < 1000;
  const [chopHold] = useState(() =>
    holdButton((on) => {
      setChopping(on);
      round.controls.setUse(on);
    }),
  );
  if (!coarse) return null;

  return (
    <div className="kr-touch">
      <button
        className={`kr-btn kr-btn--dash ${cooling ? 'kr-btn--cool' : ''}`}
        key={`dash-${dashAt}`}
        onPointerDown={() => {
          if (cooling) return;
          round.controls.pilot.cancel();
          round.controls.pressDash();
          ksfx.dash();
          onDash();
        }}
      >
        dash
      </button>
      <button
        className={`kr-btn kr-btn--chop ${chopping ? 'kr-btn--on' : ''}`}
        {...chopHold}
      >
        chop
      </button>
      <button className="kr-btn kr-btn--grab" onPointerDown={() => round.controls.pressGrab()}>
        grab
      </button>
    </div>
  );
}

function Results() {
  const result = useKitchen((s) => s.result);
  const setCoins = useAppStore((s) => s.setCoins);

  // the round paid out on the server: refresh the world wallet
  useEffect(() => {
    if (!result) return;
    let live = true;
    fetchInventory()
      .then((inv) => {
        if (live && inv) setCoins(inv.coins);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [result, setCoins]);

  if (!result) return null;
  return (
    <div className="kr-result" role="dialog" aria-label="round results">
      <div className="kr-result__card">
        <h2>time's up!</h2>
        <p className="kr-stars" aria-label={`${result.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`kr-star ${i < result.stars ? 'kr-star--on' : ''}`} style={{ animationDelay: `${0.25 + i * 0.3}s` }}>
              ★
            </span>
          ))}
        </p>
        <p>
          score <b>{result.score}</b> · served {result.served} · missed {result.failed}
        </p>
        {result.earned > 0 && <p className="kr-earned">+{result.earned} coins</p>}
        <div className="kr-result__btns">
          <button className="btn" onClick={() => useKitchen.getState().playAgain()}>
            play again
          </button>
          <button className="btn" onClick={() => useKitchen.getState().exit()}>
            back to the kitchen
          </button>
        </div>
      </div>
    </div>
  );
}
