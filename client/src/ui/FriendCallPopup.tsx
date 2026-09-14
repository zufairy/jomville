import { useEffect, useMemo, useState } from 'react';
import { parseAvatar } from '@dovey/shared';
import { friendCall, useFriendCall } from '../friendCall';
import { AvatarPreview } from './AvatarPreview';
import './friend-call.css';

const RING_MS = 30_000;

/** "{handle} is calling you" with Answer / Decline and a 30 s countdown. */
export function FriendCallPopup() {
  const phase = useFriendCall((s) => s.phase);
  const peer = useFriendCall((s) => s.peer);
  const video = useFriendCall((s) => s.video);
  const since = useFriendCall((s) => s.ringingSince);
  const [now, setNow] = useState(() => Date.now());
  const cfg = useMemo(() => (peer ? parseAvatar(peer.avatar) : null), [peer]);

  useEffect(() => {
    if (phase !== 'ringing_in') return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ringing_in') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') friendCall.decline();
      else if (e.key === 'Enter') friendCall.accept();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase !== 'ringing_in' || !peer || !cfg) return null;
  const left = Math.max(0, Math.ceil((RING_MS - (now - since)) / 1000));

  return (
    <div className="fcall-ring" role="alertdialog" aria-label={`${peer.handle} is calling you`}>
      <span className="fcall-ring__head">
        <AvatarPreview cfg={cfg} focus="head" scale={1.6} animate={false} fx={false} />
      </span>
      <div className="fcall-ring__text">
        <b>{peer.handle}</b> is calling {video ? '📹' : '🎙'}
        <span className="fcall-ring__left">{left}s</span>
      </div>
      <div className="fcall-ring__btns">
        <button className="btn btn--go" onClick={() => friendCall.accept()}>
          Answer
        </button>
        <button className="btn btn--danger" onClick={() => friendCall.decline()}>
          Decline
        </button>
      </div>
    </div>
  );
}
