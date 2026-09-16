import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_JUKEBOX_TRACK, JUKEBOX_TRACKS, jukeboxTrack, nextJukeboxTrack } from '@dovey/shared';
import { useAppStore } from '../store';
import { loadYouTube, type VideoPlayer } from './youtubePlayer';
import { isTopModal, popModal, pushModal } from './modalStack';

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
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<VideoPlayer | null>(null);
  const loaded = useRef('');
  const failed = useRef(new Set<string>());
  const [playerReady, setPlayerReady] = useState(false);
  const [playerState, setPlayerState] = useState<number | null>(null);
  const [playerError, setPlayerError] = useState('');
  const [activated, setActivated] = useState(false);
  const track = useMemo(() => jukeboxTrack(state.trackId) ?? DEFAULT_JUKEBOX_TRACK, [state.trackId]);
  const latest = useRef({ track, state, muted, volume });
  latest.current = { track, state, muted, volume };

  const playRoomTrack = (trackId = track.id) => {
    failed.current.clear();
    setPlayerError('');
    setMuted(false);
    if (volume === 0) setVolume(70);
    const selected = jukeboxTrack(trackId) ?? DEFAULT_JUKEBOX_TRACK;
    if (playerReady && player.current) {
      player.current.unMute();
      player.current.setVolume(volume || 70);
      if (loaded.current !== selected.youtubeId) {
        loaded.current = selected.youtubeId;
        player.current.loadVideoById(selected.youtubeId);
      } else player.current.playVideo();
    }
    actions?.setJukebox(selected.id, true);
  };

  useEffect(() => { if (open || state.playing) setActivated(true); }, [open, state.playing]);
  useEffect(() => {
    if (!activated || !host.current) return;
    let disposed = false;
    const node = document.createElement('div');
    host.current.appendChild(node);
    loadYouTube().then((api) => {
      if (disposed) return;
      loaded.current = latest.current.track.youtubeId;
      player.current = new api.Player(node, {
        videoId: loaded.current,
        playerVars: { origin: location.origin, playsinline: 1, controls: 1, rel: 0 },
        events: {
          onReady: () => { if (!disposed) setPlayerReady(true); },
          onStateChange: ({ data }) => {
            if (disposed) return;
            setPlayerState(data);
            if (data === 1) setPlayerError('');
            if (data === 0 && latest.current.state.playing) {
              const next = nextJukeboxTrack(latest.current.track.id);
              useAppStore.getState().actions?.setJukebox(next.id, true);
            }
          },
          onAutoplayBlocked: () => setPlayerError('Tap play on the video below to enable sound on this device.'),
          onError: ({ data }) => {
            if (disposed) return;
            setPlayerState(null);
            if (data === 100 || data === 101 || data === 150) {
              const current = latest.current.track;
              failed.current.add(current.id);
              const next = JUKEBOX_TRACKS.find(t => !failed.current.has(t.id));
              if (next) {
                setPlayerError('This video is unavailable here. Trying the next song…');
                useAppStore.getState().actions?.setJukebox(next.id, true);
                return;
              }
            }
            setPlayerError(`YouTube could not play this video (${data}). Select another song or retry using the video controls.`);
          },
        },
      });
    }).catch((error: Error) => { if (!disposed) setPlayerError(error.message); });
    return () => {
      disposed = true;
      player.current?.destroy();
      player.current = null;
      node.remove();
      setPlayerReady(false);
    };
  }, [activated]);

  useEffect(() => {
    const video = player.current;
    if (!playerReady || !video) return;
    video.setVolume(volume);
    if (muted) video.mute(); else video.unMute();
    if (loaded.current !== track.youtubeId) {
      loaded.current = track.youtubeId;
      setPlayerState(null);
      if (state.playing) video.loadVideoById(track.youtubeId);
      else video.cueVideoById(track.youtubeId);
    } else if (state.playing) video.playVideo();
    else video.pauseVideo();
  }, [playerReady, track.youtubeId, state.playing, volume, muted]);

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

  const toggle = () => {
    if (state.playing && playerState === 1) {
      actions?.setJukebox(track.id, false);
      player.current?.pauseVideo();
    } else playRoomTrack();
  };
  const localMute = () => {
    setMuted(!muted);
    if (muted) { player.current?.unMute(); player.current?.playVideo(); }
    else player.current?.mute();
  };
  const changeVolume = (next: number) => { setVolume(next); if (next > 0) setMuted(false); };
  const status = playerLabel(playerState, state.playing);

  return (
    <div style={!activated && !open ? { display: 'none' } : undefined} className={`jukebox-sheet ${open ? "" : "jukebox-sheet--mini"}`} role={open ? "dialog" : "region"} aria-label="room jukebox">
      {!open && <button className="jukebox-mini-open" onClick={() => setOpen(true)}>♫ {track.title} · Open jukebox</button>}
      <div className="jukebox-sheet__glow" aria-hidden="true" />
      <div className="jukebox-sheet__top">
        <div>
          <span className="jukebox-sheet__eyebrow">LEY PARK • LISTENING CLUB</span>
          <h2>{track.title}</h2>
          <p>A little music. A little chemistry. Pick a song for everyone.</p>
        </div>
        <button className="jukebox-sheet__x" onClick={() => setOpen(false)} aria-label="close jukebox">
          ✕
        </button>
      </div>

      <div className={`jukebox-deck ${playerState === 1 && !muted ? 'jukebox-deck--on' : ''}`}>
        <span className="jukebox-deck__meter"><i /><i /><i /><i /><i /></span>
        <span className="jukebox-deck__halo" />
        <span className="jukebox-deck__disc"><i /></span>
        <span className="jukebox-deck__shine" />
        <span className="jukebox-deck__arm" />
        <span className="jukebox-deck__needle" />
      </div>

      <div className="jukebox-player">
        <div className="jukebox-player__badge">{status}</div>
        <div className="jukebox-video-host" ref={host} />
      </div>
      {playerError && <div className="jukebox-alert">{playerError}</div>}

      <div className="jukebox-now">
        <button className="jukebox-play" onClick={toggle}>{state.playing && playerState === 1 ? 'Ⅱ Pause room' : '▶ Play for room'}</button>
        <button className="jukebox-mute" onClick={localMute}>{muted ? 'Turn on for me' : 'Mute for me'}</button>
      </div>

      <label className="jukebox-volume">
        <span>My volume</span>
        <input type="range" min="0" max="100" value={volume} onChange={(e) => changeVolume(Number(e.currentTarget.value))} />
        <b>{muted ? 'muted' : `${volume}%`}</b>
      </label>

      <div className="jukebox-playlist-heading">THE PLAYLIST <span>{JUKEBOX_TRACKS.length} songs · no live streams</span></div>
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
