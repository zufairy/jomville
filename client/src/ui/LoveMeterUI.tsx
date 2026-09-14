import { useEffect, useState } from 'react';
import { LOVE_ROOM, loveLabel } from '@dovey/shared';
import { love, loveLeft, useLove } from '../love';
import { useAppStore } from '../store';

function useTicker(on: boolean, ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [on, ms]);
}

const clock = (ms: number) => `0:${String(Math.ceil(ms / 1000)).padStart(2, '0')}`;

/** Count-up heart card everyone in the room sees when a couple's score lands. */
function Reveal({ ah, bh, score }: { ah: string; bh: string; score: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 2600);
      setN(Math.round(score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  const done = n === score;
  return (
    <div className={`love-reveal ${done ? 'love-reveal--done' : ''}`} role="status" aria-live="polite">
      <div className="love-reveal__names">
        {ah} <span className="love-reveal__beat">💘</span> {bh}
      </div>
      <div className="love-reveal__heart">
        <div className="love-reveal__fill" style={{ height: `${n}%` }} />
        <span className="love-reveal__pct">{n}%</span>
      </div>
      <div className="love-reveal__label">{done ? loveLabel(score) : 'measuring…'}</div>
    </div>
  );
}

/**
 * Love Meter HUD: live banner + result ticker on top, the reveal card, and the
 * join / queue / matched card above the chat bar. Only renders in that room.
 */
export function LoveMeterUI() {
  const room = useAppStore((s) => s.room);
  const sid = useAppStore((s) => s.sessionId);
  const snap = useLove((s) => s.snap);
  const pair = snap?.pair ?? null;
  const mine = !!pair && !!sid && (pair.a === sid || pair.b === sid);
  useTicker(!!pair && pair.phase !== 'reveal');
  if (room?.slug !== LOVE_ROOM.slug || !snap) return null;

  const [boys, girls] = snap.lanes;
  const side = sid && boys.includes(sid) ? 0 : sid && girls.includes(sid) ? 1 : null;
  const pos = side === null || !sid ? -1 : snap.lanes[side].indexOf(sid);
  const partner = pair ? (pair.a === sid ? pair.bh : pair.ah) : '';
  const left = loveLeft();

  return (
    <>
      <div className="love-top">
        {pair && pair.phase !== 'reveal' ? (
          <div className="love-live">
            <span className="love-live__dot" /> LIVE <b>{pair.ah}</b> 💘 <b>{pair.bh}</b>
            <span className="love-live__t">{pair.phase === 'ready' ? 'starting…' : clock(left)}</span>
          </div>
        ) : (
          <div className="love-live love-live--idle">
            💘 LOVE METER
            <span className="love-q">💙 {boys.length}</span>
            <span className="love-q">💗 {girls.length}</span>
          </div>
        )}
        {snap.recent.length > 0 && pair?.phase !== 'reveal' && (
          <div className="love-feed">
            {snap.recent.slice(0, 3).map((r, i) => (
              <span key={`${r.ah}:${r.bh}:${i}`} className="love-feed__item">
                {r.ah} + {r.bh} <b>{r.score}%</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {pair?.phase === 'reveal' && pair.score !== null && <Reveal key={`${pair.a}:${pair.b}`} ah={pair.ah} bh={pair.bh} score={pair.score} />}

      <div className="love-dock">
        {mine && pair?.phase === 'ready' ? (
          <div className="love-card love-card--match">
            <div className="love-card__title">
              💘 matched with <b>{partner}</b>!
            </div>
            <div className="love-card__fine">video call starts in {Math.ceil(left / 1000)}s · allow camera + mic</div>
            <button className="love-btn love-btn--ghost" onClick={() => love.leave()}>
              skip
            </button>
          </div>
        ) : mine ? null : side !== null ? (
          <div className="love-card">
            <div className="love-card__title">
              you're <b>#{pos + 1}</b> in the {side === 0 ? '💙 boys' : '💗 girls'} line
            </div>
            <div className="love-card__fine">
              {(side === 0 ? girls : boys).length ? 'your match is on the way…' : 'waiting for someone in the other line…'}
            </div>
            <button className="love-btn love-btn--ghost" onClick={() => love.leave()}>
              leave line
            </button>
          </div>
        ) : (
          <div className="love-card love-card--join">
            <div className="love-card__title">get matched · talk 30s · see your love %</div>
            <div className="love-card__btns">
              <button className="love-btn love-btn--blue" onClick={() => love.join(0)}>
                💙 boys line <small>{boys.length}</small>
              </button>
              <button className="love-btn love-btn--pink" onClick={() => love.join(1)}>
                💗 girls line <small>{girls.length}</small>
              </button>
            </div>
            <div className="love-card__fine">joining starts a video call with the next person in the other line. hang up or walk away anytime.</div>
          </div>
        )}
      </div>
    </>
  );
}

/** Countdown badge inside the call window during a Love Meter call. */
export function LoveCallTimer() {
  const sid = useAppStore((s) => s.sessionId);
  const pair = useLove((s) => s.snap?.pair ?? null);
  const live = !!pair && !!sid && (pair.a === sid || pair.b === sid) && pair.phase !== 'reveal';
  useTicker(live);
  if (!live || !pair) return null;
  const left = loveLeft();
  const hurry = pair.phase === 'call' && left < 5000;
  return <div className={`call__love ${hurry ? 'call__love--hurry' : ''}`}>💘 {pair.phase === 'ready' ? 'get ready' : `${Math.ceil(left / 1000)}s`}</div>;
}
