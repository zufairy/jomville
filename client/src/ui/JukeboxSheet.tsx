import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_JUKEBOX_TRACK, JUKEBOX_TRACKS, jukeboxTrack, nextJukeboxTrack } from '@dovey/shared';
import { useAppStore } from '../store';
import { isTopModal, popModal, pushModal } from './modalStack';

function post(player: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  player?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com');
}

function playerLabel(code: number | null, playing: boolean) {
  if (code === 1) return 'Playing now';
  if (code === 3) return 'Buffering…';
  if (code === 2) return playing ? 'Tap play on the mini player if your browser paused it' : 'Paused';
  if (code === 0) return 'Track ended';
  if (playing) return 'Starting audio…';
  return 'Ready';
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
  const retryTimer = useRef<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const [playerState, setPlayerState] = useState<number | null>(null);
  const [playerError, setPlayerError] = useState<string>('');
  const track = useMemo(() => jukeboxTrack(state.trackId) ?? DEFAULT_JUKEBOX_TRACK, [state.trackId]);

  const syncPlayer = (play = state.playing) => {
    post(iframe.current, muted ? 'mute' : 'unMute');
    post(iframe.current, 'setVolume', [Math.max(0, Math.min(100, volume))]);
    post(iframe.current, play ? 'playVideo' : 'pauseVideo');
  };

  const playRoomTrack = (trackId = track.id) => {
    setUserStarted(true);
    setPlayerReady(false);
    setPlayerError('');
    setPlayerState(null);
    setPlayNonce((n) => n + 1);
    actions?.setJukebox(trackId, true);
    window.setTimeout(() => syncPlayer(true), 180);
    window.setTimeout(() => syncPlayer(true), 650);
    window.setTimeout(() => syncPlayer(true), 1200);
  };

  const skipToNext = (reason = 'This YouTube embed did not start, so Leypark picked the next vibe.') => {
    const next = nextJukeboxTrack(track.id);
    setPlayerError(reason);
    playRoomTrack(next.id);
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
    setPlayerState(null);
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
  }, [track.youtubeId]);

  useEffect(() => {
    if (!playerReady) return;
    syncPlayer();
  }, [muted, volume, state.playing, playerReady, track.youtubeId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!String(event.origin).includes('youtube.com')) return;
      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== 'object') return;
      const msg = data as { event?: string; info?: unknown; data?: unknown };
      if (msg.event === 'onReady') {
        setPlayerReady(true);
        syncPlayer();
      }
      if (msg.event === 'onStateChange' && typeof msg.info === 'number') {
        setPlayerState(msg.info);
        if (msg.info === 1) setPlayerError('');
        if (msg.info === 0 && state.playing) skipToNext('Track finished, playing the next vibe.');
      }
      if (msg.event === 'infoDelivery' && msg.info && typeof msg.info === 'object') {
        const info = msg.info as { playerState?: unknown };
        if (typeof info.playerState === 'number') {
          setPlayerState(info.playerState);
          if (info.playerState === 1) setPlayerError('');
          if (info.playerState === 0 && state.playing) skipToNext('Track finished, playing the next vibe.');
        }
      }
      if (msg.event === 'onError') {
        const code = typeof msg.info === 'number' ? msg.info : typeof msg.data === 'number' ? msg.data : 0;
        skipToNext(`YouTube blocked this track here (code ${code}), playing the next one.`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [muted, volume, state.playing, track.id]);

  useEffect(() => {
    if (!state.playing || !userStarted) return;
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => {
      if (playerState !== 1) syncPlayer(true);
    }, 1800);
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, [state.playing, userStarted, playerState, track.youtubeId]);

  if (!open) return null;

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
  const autoplay = userStarted && state.playing ? 1 : 0;
  const src = `https://www.youtube.com/embed/${track.youtubeId}?enablejsapi=1&playsinline=1&origin=${encodeURIComponent(location.origin)}&autoplay=${autoplay}&mute=${muted ? 1 : 0}&controls=1&rel=0&modestbranding=1&iv_load_policy=3`;
  const status = playerLabel(playerState, state.playing);

  return (
    <div className="jukebox-sheet" role="dialog" aria-label="room jukebox">
      <div className="jukebox-sheet__glow" aria-hidden="true" />
      <div className="jukebox-sheet__top">
        <div>
          <span className="jukebox-sheet__eyebrow">YouTube room radio · auto-skip</span>
          <h2>{track.title}</h2>
          <p>{state.playing ? 'The room shares the same song. If YouTube blocks one track, the jukebox picks the next vibe automatically.' : 'Pick a vibe and press play once. Keep the mini player visible for reliable browser audio.'}</p>
        </div>
        <button className="jukebox-sheet__x" onClick={() => setOpen(false)} aria-label="close jukebox">
          ✕
        </button>
      </div>

      <div className={`jukebox-deck ${state.playing && playerState !== 2 ? 'jukebox-deck--on' : ''}`}>
        <span className="jukebox-deck__meter"><i /><i /><i /><i /><i /></span>
        <span className="jukebox-deck__halo" />
        <span className="jukebox-deck__disc"><i /></span>
        <span className="jukebox-deck__shine" />
        <span className="jukebox-deck__arm" />
        <span className="jukebox-deck__needle" />
      </div>

      <div className="jukebox-player">
        <div className="jukebox-player__badge">{status}</div>
        <iframe ref={iframe} key={`${track.youtubeId}:${playNonce}:${autoplay}:${muted ? 1 : 0}`} title={track.title} src={src} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen onLoad={() => { setPlayerReady(true); window.setTimeout(() => syncPlayer(), 160); }} />
      </div>
      {playerError && <div className="jukebox-alert">{playerError}</div>}

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
