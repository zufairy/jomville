import { useEffect, useRef, useState } from 'react';
import { confirmAdult } from '../api';
import { useAdultGate } from '../adultGate';
import { useAppStore } from '../store';
import './friend-call.css';

/** One-time 18+ confirmation before calling someone who is not a friend. */
export function AdultGate() {
  const pending = useAdultGate((s) => s.pending);
  const close = useAdultGate((s) => s.close);
  const [saving, setSaving] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const yes = async () => {
    if (!pending) return;
    setSaving(true);
    const ok = await confirmAdult();
    setSaving(false);
    if (!ok) return useAppStore.getState().flash('Something went wrong. Try again.');
    const p = pending;
    close();
    useAppStore.getState().actions?.callInvite(p.peer, p.handle, p.video);
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' && !saving) void yes();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, saving]);

  // focus the primary action on open, restore whatever had focus before on close
  useEffect(() => {
    if (!pending) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    return () => {
      restoreFocus.current?.focus?.();
      restoreFocus.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pending]);

  if (!pending) return null;

  return (
    <div className="fcall-adult" role="dialog" aria-label="age confirmation">
      <p>
        Calling someone who is not a friend is 18+ only. Friends can call each other without confirming.
      </p>
      <div className="fcall-adult__btns">
        <button ref={confirmRef} className="btn btn--primary" disabled={saving} onClick={() => void yes()}>
          I am 18 or older
        </button>
        <button className="btn" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  );
}
