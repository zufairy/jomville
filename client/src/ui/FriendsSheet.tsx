import { useEffect, useMemo, useState } from 'react';
import { parseAvatar } from '@dovey/shared';
import type { FriendRequestView, FriendView } from '../api';
import { friends, useFriends } from '../friends';
import { goToRoom } from '../router';
import { useAppStore } from '../store';
import { AvatarPreview } from './AvatarPreview';
import './friends.css';

function Head({ avatar, online }: { avatar: string; online?: boolean }) {
  const cfg = useMemo(() => parseAvatar(avatar), [avatar]);
  return (
    <span className="friend__head">
      <AvatarPreview cfg={cfg} focus="head" scale={1.4} animate={false} fx={false} />
      {online !== undefined && <i className={`friend__dot ${online ? 'friend__dot--on' : ''}`} />}
    </span>
  );
}

function FriendRow({ f, here }: { f: FriendView; here: string | undefined }) {
  const [confirm, setConfirm] = useState(false);
  const sameRoom = !!f.room && f.room.slug === here;
  return (
    <div className="friend">
      <Head avatar={f.avatar} online={f.online} />
      <div className="friend__info">
        <div className="friend__name">{f.handle}</div>
        <div className="friend__where">{f.online ? (sameRoom ? 'here with you' : `in ${f.room?.name ?? 'a room'}`) : 'offline'}</div>
      </div>
      <div className="friend__btns">
        {confirm ? (
          <>
            <button className="btn btn--danger" onClick={() => void friends.remove(f.id)}>
              remove
            </button>
            <button className="btn" onClick={() => setConfirm(false)}>
              keep
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--primary" disabled={!f.online || sameRoom} onClick={() => friends.invite(f.id)} title="invite to my room">
              invite
            </button>
            <button className="btn" disabled={!f.online || sameRoom || !f.room} onClick={() => f.room && goToRoom(f.room.slug)} title="join their room">
              join
            </button>
            <button className="btn" onClick={() => setConfirm(true)} aria-label={`remove ${f.handle}`}>
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RequestRow({ r, incoming }: { r: FriendRequestView; incoming: boolean }) {
  return (
    <div className="friend">
      <Head avatar={r.avatar} />
      <div className="friend__info">
        <div className="friend__name">{r.handle}</div>
        <div className="friend__where">{incoming ? 'wants to be friends' : 'waiting for them'}</div>
      </div>
      <div className="friend__btns">
        {incoming ? (
          <>
            <button className="btn btn--primary" onClick={() => void friends.respond(r.id, true)}>
              accept
            </button>
            <button className="btn" onClick={() => void friends.respond(r.id, false)}>
              decline
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => void friends.cancel(r.id)}>
            cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** Friends list with live presence, plus incoming and outgoing requests. */
export function FriendsSheet() {
  const list = useFriends((s) => s.friends);
  const incoming = useFriends((s) => s.incoming);
  const outgoing = useFriends((s) => s.outgoing);
  const setOpen = useFriends((s) => s.setOpen);
  const here = useAppStore((s) => s.room?.slug);
  const [tab, setTab] = useState<'friends' | 'requests'>(() => (useFriends.getState().incoming.length ? 'requests' : 'friends'));

  useEffect(() => {
    void useFriends.getState().load();
  }, []);

  const online = list.filter((f) => f.online).length;

  return (
    <div className="sheet friends" role="dialog" aria-label="friends">
      <div className="profile__head">
        <span className="profile__name">👥 friends{list.length ? ` · ${online} online` : ''}</span>
        <button className="btn" onClick={() => setOpen(false)}>
          close
        </button>
      </div>
      <div className="friends__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'friends'} className={`friends__tab ${tab === 'friends' ? 'friends__tab--on' : ''}`} onClick={() => setTab('friends')}>
          friends
        </button>
        <button role="tab" aria-selected={tab === 'requests'} className={`friends__tab ${tab === 'requests' ? 'friends__tab--on' : ''}`} onClick={() => setTab('requests')}>
          requests
          {incoming.length > 0 && <span className="friends__count">{incoming.length}</span>}
        </button>
      </div>
      <div className="friends__list">
        {tab === 'friends' ? (
          list.length ? (
            list.map((f) => <FriendRow key={f.id} f={f} here={here} />)
          ) : (
            <p className="friends__empty">no friends yet. tap someone in a room and add them!</p>
          )
        ) : incoming.length || outgoing.length ? (
          <>
            {incoming.length > 0 && <div className="friends__section">incoming</div>}
            {incoming.map((r) => (
              <RequestRow key={`in:${r.id}`} r={r} incoming />
            ))}
            {outgoing.length > 0 && <div className="friends__section">sent</div>}
            {outgoing.map((r) => (
              <RequestRow key={`out:${r.id}`} r={r} incoming={false} />
            ))}
          </>
        ) : (
          <p className="friends__empty">no requests right now</p>
        )}
      </div>
    </div>
  );
}
