import { useEffect, useMemo, useRef, useState } from 'react';
import { REPORT_REASONS, parseAvatar } from '@dovey/shared';
import { clampPos, friendCall, useFriendCall } from '../friendCall';
import { AvatarPreview } from './AvatarPreview';
import './friend-call.css';

const POS_KEY = 'leypark.fcall.pos';

function loadPos(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? '');
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
  } catch {
    /* default below */
  }
  return { x: window.innerWidth - 240, y: 90 };
}

function savePos(p: { x: number; y: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function Slot({ el, mirror }: { el: HTMLVideoElement; mirror?: boolean }) {
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
  return <div ref={ref} className={`fcall-win__video ${mirror ? 'fcall-win__video--mirror' : ''}`} />;
}

/** Floating, draggable call window (collapses to a bubble). Stays up while walking and across room changes. */
export function FriendCallWindow() {
  const phase = useFriendCall((s) => s.phase);
  const peer = useFriendCall((s) => s.peer);
  const video = useFriendCall((s) => s.video);
  const micOn = useFriendCall((s) => s.micOn);
  const camOn = useFriendCall((s) => s.camOn);
  const remoteHasVideo = useFriendCall((s) => s.remoteHasVideo);
  const collapsed = useFriendCall((s) => s.collapsed);
  const [pos, setPos] = useState(loadPos);
  const [reporting, setReporting] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number; id: number; moved: boolean } | null>(null);
  const cfg = useMemo(() => (peer ? parseAvatar(peer.avatar) : null), [peer]);

  useEffect(() => {
    const onResize = () => {
      const r = box.current?.getBoundingClientRect();
      if (r) setPos((p) => clampPos(p, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (phase === 'idle' || phase === 'ringing_in') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (reporting) setReporting(false);
      else if (!collapsed) friendCall.setCollapsed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, reporting, collapsed]);

  if (phase === 'idle' || phase === 'ringing_in' || !peer || !cfg) return null;

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, id: e.pointerId, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.moved = true;
    const r = box.current?.getBoundingClientRect();
    setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, { w: r?.width ?? 220, h: r?.height ?? 160 }, { w: window.innerWidth, h: window.innerHeight }));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    savePos(pos);
    if (!d.moved && collapsed) friendCall.setCollapsed(false);
  };

  const status =
    phase === 'ringing_out' ? 'Calling…' : phase === 'connecting' ? 'Connecting…' : phase === 'rejoining' ? 'Reconnecting…' : null;
  const els = friendCall.els();

  return (
    <div
      ref={box}
      className={`fcall-win ${collapsed ? 'fcall-win--bubble' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      role="dialog"
      aria-label={`call with ${peer.handle}`}
    >
      {collapsed ? (
        <span className="fcall-win__bubble-head">
          <AvatarPreview cfg={cfg} focus="head" scale={1.6} animate={false} fx={false} />
          {status && <i className="fcall-win__pulse" />}
        </span>
      ) : reporting ? (
        <div className="fcall-win__report">
          <b>Report {peer.handle}</b>
          {REPORT_REASONS.map((r) => (
            <button key={r.id} className="reason" onClick={() => friendCall.report(r.id)}>
              {r.label}
            </button>
          ))}
          <button className="btn" onClick={() => setReporting(false)}>
            back
          </button>
        </div>
      ) : (
        <>
          <div className="fcall-win__top">
            <span className="fcall-win__who">{peer.handle}</span>
            <button className="fcall-win__icon" onClick={() => friendCall.setCollapsed(true)} aria-label="minimize">
              ▾
            </button>
          </div>
          <div className="fcall-win__stage">
            {video && remoteHasVideo ? (
              <Slot el={els.remote} />
            ) : (
              <span className="fcall-win__avatar">
                <AvatarPreview cfg={cfg} focus="head" scale={3} animate={false} fx={false} />
                <Slot el={els.remote} />
              </span>
            )}
            {video && (
              <div className="fcall-win__pip">
                <Slot el={els.local} mirror />
              </div>
            )}
            {status && <span className="fcall-win__status">{status}</span>}
          </div>
          <div className="fcall-win__bar">
            <button className={`fcall-win__icon ${micOn ? '' : 'fcall-win__icon--off'}`} onClick={() => friendCall.toggleMic()} aria-label="mic">
              {micOn ? '🎙' : '🔇'}
            </button>
            {video && (
              <button className={`fcall-win__icon ${camOn ? '' : 'fcall-win__icon--off'}`} onClick={() => friendCall.toggleCam()} aria-label="camera">
                {camOn ? '📹' : '🚫'}
              </button>
            )}
            <button className="fcall-win__icon" onClick={() => setReporting(true)} aria-label="report">
              🚩
            </button>
            <button className="fcall-win__end" onClick={() => friendCall.hangup()} aria-label="hang up">
              📵
            </button>
          </div>
        </>
      )}
    </div>
  );
}
