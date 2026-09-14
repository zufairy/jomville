import { useEffect, useMemo, useRef, useState } from 'react';
import { parseAvatar } from '@dovey/shared';
import { AvatarPreview } from './AvatarPreview';
import { CoinIcon } from './Icon';
import { storedToken } from '../identity';
import { footerState } from './leaderboardFooter';
import {
  BoardKey,
  Boards,
  MyRanks,
  SPANS,
  TABS,
  Tab,
  TimeSpan,
  boardKey,
  fetchBoards,
  fetchMyRanks,
  formatValue,
  isTimeBoard,
  rankLabel,
  setHideRank,
} from '../leaderboards';
import './leaderboards.css';

const MEDALS = ['gold', 'silver', 'bronze'] as const;

function Head({ avatar, scale }: { avatar: string; scale: number }) {
  const cfg = useMemo(() => parseAvatar(avatar), [avatar]);
  return <AvatarPreview cfg={cfg} focus="head" animate={false} fx={false} scale={scale} className="lb-head" />;
}

function Value({ k, value }: { k: BoardKey; value: number }) {
  return (
    <span className="lb-value">
      {!isTimeBoard(k) && <CoinIcon size={16} />}
      {formatValue(k, value)}
    </span>
  );
}

/** Public rankings at /leaderboards: coins, furniture value, and time spent lepak. */
export function Leaderboards() {
  const [boards, setBoards] = useState<Boards | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('coins');
  const [span, setSpan] = useState<TimeSpan>('week');
  const [me, setMe] = useState<MyRanks | null>(null);
  const [meChecked, setMeChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggleError, setToggleError] = useState(false);

  // Guards against setting state after unmount, and against a stale response
  // (e.g. a retry fired before an earlier request resolved) clobbering newer state.
  const aliveRef = useRef(true);
  const requestIdRef = useRef(0);
  useEffect(() => () => {
    aliveRef.current = false;
  }, []);

  const load = (fresh = false) => {
    const id = ++requestIdRef.current;
    setError(false);
    fetchBoards(fresh).then(
      (b) => {
        if (aliveRef.current && requestIdRef.current === id) setBoards(b);
      },
      () => {
        if (aliveRef.current && requestIdRef.current === id) setError(true);
      },
    );
    fetchMyRanks().then((m) => {
      if (aliveRef.current && requestIdRef.current === id) {
        setMe(m);
        setMeChecked(true);
      }
    });
  };

  useEffect(() => {
    document.title = 'Rankings · Leypark';
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = boardKey(tab, span);
  const rows = boards?.[key] ?? [];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const hidden = me !== null && me.hidden === true;
  const myRank = me !== null && !me.hidden ? me[key].rank : null;
  const footer = footerState(storedToken(), me, meChecked);

  const toggleHide = async () => {
    setSaving(true);
    setToggleError(false);
    const ok = await setHideRank(!hidden);
    if (!aliveRef.current) return;
    setSaving(false);
    if (!ok) {
      setToggleError(true);
      return;
    }
    load(true);
  };

  return (
    <div className="lb">
      <header className="lb-top">
        <a className="lb-brand" href="/" aria-label="Leypark home">
          <img
            src="/leypark-mark.svg"
            alt=""
            width={32}
            height={32}
            onError={(e) => {
              e.currentTarget.hidden = true;
            }}
          />
          <span>Leypark</span>
        </a>
        <a className="lb-play" href="/play">
          Play now
        </a>
      </header>

      <main className="lb-wrap">
        <div className="lb-lights" aria-hidden="true" />
        <h1 className="lb-title">Leypark Rankings</h1>
        <p className="lb-sub">Who's topping the charts tonight?</p>

        <div className="lb-tabs" role="group" aria-label="Leaderboard category">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              className={`lb-tab ${tab === t.id ? 'lb-tab--on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'time' && (
          <div className="lb-spans" role="group" aria-label="Time range">
            {SPANS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={span === s.id}
                className={`lb-span ${span === s.id ? 'lb-span--on' : ''}`}
                onClick={() => setSpan(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <div className="lb-empty">
            <p>Couldn't load the rankings. Please try again.</p>
            <button type="button" className="lb-retry" onClick={() => load(true)}>
              Retry
            </button>
          </div>
        ) : !boards ? (
          <p className="lb-empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="lb-empty">No one's here yet. Be the first!</p>
        ) : (
          <>
            <ol className="lb-podium">
              {top.map((r, i) => (
                <li
                  key={r.handle}
                  className={`lb-stall lb-stall--${MEDALS[i]}${r.rank === myRank ? ' lb-stall--me' : ''}`}
                >
                  <span className="lb-medal">#{r.rank}</span>
                  <Head avatar={r.avatar} scale={3} />
                  <span className="lb-handle">{r.handle}</span>
                  <Value k={key} value={r.value} />
                </li>
              ))}
            </ol>
            {rest.length > 0 && (
              <ol className="lb-list">
                {rest.map((r) => (
                  <li key={r.handle} className={`lb-row${r.rank === myRank ? ' lb-row--me' : ''}`}>
                    <span className="lb-rank">#{r.rank}</span>
                    <Head avatar={r.avatar} scale={1.5} />
                    <span className="lb-handle">{r.handle}</span>
                    <Value k={key} value={r.value} />
                  </li>
                ))}
              </ol>
            )}
            <p className="lb-updated">Updated {new Date(boards.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
          </>
        )}

        {footer === 'cta' && (
          <section className="lb-me lb-me--cta">
            <span className="lb-me__rank">Play Leypark to get ranked!</span>
            <a className="lb-cta" href="/play">
              Play now
            </a>
          </section>
        )}

        {footer === 'hidden' && (
          <section className="lb-me" aria-live="polite">
            <span className="lb-me__rank">You're hidden from the boards</span>
            <label className="lb-me__hide">
              <input type="checkbox" checked={hidden} disabled={saving} onChange={toggleHide} />
              Show me on the leaderboard
            </label>
            {toggleError && <span className="lb-me__err">Couldn't save. Please try again.</span>}
          </section>
        )}

        {footer === 'ranked' && (
          <section className="lb-me" aria-live="polite">
            <span className="lb-me__rank">{rankLabel(me, key)}</span>
            <label className="lb-me__hide">
              <input type="checkbox" checked={hidden} disabled={saving} onChange={toggleHide} />
              Hide me from the leaderboard
            </label>
            {toggleError && <span className="lb-me__err">Couldn't save. Please try again.</span>}
          </section>
        )}
      </main>
    </div>
  );
}
