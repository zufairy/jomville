import { ReactNode, useEffect, useRef, useState } from 'react';
import { exitIntent } from './vipModal';

interface VipModalProps {
  title: ReactNode;
  /** accessible name for the dialog */
  label: string;
  /** a match is in progress: leaving asks first */
  live?: boolean;
  onExit: () => void;
  exitLabel?: string;
  headerExtra?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

/** Premium neon-arcade shell shared by every game popup: ✕ in the header, Exit Game in the footer. */
export function VipModal({ title, label, live = false, onExit, exitLabel = 'exit game', headerExtra, wide, children }: VipModalProps) {
  const [confirming, setConfirming] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  const act = (source: 'x' | 'exit' | 'key' | 'backdrop', key?: string) => {
    const i = exitIntent({ live, confirming, source, key });
    if (i === 'close') {
      setConfirming(false);
      onExit();
    } else if (i === 'confirm') setConfirming(true);
    else if (i === 'cancel-confirm') setConfirming(false);
  };

  // re-bound every render so the handler sees current live/confirming
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      act('key', e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    card.current?.focus();
  }, []);

  useEffect(() => {
    if (!live) setConfirming(false);
  }, [live]);

  return (
    <div className="vip" onPointerDown={(e) => e.target === e.currentTarget && act('backdrop')}>
      <div ref={card} tabIndex={-1} className={`vip__card ${wide ? 'vip__card--wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="vip__trim" aria-hidden />
        <header className="vip__head">
          <h2 className="vip__title">{title}</h2>
          {headerExtra}
          <button className="vip__x" onClick={() => act('x')} aria-label="close">
            ✕
          </button>
        </header>
        <div className="vip__body">{children}</div>
        <footer className="vip__foot">
          <button className="vip__exit" onClick={() => act('exit')}>
            {exitLabel}
          </button>
        </footer>
        {confirming && (
          <div className="vip__confirm" role="alertdialog" aria-label="leave the match?">
            <div className="vip__confirm-card">
              <div className="vip__confirm-title">leave the match?</div>
              <p className="vip__confirm-sub">you'll forfeit this game.</p>
              <div className="vip__confirm-btns">
                <button className="vip__btn vip__btn--danger" onClick={() => act('exit')}>
                  leave
                </button>
                <button className="vip__btn" onClick={() => setConfirming(false)}>
                  stay
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
