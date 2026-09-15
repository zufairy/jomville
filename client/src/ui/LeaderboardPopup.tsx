import { KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store';
import { AvatarPreview } from './AvatarPreview';
import { AvatarHead } from './AvatarHead';
import { CoinIcon } from './Icon';
import { isTypingTarget } from './typingTarget';
import { isTopModal, popModal, pushModal } from './modalStack';
import { isMyRow, medalForRank, myRankText, popupBarState, staggerMs } from './leaderboardFooter';
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
  setHideRank,
} from '../leaderboards';
import './leaderboard-popup.css';

/** In-game names for the boards; the /leaderboards page keeps its own TABS labels. */
const TAB_LABEL: Record<Tab, string> = { coins: 'Coins', assets: 'Assets', time: 'Online time' };
const CLOSE_MS = 160;
/** Podium entrance order: bronze, then silver, then the champion. Indexed by list position. */
const PODIUM_DELAY = [260, 130, 0];
const LIST_BASE_DELAY = 180;

function Value({ k, value }: { k: BoardKey; value: number }) {
  return (
    <span className="lbp-value">
      {isTimeBoard(k) ? <span aria-hidden="true">⏱</span> : <CoinIcon size={16} />}
      {formatValue(k, value)}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="lbp-skeleton" aria-hidden="true">
      <div className="lbp-skeleton__podium">
        <i className="lbp-skel lbp-skel--p2" />
        <i className="lbp-skel lbp-skel--p1" />
        <i className="lbp-skel lbp-skel--p3" />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className="lbp-skel lbp-skel--row" />
      ))}
    </div>
  );
}

