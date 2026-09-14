import { useEffect, useState } from 'react';
import { FURNITURE, SYSTEM_ROOMS, TABLE_GAMES, TABLE_GAME_KINDS } from '@dovey/shared';
import { fetchRooms } from '../api';
import { goPlay, goToRoom } from '../router';
import { GoogleButton } from './GoogleButton';
import { LeyparkLogo, LeyparkMark } from './LeyparkLogo';
import './landing.css';

/**
 * Marketing landing page at `/`. Real in-game screenshots, and live counts of
 * real players (bots excluded server-side) from the rooms API. No Pixi here:
 * the game bundle loads only when someone steps in.
 */

/** only offer Google sign-in once it is configured; a disabled button reads as broken to visitors */
const GOOGLE_ON = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** rounded down to the nearest ten so the claim stays true as the catalogue grows */
const FURNITURE_COUNT = `${Math.floor(FURNITURE.length / 10) * 10}+`;

const NAV = [
  { href: '#rooms', label: 'Rooms' },
  { href: '#love', label: 'Love' },
  { href: '#video-calls', label: 'Video calls' },
  { href: '#worlds', label: 'Worlds' },
  { href: '#safety', label: 'Safety' },
];

const WORLD_INFO: Record<string, { tag: string; blurb: string; img?: string; glyph: string; adult?: boolean }> = {
  mainlobby: { tag: 'Hangout', glyph: '⛲', img: '/landing/main-lobby.jpg', blurb: 'The big park where everyone meets. Hedge maze, fountain, picnic tables.' },
  harborwalk: { tag: 'Chill', glyph: '⛵', blurb: 'A seaside boardwalk with boats and an evening breeze.' },
  lovemeter: { tag: '18+', glyph: '💘', adult: true, blurb: 'Queue up, get matched, and share a 30-second video call.' },
  rocketlab: { tag: 'Showcase', glyph: '🚀', blurb: 'Rockets, crew quarters and a view of the stars.' },
  sunsetcove: { tag: 'Chill', glyph: '🌅', blurb: 'Sand, waves and a sunset that never quite ends.' },
  dreamsuite: { tag: 'Hangout', glyph: '☁️', blurb: 'Pastel clouds and soft cushions. The comfiest room in town.' },
  wonderdome: { tag: 'Theme park', glyph: '🎢', img: '/landing/wonder-dome.jpg', blurb: 'Coaster, carousel, teacups and a drop tower to ride together.' },
  gameden: { tag: 'Games', glyph: '🎲', img: '/landing/game-den.jpg', blurb: 'Sit across from someone and a board game starts.' },
  casino: { tag: 'Games', glyph: '🎰', blurb: 'Dice, a Wheel of Fortune and Holodice tables.' },
  kitchen: { tag: 'Co-op', glyph: '🍳', blurb: 'Stand on the rug with friends, press Start, cook a round together.' },
};

const PLAY = [
  { slug: 'gameden', name: 'Game Den', blurb: `${TABLE_GAME_KINDS.map((k) => TABLE_GAMES[k].name).join(', ')}.` },
  { slug: 'casino', name: 'Casino', blurb: 'Roll dice and spin the wheel with the whole room watching.' },
  { slug: 'kitchen', name: 'Kitchen', blurb: 'A co-op cooking round with whoever is standing next to you.' },
];

const SAFETY = [
  { title: 'Block in one tap', body: 'From anyone’s profile. Blocked players can’t see your messages or call you.' },
  { title: 'Report with context', body: 'Reports go to a moderation queue and are reviewed by real people.' },
  { title: 'Calls are opt-in', body: 'Nobody sees or hears you on a call unless you accept it.' },
  { title: 'Love features are for adults 18+', body: 'The Love Meter and romance rooms are meant for adults only.' },
];

type Live = { state: 'loading' } | { state: 'error' } | { state: 'ok'; total: number; bySlug: Record<string, number> };

/** real players online, polled every 20s; per-room counts come from the same response */
function useLiveCount(): Live {
  const [live, setLive] = useState<Live>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchRooms('busy')
        .then((rooms) => {
          if (!alive) return;
          const bySlug: Record<string, number> = {};
          for (const r of rooms) bySlug[r.slug] = r.live ?? 0;
          setLive({ state: 'ok', total: rooms.reduce((n, r) => n + (r.live ?? 0), 0), bySlug });
        })
        // keep the last good numbers through a blip; only fall back when there were none
        .catch(() => alive && setLive((prev) => (prev.state === 'ok' ? prev : { state: 'error' })));
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return live;
}

