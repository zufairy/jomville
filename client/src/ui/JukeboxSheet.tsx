import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_JUKEBOX_TRACK, JUKEBOX_TRACKS, jukeboxTrack } from '@dovey/shared';
import { useAppStore } from '../store';
import { isTopModal, popModal, pushModal } from './modalStack';

function post(player: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  player?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com');
}

export function JukeboxSheet() {
  const open = useAppStore((s) => s.jukeboxOpen);
  const setOpen = useAppStore((s) => s.setJukeboxOpen);
  const state = useAppStore((s) => s.jukebox);
  const volume = useAppStore((s) => s.jukeboxVolume);
  const muted = useAppStore((s) => s.jukeboxMuted);
  const setVolume = useAppStore((s) => s.setJukeboxVolume);
  const setMuted = useAppStore((s) => s.setJukeboxMuted);
  const actions = useAppStore((s) => s.actions);
  const modalId = useRef(Symbol('jukebox'));
  const iframe = useRef<HTMLIFrameElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const track = useMemo(() => jukeboxTrack(state.trackId) ?? DEFAULT_JUKEBOX_TRACK, [state.trackId]);

  const syncPlayer = (play = state.playing) => {
    post(iframe.current, muted ? 'mute' : 'unMute');
    post(iframe.current, 'setVolume', [Math.max(0, Math.min(100, volume))]);
    post(iframe.current, play ? 'playVideo' : 'pauseVideo');
  };

  useEffect(() => {
    const id = modalId.current;
    if (!open) return;
    pushModal(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(id)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      popModal(id);
    };
  }, [open, setOpen]);

  useEffect(() => {
    setPlayerReady(false);
  }, [track.youtubeId]);

  useEffect(() => {
    if (!playerReady) return;
    syncPlayer();
  }, [muted, volume, state.playing, playerReady, track.youtubeId]);

  if (!open) return null;

  const playRoomTrack = (trackId = track.id) => {
    setUserStarted(true);
    actions?.setJukebox(trackId, true);
    window.setTimeout(() => syncPlayer(true), 80);
    window.setTimeout(() => syncPlayer(true), 380);
  };
  const pauseRoom = () => {
    actions?.setJukebox(track.id, false);
    post(iframe.current, 'pauseVideo');
  };
  const toggle = () => (state.playing ? pauseRoom() : playRoomTrack(track.id));
  const localMute = () => {
    const next = !muted;
    setMuted(next);
    post(iframe.current, next ? 'mute' : 'unMute');
    if (!next && state.playing) post(iframe.current, 'playVideo');
  };
  const changeVolume = (next: number) => {
    setVolume(next);
    if (muted && next > 0) setMuted(false);
    post(iframe.current, 'setVolume', [Math.max(0, Math.min(100, next))]);
    if (state.playing) post(iframe.current, 'playVideo');
  };
  const src = `https://www.youtube.com/embed/${track.youtubeId}?enablejsapi=1&playsinline=1&origin=${encodeURIComponent(location.origin)}&autoplay=${userStarted && state.playing ? 1 : 0}&controls=0&rel=0&modestbranding=1&iv_load_policy=3`;

  return (
    <div className="jukebox-sheet" role="dialog" aria-label="room jukebox">
      <div className="jukebox-sheet__glow" aria-hidden="true" />
      <div className="jukebox-sheet__top">
        <div>
          <span className="jukebox-sheet__eyebrow">YouTube room radio · synced</span>
          <h2>{track.title}</h2>
          <p>{state.playing ? 'The whole room is on this vibe. You can mute it for yourself anytime.' : 'Pick a 2026 vibe and press play once to unlock music.'}</p>
        </div>
        <button className="jukebox-sheet__x" onClick={() => setOpen(false)} aria-label="close jukebox">
          ✕
        </button>
      </div>

      <div className={`jukebox-deck ${state.playing ? 'jukebox-deck--on' : ''}`}>
        <span className="jukebox-deck__halo" />
        <span className="jukebox-deck__disc"><i /></span>
        <span className="jukebox-deck__shine" />
        <span className="jukebox-deck__arm" />
        <span className="jukebox-deck__needle" />
        <iframe ref={iframe} key={track.youtubeId} title={track.title} src={src} allow="autoplay; encrypted-media; picture-in-picture" onLoad={() => { setPlayerReady(true); window.setTimeout(() => syncPlayer(), 120); }} />
      </div>

      <div className="jukebox-now">
        <button className="jukebox-play" onClick={toggle}>{state.playing ? 'Pause room music' : '▶ Play for room'}</button>
        <button className="jukebox-mute" onClick={localMute}>{muted ? 'Turn on for me' : 'Mute for me'}</button>
      </div>

      <label className="jukebox-volume">
        <span>My volume</span>
        <input type="range" min="0" max="100" value={volume} onChange={(e) => changeVolume(Number(e.currentTarget.value))} />
        <b>{muted ? 'muted' : `${volume}%`}</b>
      </label>

      <div className="jukebox-list">
        {JUKEBOX_TRACKS.map((t) => (
          <button key={t.id} className={t.id === track.id ? 'jukebox-track jukebox-track--on' : 'jukebox-track'} onClick={() => playRoomTrack(t.id)}>
            <b>{t.title}</b>
            <span>{t.vibe}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