/** Game-card leaderboard over the room: the player never leaves. Lazy-loaded by RoomBar. */
export function LeaderboardPopup({ onClose }: { onClose: () => void }) {
  const avatar = useAppStore((s) => s.avatar);
  const [boards, setBoards] = useState<Boards | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('coins');
  const [span, setSpan] = useState<TimeSpan>('week');
  const [me, setMe] = useState<MyRanks | null>(null);
  const [meChecked, setMeChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggleError, setToggleError] = useState(false);
  const [closing, setClosing] = useState(false);

  const card = useRef<HTMLDivElement>(null);
  const modalId = useRef<symbol>(Symbol('leaderboard'));
  const aliveRef = useRef(true);
  const requestIdRef = useRef(0);
  const closeTimer = useRef<number | undefined>(undefined);

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

  const requestClose = () => {
    if (closeTimer.current !== undefined) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    aliveRef.current = true;
    const id = modalId.current;
    pushModal(id);
    card.current?.focus();
    load();
    return () => {
      aliveRef.current = false;
      popModal(id);
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc when focus has wandered outside the card (e.g. to <body>); inside, onKeyDown handles it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTypingTarget(e.target) || !isTopModal(modalId.current)) return;
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Keys pressed inside the popup belong to it, never to the room behind.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (!isTypingTarget(e.target) && isTopModal(modalId.current)) requestClose();
      return;
    }
    if (e.key === 'Tab' && card.current) {
      const f = card.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])');
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === card.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const key = boardKey(tab, span);
  const rows = boards?.[key] ?? [];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const hidden = me !== null && me.hidden === true;
  const bar = popupBarState(me, meChecked);

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

  return createPortal(
    <div
      className={`lbp${closing ? ' lbp--closing' : ''}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) requestClose();
      }}
      onKeyDown={onKeyDown}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div ref={card} className="lbp__card" role="dialog" aria-modal="true" aria-labelledby="lbp-title" tabIndex={-1}>
        <header className="lbp__head">
          <h2 id="lbp-title" className="lbp__title">
            <span aria-hidden="true">🏆</span> Leaderboard
          </h2>
          <button type="button" className="lbp__x" onClick={requestClose} aria-label="Close leaderboard">
            ✕
          </button>
        </header>

        <div className="lbp__tabs" role="group" aria-label="Leaderboard category">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} className="lbp-tab" onClick={() => setTab(t.id)}>
              {TAB_LABEL[t.id]}
            </button>
          ))}
        </div>
        {tab === 'time' && (
          <div className="lbp__spans" role="group" aria-label="Time range">
            {SPANS.map((s) => (
              <button key={s.id} type="button" aria-pressed={span === s.id} className="lbp-span" onClick={() => setSpan(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="lbp__scroll">
          {error ? (
            <div className="lbp-empty" role="alert">
              <span className="lbp-empty__icon" aria-hidden="true">😵</span>
              <p>Couldn't load the leaderboard.</p>
              <button type="button" className="lbp-btn" onClick={() => load(true)}>
                Try again
              </button>
            </div>
          ) : !boards ? (
            <>
              <span className="lbp-sr">Loading leaderboard…</span>
              <Skeleton />
            </>
          ) : rows.length === 0 ? (
            <div className="lbp-empty">
              <span className="lbp-empty__icon" aria-hidden="true">🌱</span>
              <p>No one's here yet. Be the first!</p>
            </div>
          ) : (
            <div className="lbp-board" key={key}>
              <ol className="lbp-podium" aria-label="Top 3">
                {top.map((r, i) => {
                  const medal = medalForRank(r.rank);
                  return (
                    <li
                      key={r.handle}
                      className={`lbp-spot lbp-spot--p${i + 1}${medal ? ` lbp-spot--${medal}` : ''}${isMyRow(r, me) ? ' lbp-spot--me' : ''}`}
                      style={{ animationDelay: `${PODIUM_DELAY[i]}ms` }}
                    >
                      {r.rank === 1 && (
                        <span className="lbp-crown" aria-hidden="true">
                          👑
                        </span>
                      )}
                      <span className="lbp-spot__avatar">
                        <AvatarHead avatar={r.avatar} scale={i === 0 ? 2 : 1.6} className="lbp-head" />
                      </span>
                      <span className="lbp-spot__handle">{r.handle}</span>
                      <Value k={key} value={r.value} />
                      <span className="lbp-block">
                        <span className="lbp-sr">rank </span>
                        {r.rank}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {rest.length > 0 && (
                <ol className="lbp-list" start={4}>
                  {rest.map((r, i) => (
                    <li
                      key={r.handle}
                      className={`lbp-row${isMyRow(r, me) ? ' lbp-row--me' : ''}`}
                      style={{ animationDelay: `${LIST_BASE_DELAY + staggerMs(i)}ms` }}
                    >
                      <span className="lbp-rank">
                        <span className="lbp-sr">rank </span>
                        {r.rank}
                      </span>
                      <span className="lbp-avatar">
                        <AvatarHead avatar={r.avatar} scale={1.1} className="lbp-head" />
                      </span>
                      <span className="lbp-handle">{r.handle}</span>
                      <Value k={key} value={r.value} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {bar === 'ranked' && me && !me.hidden && (
          <div className="lbp-me" aria-live="polite">
            <span className="lbp-me__rank">
              <small>You</small>
              {myRankText(me, key)}
            </span>
            <span className="lbp-avatar lbp-avatar--me">
              <AvatarPreview cfg={avatar} focus="head" animate={false} fx={false} scale={1.1} className="lbp-head" />
            </span>
            <span className="lbp-handle">{me.handle}</span>
            <Value k={key} value={me[key].value} />
          </div>
        )}

        {bar === 'hidden' && (
          <div className="lbp-me lbp-me--hidden" aria-live="polite">
            <span className="lbp-me__hidden">
              <span aria-hidden="true">🙈</span> You're hidden from the boards
            </span>
            <button type="button" role="switch" aria-checked={false} className="lbp-btn lbp-btn--sm" disabled={saving} onClick={toggleHide}>
              {saving ? 'Saving…' : 'Show me'}
            </button>
            {toggleError && <span className="lbp-me__err">Couldn't save. Please try again.</span>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
