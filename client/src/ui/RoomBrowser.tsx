import { useEffect, useRef, useState } from 'react';
import { RoomListing, RoomTab, fetchRooms } from '../api';
import { useAppStore } from '../store';
import { goToRoom } from '../router';
import { roomThumb } from '../game/roomThumb';

const TABS: Array<{ id: RoomTab; label: string }> = [
  { id: 'busy', label: 'busy now' },
  { id: 'new', label: 'new' },
  { id: 'top', label: 'top rated' },
  { id: 'personal', label: 'personal' },
];

/** Corner badge and one-line pitch for each of the app's own rooms, by theme. */
const SYSTEM_BADGE: Record<string, string> = {
  park: '🌳 town square',
  harbor: '⚓ harbor',
  love: '💘 love meter',
  lab: '🚀 featured',
  beach: '🌅 beach',
  dream: '☁️ dream',
  funpark: '🎢 theme park',
  gameroom: '🎲 game den',
};
const SYSTEM_PITCH: Record<string, string> = {
  park: 'hedge maze, duels and the fountain',
  harbor: 'boardwalk, boats and sea breeze',
  love: 'queue up, match, watch the meter',
  lab: 'a rocket, a crew and deep space',
  beach: 'sand, surf and a sunset that stays',
  dream: 'pastel clouds and soft pillows',
  funpark: 'coaster, carousel, teacups and swings',
  gameroom: 'connect four, reversi and more at the tables',
};

export function RoomBrowser() {
  const setBrowsing = useAppStore((s) => s.setBrowsing);
  const current = useAppStore((s) => s.room?.slug);
  const [tab, setTab] = useState<RoomTab>('busy');
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRooms(null);
    fetchRooms(tab).then((r) => alive && setRooms(r));
    return () => {
      alive = false;
    };
  }, [tab]);

  return (
    <div className="cust browser" role="dialog" aria-label="rooms">
      <div className="browser__head">
        <div className="cust__tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'tab--on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setBrowsing(false)}>
          close
        </button>
      </div>
      <div className="cust__body browser__list">
        {rooms === null && <p className="browser__empty">loading…</p>}
        {rooms?.length === 0 && <p className="browser__empty">{tab === 'personal' ? 'no personal houses yet' : 'no rooms yet. build one!'}</p>}
        {rooms?.map((r) => <RoomCard key={r.slug} room={r} here={r.slug === current} />)}
      </div>
    </div>
  );
}

function RoomCard({ room: r, here }: { room: RoomListing; here: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  // undefined while loading, null when the picture could not be drawn
  const [img, setImg] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void roomThumb(r.slug).then((u) => alive && setImg(u));
      },
      { rootMargin: '160px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [r.slug]);

  const live = r.live > 0 ? `● ${r.live} here` : `${r.visitors24h} today`;
  const variant = r.system ? `roomcard--${r.theme}` : 'roomcard--home';
  return (
    <button
      ref={ref}
      className={`roomcard ${variant} ${here ? 'roomcard--here' : ''}`}
      onClick={() => !here && goToRoom(r.slug)}
      aria-label={`${r.name}, ${r.system ? 'official room' : `${r.owner}'s house`}, ${live}${here ? ', you are here' : ''}`}
    >
      <span className="roomcard__art">
        {img ? <img className="roomcard__img" src={img} alt="" draggable={false} /> : <span className={`roomcard__ph ${img === undefined ? 'roomcard__ph--loading' : ''}`} />}
        {here && <span className="roomcard__here">you're here</span>}
      </span>
      <span className="roomcard__text">
        <span className="roomcard__name">{r.name}</span>
        <span className="roomcard__meta">{r.system ? (SYSTEM_PITCH[r.theme] ?? r.category) : `${r.owner}'s house · ${r.category}`}</span>
        <span className="roomcard__tags">
          <span className="roomcard__badge">{r.system ? (SYSTEM_BADGE[r.theme] ?? '★ official') : '🏠 house'}</span>
          <span className={`roomcard__live ${r.live > 0 ? 'roomcard__live--on' : ''}`}>{live}</span>
        </span>
      </span>
      <span className="roomcard__go" aria-hidden>
        ›
      </span>
    </button>
  );
}
