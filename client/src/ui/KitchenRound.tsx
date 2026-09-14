import { useEffect, useRef, useState } from 'react';
import { kitchen } from '@dovey/shared';
import { KitchenRound } from '../kitchen/net';
import { CHEF_COLORS, drawKitchen } from '../kitchen/draw';
import { dishName, useKitchen } from '../kitchen/store';
import { orderLeft } from '../kitchen/view';
import { setGamePaused } from '../game/instance';

const TOP_PAD = 86;

export function KitchenRoundUI() {
  const phase = useKitchen((s) => s.phase);
  const roomId = useKitchen((s) => s.roomId);
  if (phase === 'off' || !roomId) return null;
  return <RoundScreen roomId={roomId} />;
}

function RoundScreen({ roomId }: { roomId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [round, setRound] = useState<KitchenRound | null>(null);

  useEffect(() => {
    const r = new KitchenRound();
    setRound(r);
    setGamePaused(true);
    const detach = r.controls.attach(window);
    r.join(roomId).catch(() => useKitchen.getState().lost());
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const view = r.view;
      if (!canvas || !view) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      r.predictor?.frame(now - last);
      last = now;
      const chefs = view.chefs.map((c, i) => {
        const pose = (c.id === r.me ? r.predictor?.pose() : r.interp.sample(c.id, now)) ?? c;
        return { ...c, x: pose.x, y: pose.y, fx: pose.fx, fy: pose.fy, name: r.names[c.id] ?? 'chef', color: CHEF_COLORS[i % CHEF_COLORS.length], away: r.away.has(c.id), me: c.id === r.me };
      });
      drawKitchen(ctx, view, chefs, cssW, cssH, TOP_PAD, now);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      detach();
      r.leave();
      setGamePaused(false);
    };
  }, [roomId]);

  return (
    <div className="kr" role="application" aria-label="kitchen round">
      <canvas ref={canvasRef} className="kr__canvas" />
      <Hud />
      {round && <TouchPad round={round} />}
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

function Hud() {
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

  useEffect(() => {
    if (!note) return;
    setShownNote(note);
    const t = setTimeout(() => setShownNote(null), 1800);
    return () => clearTimeout(t);
  }, [note]);

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
            return (
              <div key={o.id} className={`kr-order ${l < kitchen.ORDER_WARN ? 'kr-order--late' : ''}`}>
                <span>{dishName(o.dish)}</span>
                <i style={{ width: `${(l / o.total) * 100}%` }} />
              </div>
            );
          })}
        </div>
        <div className="kr-stats">
          <b className="kr-time">{clock}</b>
          <b>{score}</b>
          {streak > 1 && <em>x{streak}</em>}
          {lag && <span title="slow connection">📶</span>}
          <button className="kr-leave" onClick={() => useKitchen.getState().exit()} aria-label="leave kitchen">
            ✕
          </button>
        </div>
      </div>
      {phase === 'joining' && <div className="kr-note">opening the kitchen…</div>}
      {reconnecting && <div className="kr-note">reconnecting…</div>}
      {shownNote && <div className="kr-note kr-note--pop">{shownNote}</div>}
    </>
  );
}

function TouchPad({ round }: { round: KitchenRound }) {
  const [coarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const stickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  if (!coarse) return null;

  const move = (e: React.PointerEvent) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (e.clientX - (r.left + rad)) / rad;
    let dy = (e.clientY - (r.top + rad)) / rad;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setKnob({ x: dx, y: dy });
    round.controls.setStick(dx, dy);
  };
  const release = () => {
    setKnob({ x: 0, y: 0 });
    round.controls.setStick(0, 0);
  };

  return (
    <div className="kr-touch">
      <div
        ref={stickRef}
        className="kr-stick"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <i style={{ transform: `translate(${knob.x * 32}px, ${knob.y * 32}px)` }} />
      </div>
      <div className="kr-btns">
        <button className="kr-btn" onPointerDown={() => round.controls.pressDash()}>
          dash
        </button>
        <button className="kr-btn" onPointerDown={() => round.controls.setUse(true)} onPointerUp={() => round.controls.setUse(false)} onPointerCancel={() => round.controls.setUse(false)}>
          chop
        </button>
        <button className="kr-btn kr-btn--big" onPointerDown={() => round.controls.pressGrab()}>
          grab
        </button>
      </div>
    </div>
  );
}

function Results() {
  const result = useKitchen((s) => s.result);
  if (!result) return null;
  return (
    <div className="kr-result" role="dialog" aria-label="round results">
      <div className="kr-result__card">
        <h2>time's up!</h2>
        <p className="kr-stars">{[0, 1, 2].map((i) => (i < result.stars ? '★' : '☆')).join(' ')}</p>
        <p>
          score <b>{result.score}</b> · served {result.served} · missed {result.failed}
        </p>
        {result.earned > 0 && <p>+{result.earned} coins</p>}
        <button className="btn" onClick={() => useKitchen.getState().exit()}>
          back to the kitchen
        </button>
      </div>
    </div>
  );
}