function peopleOnline(n: number) {
  if (n === 0) return 'Be the first one here tonight';
  return n === 1 ? '1 person online now' : `${n.toLocaleString('en')} people online now`;
}

function pillText(live: Live) {
  if (live.state === 'loading') return 'Checking who’s online…';
  if (live.state === 'error') return 'Free to play, right in your browser';
  return peopleOnline(live.total);
}

function LivePill({ live }: { live: Live }) {
  const on = live.state === 'ok' && live.total > 0;
  return (
    <span className="lk-pill" aria-live="polite">
      <i className={`lk-dot ${on ? 'lk-dot--live' : ''}`} aria-hidden />
      {pillText(live)}
    </span>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const I = {
  build: 'M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6',
  sofa: 'M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2',
  gem: 'M6 3h12l4 6-10 12L2 9zM2 9h20M12 21 8 9l4-6 4 6z',
  heart: 'M12 20s-7-4.5-9.3-9A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5C19 15.5 12 20 12 20z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  cam: 'M3 7h12v10H3zM15 11l6-4v10l-6-4',
  phone: 'M4 14.5c4.8-4 11.2-4 16 0l-2 3-3.2-1.2v-2.4a9 9 0 0 0-5.6 0v2.4L6 17.5z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
};

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

function countLabel(live: Live, slug: string) {
  if (live.state === 'loading') return '…';
  if (live.state === 'error') return 'Open now';
  const n = live.bySlug[slug] ?? 0;
  return n === 0 ? 'Quiet right now' : `${n} here now`;
}

/** decorative video call mock; illustrated tiles, no real people */
function CallMock() {
  return (
    <div className="lk-call" aria-hidden>
      <img className="lk-call__backdrop" src="/landing/wonder-dome.jpg" alt="" loading="lazy" />
      <div className="lk-call__window">
        <div className="lk-call__bar">
          <span className="lk-call__status">
            <i className="lk-dot lk-dot--live" /> Connected · 12:48
          </span>
          <span className="lk-call__room">Wonder Dome</span>
        </div>
        <div className="lk-call__tiles">
          <div className="lk-tile lk-tile--a">
            <span className="lk-tile__person" />
            <span className="lk-tile__name">maya_b</span>
          </div>
          <div className="lk-tile lk-tile--b">
            <span className="lk-tile__person" />
            <span className="lk-tile__name">you</span>
          </div>
        </div>
        <div className="lk-call__controls">
          <span className="lk-ctl"><Icon d={I.mic} /></span>
          <span className="lk-ctl"><Icon d={I.cam} /></span>
          <span className="lk-ctl lk-ctl--end"><Icon d={I.phone} /></span>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const live = useLiveCount();
  const [scrolled, setScrolled] = useState(false);

  // the app locks the page for the game, so the landing scrolls inside its own container
  return (
    <div className="lk" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}>
      <a className="lk-skip" href="#main">Skip to content</a>
      <header className={`lk-nav ${scrolled ? 'lk-nav--solid' : ''}`}>
        <div className="lk-wrap lk-nav__row">
          <a className="lk-home" href="/" aria-label="Leypark home">
            <LeyparkLogo size={34} />
          </a>
          {/* single container for section links; later nav items (e.g. Ranking) append here */}
          <nav className="lk-nav__links" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <a href="/leaderboards">Ranking</a>
          </nav>
          <button className="lk-btn lk-btn--sm" onClick={goPlay}>
            Play free
          </button>
        </div>
        {/* mobile-only (<860px) scrollable section row; desktop uses .lk-nav__links above */}
        <nav className="lk-subnav" aria-label="Sections">
          <div className="lk-subnav__row">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <a href="/leaderboards">Ranking</a>
          </div>
        </nav>
      </header>

      <main id="main">
        <section className="lk-hero">
          <div className="lk-glow lk-glow--a" aria-hidden />
          <div className="lk-glow lk-glow--b" aria-hidden />
          <div className="lk-wrap lk-hero__grid">
            <div className="lk-hero__copy">
              <LivePill live={live} />
              <h1 className="lk-h1">
                Decorate your space. <span className="lk-grad-text">Meet your person.</span>
              </h1>
              <p className="lk-lead">
                Leypark is a cozy online world where you build a room that’s truly yours, hang out with real people, and video call the ones who click.
              </p>
              <div className="lk-cta">
                <button className="lk-btn lk-btn--lg" onClick={goPlay}>
                  Play free
                </button>
                <a
                  className="lk-btn lk-btn--ghost lk-btn--lg"
                  href="#rooms"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToId('rooms');
                  }}
                >
                  See how it works
                </a>
              </div>
              <p className="lk-note">Free, right in your browser. No download.</p>
              {GOOGLE_ON && (
                <div className="lk-google">
                  <GoogleButton onDone={goPlay} />
                </div>
              )}
            </div>

            <div className="lk-hero__visual">
              <figure className="lk-device">
                <div className="lk-device__chrome" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
                <img src="/landing/wonder-dome.jpg" alt="A decorated room in Leypark with a carousel, fountain and cafe tables" width={1512} height={800} />
              </figure>
              <div className="lk-chip lk-chip--match" aria-hidden>
                <span className="lk-chip__icon lk-chip__icon--pink">
                  <Icon d={I.heart} />
                </span>
                <span>
                  <b>It’s a match</b>
                  <small>Say hi on the loveseat</small>
                </span>
              </div>
              <div className="lk-chip lk-chip--call" aria-hidden>
                <span className="lk-chip__icon lk-chip__icon--coral">
                  <Icon d={I.cam} />
                </span>
                <span>
                  <b>Video call</b>
                  <small>Tap their profile</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="rooms" className="lk-section">
          <div className="lk-wrap lk-feature">
            <figure className="lk-shot">
              <img src="/landing/game-den.jpg" alt="A neon game room decorated with arcade machines, bookshelves and board game tables" loading="lazy" width={1512} height={800} />
            </figure>
            <div className="lk-feature__copy">
              <span className="lk-eyebrow">Make it yours</span>
              <h2 className="lk-h2">A room that feels like you.</h2>
              <p className="lk-sub">Start with an empty room and turn it into your favorite place to be. Invite people over and show it off.</p>
              <ul className="lk-points">
                <li>
                  <span className="lk-points__icon"><Icon d={I.build} /></span>
                  <span><b>Build freely</b> Place, rotate and rearrange anything in build mode.</span>
                </li>
                <li>
                  <span className="lk-points__icon"><Icon d={I.sofa} /></span>
                  <span><b>{FURNITURE_COUNT} furniture pieces</b> Sofas, neon, plants, arcade cabinets and more.</span>
                </li>
                <li>
                  <span className="lk-points__icon"><Icon d={I.gem} /></span>
                  <span><b>Rare, limited editions</b> Numbered items from the shop that only a few people will own.</span>
                </li>
              </ul>
              <button className="lk-btn" onClick={goPlay}>
                Start decorating
              </button>
            </div>
          </div>
        </section>

        <section id="love" className="lk-section lk-section--love">
          <div className="lk-wrap">
            <div className="lk-head">
              <span className="lk-eyebrow">
                Find your person <span className="lk-badge">18+</span>
              </span>
              <h2 className="lk-h2">Not random chat. Real conversations in a place you both enjoy.</h2>
              <p className="lk-sub">The Love Meter room pairs you with someone new, face to face, while the whole room cheers you on.</p>
            </div>
            <ol className="lk-steps">
              <li className="lk-step">
                <span className="lk-step__n">1</span>
                <h3>Join the Love Meter</h3>
                <p>Walk into the Love Meter room and step into the blue or pink lane.</p>
              </li>
              <li className="lk-step">
                <span className="lk-step__n">2</span>
                <h3>Match</h3>
                <p>When you reach the front, you’re paired with the person leading the other lane and seated on the loveseat.</p>
              </li>
              <li className="lk-step">
                <span className="lk-step__n">3</span>
                <h3>Talk face to face</h3>
                <p>Share a 30-second video call, then watch the giant meter reveal your score.</p>
              </li>
            </ol>
            <div className="lk-love__cta">
              <button className="lk-btn" onClick={() => goToRoom('lovemeter')}>
                Enter the Love Meter
              </button>
              <span className="lk-note">Love features are for adults 18+.</span>
            </div>
          </div>
        </section>

        <section id="video-calls" className="lk-section lk-section--calls">
          <div className="lk-wrap">
            <div className="lk-head lk-head--center">
              <span className="lk-eyebrow">Video calls</span>
              <h2 className="lk-h2 lk-h2--xl">Hit it off? Go face to face.</h2>
              <p className="lk-sub">Video call anyone you’ve connected with, right from their profile — no apps, no phone numbers.</p>
            </div>
            <CallMock />
            <ul className="lk-callfacts">
              <li><Icon d={I.cam} /> Voice or video, one tap from their profile</li>
              <li><Icon d={I.mic} /> Proximity voice when you just want to chat nearby</li>
              <li><Icon d={I.shield} /> They accept first, and blocked players can’t call you</li>
            </ul>
            <p className="lk-fine">Calls start with someone in the same room as you. Illustration shown; no real people pictured.</p>
          </div>
        </section>

        <section id="worlds" className="lk-section">
          <div className="lk-wrap">
            <div className="lk-head">
              <span className="lk-eyebrow">Worlds &amp; games</span>
              <h2 className="lk-h2">Places to go together.</h2>
              <p className="lk-sub">Live counts are real players only.</p>
            </div>
            <div className="lk-play">
              {PLAY.map((g) => (
                <article key={g.slug} className="lk-playcard">
                  <h3>{g.name}</h3>
                  <p>{g.blurb}</p>
                  <button className="lk-link" onClick={() => goToRoom(g.slug)} aria-label={`Enter ${g.name}`}>
                    Enter <span aria-hidden>→</span>
                  </button>
                </article>
              ))}
            </div>
            <div className="lk-worlds">
              {SYSTEM_ROOMS.map((r) => {
                const w = WORLD_INFO[r.slug] ?? { tag: 'World', glyph: '✨', blurb: 'An official Leypark world.' };
                const n = live.state === 'ok' ? (live.bySlug[r.slug] ?? 0) : 0;
                return (
                  <article key={r.slug} className={`lk-world lk-world--${r.theme}`}>
                    <div className="lk-world__art">
                      {w.img ? (
                        <img src={w.img} alt="" loading="lazy" />
                      ) : (
                        <span className="lk-world__glyph" aria-hidden>
                          {w.glyph}
                        </span>
                      )}
                      <span className={`lk-tag ${w.adult ? 'lk-tag--adult' : ''}`}>{w.tag}</span>
                    </div>
                    <div className="lk-world__body">
                      <h3>{r.name}</h3>
                      <p>{w.blurb}</p>
                      <div className="lk-world__foot">
                        <span className="lk-count">
                          <i className={`lk-dot ${n > 0 ? 'lk-dot--live' : ''}`} aria-hidden />
                          {countLabel(live, r.slug)}
                        </span>
                        <button className="lk-btn lk-btn--sm lk-btn--soft" onClick={() => goToRoom(r.slug)} aria-label={`Enter ${r.name}`}>
                          Enter
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="safety" className="lk-section">
          <div className="lk-wrap lk-split">
            <div>
              <span className="lk-eyebrow">Safety</span>
              <h2 className="lk-h2">You stay in control.</h2>
              <p className="lk-sub">Cozy only works when everyone feels safe. If something feels off, you have tools right away.</p>
            </div>
            <ul className="lk-safety">
              {SAFETY.map((s) => (
                <li key={s.title}>
                  <span className="lk-points__icon"><Icon d={I.shield} /></span>
                  <span>
                    <b>{s.title}</b>
                    {s.body}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lk-final">
          <div className="lk-wrap">
            <div className="lk-final__card">
              <LeyparkMark size={72} className="lk-final__mark" />
              <h2 className="lk-h2 lk-h2--xl">Your room is waiting.</h2>
              <LivePill live={live} />
              <button className="lk-btn lk-btn--lg" onClick={goPlay}>
                Play free
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="lk-foot">
        <div className="lk-wrap lk-foot__row">
          <a className="lk-home" href="/" aria-label="Leypark home">
            <LeyparkLogo size={28} />
          </a>
          <nav aria-label="Footer">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <a href="/play">Play</a>
            <a href="/leaderboards">Ranking</a>
          </nav>
          <span className="lk-foot__fine">© Leypark</span>
        </div>
      </footer>
    </div>
  );
}
