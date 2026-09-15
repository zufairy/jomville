import { Suspense, lazy, useRef, useState } from 'react';
import { ROOM_CATEGORIES, ROOM_NAME_MAX } from '@dovey/shared';
import { useAppStore } from '../store';
import { fetchRandomRoom } from '../api';
import { goToRoom } from '../router';
import { Icon } from './Icon';

// Only fetched the first time someone taps the trophy, so the room bundle stays lean.
const LeaderboardPopup = lazy(() => import('./LeaderboardPopup').then((m) => ({ default: m.LeaderboardPopup })));

export function RoomBar() {
  const [boardsOpen, setBoardsOpen] = useState(false);
  const trophy = useRef<HTMLButtonElement>(null);
  const room = useAppStore((s) => s.room);
  const status = useAppStore((s) => s.status);
  const count = useAppStore((s) => s.playerCount);
  const me = useAppStore((s) => s.me);
  const actions = useAppStore((s) => s.actions);
  const setBrowsing = useAppStore((s) => s.setBrowsing);
  const flash = useAppStore((s) => s.flash);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const somewhere = async () => {
    if (busy) return;
    setBusy(true);
    const slug = await fetchRandomRoom(room?.slug ?? '');
    setBusy(false);
    if (!slug) return flash('nowhere to go yet');
    goToRoom(slug);
  };

  const share = async () => {
    const url = location.origin + `/r/${room?.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: room?.name, url });
      else {
        await navigator.clipboard.writeText(url);
        flash('link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const saveName = () => {
    const n = name.trim();
    if (n) actions?.setRoomMeta({ name: n });
    setRenaming(false);
  };

  return (
    <div className="roombar">
      <div className="roombar__title">
        {renaming ? (
          <form
            className="roombar__rename"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              autoFocus
              maxLength={ROOM_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              aria-label="room name"
            />
          </form>
        ) : (
          <button
            className="roombar__name"
            disabled={!room?.isOwner}
            onClick={() => {
              setName(room?.name ?? '');
              setRenaming(true);
            }}
          >
            <span className="roombar__label">{room?.name ?? '…'}</span>
            {room?.isOwner && (
              <span className="roombar__edit">
                <Icon name="pencil" size={13} />
              </span>
            )}
          </button>
        )}
        <span className="roombar__meta">
          <span className="roombar__owner">by {room?.ownerHandle ?? '…'}</span>
          <span className={`roombar__live roombar__live--${status}`}>
            <i className="roombar__dot" />
            {status === 'connected' ? `${count} here` : status}
          </span>
        </span>
      </div>
      {room?.isOwner && (
        <select
          className="roombar__cat"
          value={room.category}
          onChange={(e) => actions?.setRoomMeta({ category: e.target.value })}
          aria-label="room category"
        >
          {ROOM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      <div className="tray roombar__nav">
        {me && room && room.slug !== me.lobby && (
          <button className="hud__btn" onClick={() => goToRoom(me.lobby)} aria-label="main lobby" title="main lobby">
            <Icon name="tree" />
          </button>
        )}
        {me && room && !room.isOwner && (
          <button className="hud__btn" onClick={() => goToRoom(me.home)} aria-label="my room" title="my room">
            <Icon name="home" />
          </button>
        )}
        <button className="hud__btn" onClick={() => setBrowsing(true)} aria-label="browse rooms" title="browse rooms">
          <Icon name="map" />
        </button>
        <button className="hud__btn" onClick={share} aria-label="share room link" title="share room link">
          <Icon name="share" />
        </button>
        <button
          ref={trophy}
          className={`hud__btn ${boardsOpen ? 'hud__btn--on' : ''}`}
          onClick={() => setBoardsOpen(true)}
          aria-label="leaderboards"
          aria-haspopup="dialog"
          aria-expanded={boardsOpen}
          title="Ranking"
        >
          <Icon name="trophy" />
        </button>
        <i className="tray__sep" />
        <button
          className="hud__btn hud__btn--accent"
          onClick={somewhere}
          aria-label="take me somewhere"
          title="take me somewhere"
          disabled={busy}
        >
          <Icon name="dice" />
        </button>
      </div>
      {boardsOpen && (
        <Suspense fallback={null}>
          <LeaderboardPopup
            onClose={() => {
              setBoardsOpen(false);
              trophy.current?.focus();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
