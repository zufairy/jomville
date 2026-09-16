import { useEffect, useMemo, useRef } from 'react';
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
  const track = useMemo(() => jukeboxTrack(state.trackId) ?? DEFAULT_JUKEBOX_TRACK, [state.trackId]);

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
    post(iframe.current, muted ? 'mute' : 'unMute');
    post(iframe.current, 'setVolume', [Math.max(0, Math.min(100, volume))]);
  }, [muted, volume, track.youtubeId]);

  useEffect(() => {
    post(iframe.current, state.playing ? 'playVideo' : 'pauseVideo');
  }, [state.playing, track.youtubeId]);

  if (!open) return null;

  const setTrack = (trackId: string) => actions?.setJukebox(trackId, true);
  const toggle = () => actions?.setJukebox(track.id, !state.playing);
  const src = `https://www.youtube.com/embed/${track.youtubeId}?enablejsapi=1&playsinline=1&origin=${encodeURIComponent(location.origin)}&autoplay=${state.playing ? 1 : 0}&controls=0&rel=0&modestbranding=1`;

  return (
    <div className="jukebox-sheet" role="dialog" aria-label="room jukebox">
      <div className="jukebox-sheet__top">
        <div>
          <span className="jukebox-sheet__eyebrow">Room jukebox</span>
          <h2>{track.title}</h2>
          <p>{state.playing ? 'Everyone in this room hears this vibe.' : 'Pick a vibe and play it for the room.'}</p>
        </div>
        <button className="jukebox-sheet__x" onClick={() => setOpen(false)} aria-label="close jukebox">
          ✕
        </button>
      </div>

      <div className={`jukebox-deck ${state.playing ? 'jukebox-deck--on' : ''}`}>
        <span className="jukebox-deck__disc" />
        <span className="jukebox-deck__arm" />
        <iframe ref={iframe} key={track.youtubeId} title={track.title} src={src} allow="autoplay; encrypted-media" />
      </div>

      <div className="jukebox-now">
        <button className="jukebox-play" onClick={toggle}>{state.playing ? 'Pause room music' : 'Play for room'}</button>
        <button className="jukebox-mute" onClick={() => setMuted(!muted)}>{muted ? 'Turn on for me' : 'Mute for me'}</button>
      </div>

      <label className="jukebox-volume">
        <span>My volume</span>
        <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(Number(e.currentTarget.value))} />
        <b>{muted ? 'muted' : `${volume}%`}</b>
      </label>

      <div className="jukebox-list">
        {JUKEBOX_TRACKS.map((t) => (
          <button key={t.id} className={t.id === track.id ? 'jukebox-track jukebox-track--on' : 'jukebox-track'} onClick={() => setTrack(t.id)}>
            <b>{t.title}</b>
            <span>{t.vibe}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
