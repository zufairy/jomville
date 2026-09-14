import { useEffect, useRef, useState } from 'react';
import { CallInfo } from '../call';
import { useAppStore } from '../store';
import { LoveCallTimer } from './LoveMeterUI';

function VideoSlot({ el, mirror, label }: { el: HTMLVideoElement; mirror?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.appendChild(el);
    el.play().catch(() => {});
    return () => {
      if (el.parentElement === host) host.removeChild(el);
    };
  }, [el]);
  return <div ref={ref} className={`call__video ${mirror ? 'call__video--mirror' : ''}`} aria-label={label} />;
}

function Ring({ icon, live }: { icon: string; live?: boolean }) {
  return (
    <div className={`ring ${live ? 'ring--live' : ''}`}>
      <span className="ring__wave" />
      {!live && <span className="ring__wave ring__wave--2" />}
      <span className="ring__icon">{icon}</span>
    </div>
  );
}

const END_ANIM_MS = 350;

/**
 * Renders the call state. Keeps the last non-idle state mounted briefly so the
 * panel can animate out, then shows a "call ended" chip.
 */
export function CallUI() {
  const call = useAppStore((s) => s.call);
  const actions = useAppStore((s) => s.actions);
  const [shown, setShown] = useState<CallInfo>(call);
  const [ending, setEnding] = useState(false);
  const [endedChip, setEndedChip] = useState(false);
  const [connectedChip, setConnectedChip] = useState(false);
  const prevPhase = useRef(call.phase);

  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = call.phase;
    if (call.phase === 'idle' && prev !== 'idle') {
      // animate out, then unmount
      setEnding(true);
      const t = setTimeout(() => {
        setEnding(false);
        setShown(call);
        if (prev === 'active') {
          setEndedChip(true);
          setTimeout(() => setEndedChip(false), 1700);
        }
      }, END_ANIM_MS);
      return () => clearTimeout(t);
    }
    if (call.phase === 'active' && prev !== 'active') {
      setConnectedChip(true);
      const t = setTimeout(() => setConnectedChip(false), 2800);
      setShown(call);
      return () => clearTimeout(t);
    }
    setShown(call);
  }, [call]);

  if (!actions) return null;
  const c = ending ? shown : call;

  if (c.phase === 'idle') return endedChip ? <div className="callend">📵 call ended</div> : null;

  if (c.phase === 'ringing_in') {
    return (
      <div className={`callsheet callsheet--in ${ending ? 'callsheet--closing' : ''}`} role="dialog" aria-label="incoming call">
        <Ring icon={c.video ? '📹' : '🎙'} />
        <div className="callsheet__who">{c.handle}</div>
        <div className="callsheet__what">wants to {c.video ? 'video' : 'voice'} call</div>
        <div className="callsheet__btns">
          <button className="btn btn--danger callsheet__big" onClick={() => actions.callDecline()}>
            ✕ no thanks
          </button>
          <button className="btn btn--go callsheet__big" onClick={() => actions.callAccept()}>
            ✓ accept
          </button>
        </div>
      </div>
    );
  }

  if (c.phase === 'ringing_out' || c.phase === 'connecting') {
    return (
      <div className={`callsheet ${ending ? 'callsheet--closing' : ''}`} role="dialog" aria-label="calling">
        <Ring icon={c.video ? '📹' : '🎙'} />
        <div className="callsheet__who">{c.handle}</div>
        <div className="callsheet__what">{c.phase === 'connecting' ? 'connecting…' : 'ringing…'}</div>
        {c.phase === 'connecting' && <div className="callsheet__hint">if your browser asks, allow the {c.video ? 'camera and mic' : 'mic'}</div>}
        <div className="callsheet__btns">
          <button className="btn btn--danger callsheet__big" onClick={() => actions.callHangup()}>
            ✕ cancel
          </button>
        </div>
      </div>
    );
  }

  const els = actions.callVideoEls();
  return (
    <div className={`call ${c.video ? 'call--video' : 'call--voice'} ${ending ? 'call--ending' : ''}`}>
      {c.video ? (
        <>
          <VideoSlot el={els.remote} label="their video" />
          <div className="call__pip">
            <VideoSlot el={els.local} mirror label="your video" />
          </div>
        </>
      ) : (
        <div className="call__voice">
          <VideoSlot el={els.remote} label="their audio" />
          <Ring icon="🎙" live />
          <span className="callsheet__who">{c.handle}</span>
        </div>
      )}
      {connectedChip && <span className="call__connected">● connected</span>}
      <LoveCallTimer />
      <div className="call__bar">
        <button className={`hud__btn ${c.micOn ? '' : 'hud__btn--off'}`} onClick={() => actions.callToggleMic()} aria-label="toggle mic">
          {c.micOn ? '🎙' : '🔇'}
        </button>
        {c.video && (
          <button className={`hud__btn ${c.camOn ? '' : 'hud__btn--off'}`} onClick={() => actions.callToggleCam()} aria-label="toggle camera">
            {c.camOn ? '📹' : '🚫'}
          </button>
        )}
        <button className="call__end" onClick={() => actions.callHangup()} aria-label="end call">
          📵 end
        </button>
      </div>
    </div>
  );
}
