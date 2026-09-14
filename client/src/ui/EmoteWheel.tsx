import { useEffect, useState } from 'react';
import { EMOTES } from '@dovey/shared';
import { useAppStore } from '../store';


export function EmoteWheel() {
  const [open, setOpen] = useState(false);
  const actions = useAppStore((s) => s.actions);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.emote')) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className={`emote ${open ? 'emote--open' : ''}`}>
      <div className="emote__tray" role="menu">
      {EMOTES.map((e, i) => (
          <button
            key={e}
            className="emote__item"
            style={{ transitionDelay: open ? `${i * 18}ms` : '0ms' }}
            onPointerDown={(ev) => {
              ev.preventDefault();
              actions?.emote(i); // wheel stays open: emotes are spammable by design
            }}
            aria-label={`emote ${i + 1}`}
            tabIndex={open ? 0 : -1}
          >
            {e}
          </button>
      ))}
      </div>
      <button
        className="emote__toggle"
        onPointerDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        aria-label="emotes"
        aria-expanded={open}
      >
        {open ? '✕' : '😊'}
      </button>
    </div>
  );
}
