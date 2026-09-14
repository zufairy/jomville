import { useEffect, useState } from 'react';
import { FURNITURE, SYSTEM_ROOMS, TABLE_GAMES, TABLE_GAME_KINDS } from '@dovey/shared';
import { fetchRooms } from '../api';
import { goPlay, goToRoom } from '../router';
import { GoogleButton } from './GoogleButton';

/**
 * Marketing landing page at `/`. Real in-game screenshots, live player counts
 * from the rooms API, and counts read from the game's own data. No Pixi here:
 * the game bundle loads only when someone steps in.
 */

/** only offer Google sign-in once it is configured; a disabled button reads as broken to visitors */
const GOOGLE_ON = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

const SHOTS = [
  { src: '/landing/wonder-dome.jpg', label: 'Wonder Dome', slug: 'wonderdome' },
  { src: '/landing/game-den.jpg', label: 'Game Den', slug: 'gameden' },
  { src: '/landing/main-lobby.jpg', label: 'Main Lobby', slug: 'mainlobby' },
];

const WORLDS = [
  {
    slug: 'wonderdome',
    img: '/landing/wonder-dome.jpg',
    tag: 'Theme park',
    title: 'Wonder Dome',
    body: 'Ride a wooden roller coaster, a carousel, spinning teacups and a drop tower with whoever is around.',
  },
  {
    slug: 'gameden',
    img: '/landing/game-den.jpg',
    tag: 'Games',
    title: 'Game Den',
    body: 'Sit down opposite someone and a match starts. Connect Four, Reversi, Tic-Tac-Toe, Dots & Boxes.',
  },
  {
    slug: 'mainlobby',
    img: '/landing/main-lobby.jpg',
    tag: 'Hangout',
    title: 'Main Lobby',
    body: 'The park where everyone meets. A hedge maze with a prize, a fountain square and locals to chat with.',
  },
];

const FEATURES = [
  { icon: '🏠', title: 'A room that is yours', body: 'Drag furniture onto your own isometric room, rotate, undo, share the link. It saves as you go.' },
  { icon: '🎙️', title: 'Voice when you are close', body: 'Open your mic and people near you hear you. Walk away and it fades. No calls to set up.' },
  { icon: '📹', title: 'Face-to-face calls', body: 'Tap someone and call them, voice or video, right from the room you are standing in.' },
  { icon: '🎁', title: 'Capsule machines', body: 'Pull rare outfits and gear from the machine by the door. Some looks are genuinely hard to get.' },
  { icon: '🎲', title: 'Games at every table', body: 'Turn-based board games with matchmaking, rematches and a bot when nobody is free.' },
  { icon: '💬', title: 'Bubbles, emotes, duels', body: 'Chat above your head, throw emotes, challenge someone to rock-paper-scissors for coins.' },
];

function useLiveCount() {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchRooms('busy')
        .then((rooms) => alive && setOnline(rooms.reduce((n, r) => n + (r.live ?? 0), 0)))
        .catch(() => alive && setOnline(null));
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return online;
}

function useRotator(n: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms]);
  return i;
}

export function Landing() {
  const online = useLiveCount();
  const shot = useRotator(SHOTS.length, 4200);
  const [scrolled, setScrolled] = useState(false);

  // the app locks the page for the game, so the landing scrolls inside its own container
  return (
    <div className="lp" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}>
      <header className={`lp-nav ${scrolled ? 'lp-nav--solid' : ''}`}>
        <div className="lp-wrap lp-nav__row">
          <a className="lp-brand" href="/" aria-label="dovey home">
            <img src="/favicon.svg" alt="" width={30} height={30} />
            <span>dovey</span>
          </a>
          <nav className="lp-nav__links" aria-label="sections">
            <a href="#worlds">Worlds</a>
            <a href="#games">Games</a>
            <a href="#features">Features</a>
            <a href="#safety">Safety</a>
          </nav>
          <button className="lp-btn lp-btn--sm" onClick={goPlay}>
            Play free
          </button>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero__grid">
            <div className="lp-hero__copy">
              <span className="lp-pill">
                <i className={`lp-dot ${online ? 'lp-dot--live' : ''}`} />
                {online ? `${online} ${online === 1 ? 'person' : 'people'} online now` : 'Open 24/7 · free to play'}
              </span>
              <h1 className="lp-h1">
                Hang out in tiny worlds
                <span className="lp-grad"> with real people.</span>
              </h1>
              <p className="lp-lead">
                Walk into cozy rooms, ride a theme park, play board games with strangers and friends, and build a place that is yours. It runs in your
                browser. No download, no waiting.
              </p>
              <div className="lp-cta">
                <button className="lp-btn lp-btn--lg" onClick={goPlay}>
                  Play free now
                  <span aria-hidden>→</span>
                </button>
                {GOOGLE_ON && <GoogleButton onDone={goPlay} />}
              </div>
              <ul className="lp-trust">
                <li>No download</li>
                <li>Phone, tablet &amp; desktop</li>
                <li>Guest in 5 seconds</li>
              </ul>
            </div>

            <div className="lp-hero__visual">
              <div className="lp-device">
                <div className="lp-device__bar">
                  <i />
                  <i />
                  <i />
                  <span className="lp-device__url">dovey · /r/{SHOTS[shot].slug}</span>
                  <span className="lp-live">LIVE</span>
                </div>
                <div className="lp-device__screen">
                  {SHOTS.map((s, i) => (
                    <img key={s.src} src={s.src} alt={`${s.label}, in game`} className={i === shot ? 'on' : ''} loading={i === 0 ? 'eager' : 'lazy'} />
                  ))}
                  <div className="lp-bubble lp-bubble--a">anyone up for connect four?</div>
                  <div className="lp-bubble lp-bubble--b">meet at the coaster 🎢</div>
                  <div className="lp-caption">{SHOTS[shot].label}</div>
                </div>
              </div>
              <div className="lp-dots" role="tablist" aria-label="screenshots">
                {SHOTS.map((s, i) => (
                  <i key={s.src} className={i === shot ? 'on' : ''} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-stats" aria-label="dovey in numbers">
          <div className="lp-wrap lp-stats__row">
            <div>
              <b>{SYSTEM_ROOMS.length}</b>
              <span>hand-built worlds</span>
            </div>
            <div>
              <b>{TABLE_GAME_KINDS.length}</b>
              <span>multiplayer board games</span>
            </div>
            <div>
              <b>{FURNITURE.length}+</b>
              <span>pieces of furniture</span>
            </div>
            <div>
              <b>$0</b>
              <span>to play, forever</span>
            </div>
          </div>
        </section>

        <section id="worlds" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-eyebrow">Worlds</span>
              <h2 className="lp-h2">Every link is a door.</h2>
              <p className="lp-sub">Rooms are live places with people in them. Step into one straight from here.</p>
            </div>
            <div className="lp-worlds">
              {WORLDS.map((w) => (
                <button key={w.slug} className="lp-world" onClick={() => goToRoom(w.slug)}>
                  <span className="lp-world__img">
                    <img src={w.img} alt={`${w.title}, in game`} loading="lazy" />
                    <span className="lp-world__tag">{w.tag}</span>
                  </span>
                  <span className="lp-world__body">
                    <b>{w.title}</b>
                    <span>{w.body}</span>
                    <em>Enter room →</em>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="games" className="lp-section lp-section--dark">
          <div className="lp-wrap lp-split">
            <div>
              <span className="lp-eyebrow lp-eyebrow--light">Game Den</span>
              <h2 className="lp-h2">Pull up a chair. Someone will play.</h2>
              <p className="lp-sub lp-sub--light">
                Sit at a table opposite another player and the match starts on its own. Quick match finds someone in the room, and the house bot is always
                free.
              </p>
              <ul className="lp-checks">
                {TABLE_GAME_KINDS.map((k) => (
                  <li key={k}>
                    <span>{TABLE_GAMES[k].icon}</span>
                    <b>{TABLE_GAMES[k].name}</b>
                    <em>{TABLE_GAMES[k].blurb}</em>
                  </li>
                ))}
              </ul>
              <button className="lp-btn" onClick={() => goToRoom('gameden')}>
                Play in the Game Den
              </button>
            </div>
            <div className="lp-board" aria-hidden>
              <div className="lp-board__card">
                <div className="lp-board__head">
                  <span className="lp-chip lp-chip--on">
                    <i className="r" /> you
                  </span>
                  <span className="lp-board__vs">vs</span>
                  <span className="lp-chip">
                    <i className="y" /> maya_k
                  </span>
                </div>
                <div className="lp-c4">
                  {Array.from({ length: 42 }, (_, i) => {
                    const filled: Record<number, string> = { 38: 'r', 37: 'y', 39: 'y', 31: 'r', 32: 'r', 30: 'y', 24: 'r', 40: 'r', 33: 'y' };
                    return <i key={i} className={`${filled[i] ?? ''} ${i === 24 ? 'drop' : ''}`} />;
                  })}
                </div>
                <div className="lp-board__turn">your turn · 0:24</div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-eyebrow">Features</span>
              <h2 className="lp-h2">Everything you need to hang out.</h2>
            </div>
            <div className="lp-features">
              {FEATURES.map((f) => (
                <article key={f.title} className="lp-feature">
                  <span className="lp-feature__icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--tint">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-eyebrow">Get started</span>
              <h2 className="lp-h2">In a room in under a minute.</h2>
            </div>
            <ol className="lp-steps">
              <li>
                <b>Pick a look</b>
                <span>Choose a name and an outfit. You can change both any time.</span>
              </li>
              <li>
                <b>Walk into a room</b>
                <span>Tap anywhere to walk. Say hi, sit down, grab a ride or a game.</span>
              </li>
              <li>
                <b>Make it yours</b>
                <span>Decorate your own room and send the link to friends. They land right next to you.</span>
              </li>
            </ol>
          </div>
        </section>

        <section id="safety" className="lp-section">
          <div className="lp-wrap lp-split lp-split--safety">
            <div>
              <span className="lp-eyebrow">Safety</span>
              <h2 className="lp-h2">Friendly by design.</h2>
              <p className="lp-sub">Block and report are one tap away on every player. Blocked people cannot see your chat, call you or hear your voice.</p>
            </div>
            <ul className="lp-safety">
              <li>
                <b>One-tap block &amp; report</b>
                <span>From any avatar, anywhere.</span>
              </li>
              <li>
                <b>Chat filter &amp; rate limits</b>
                <span>Every message is checked on the server.</span>
              </li>
              <li>
                <b>Human moderation queue</b>
                <span>Reports reach real moderators with context.</span>
              </li>
              <li>
                <b>Voice only up close</b>
                <span>Nobody hears you unless you open your mic and are nearby.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-final">
          <div className="lp-wrap lp-final__card">
            <h2 className="lp-h2 lp-h2--light">Your next favourite hangout is one tap away.</h2>
            <p className="lp-sub lp-sub--light">{online ? `${online} ${online === 1 ? 'person is' : 'people are'} inside right now.` : 'Free, in your browser, on any device.'}</p>
            <button className="lp-btn lp-btn--lg lp-btn--light" onClick={goPlay}>
              Play free now <span aria-hidden>→</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__row">
          <a className="lp-brand lp-brand--small" href="/">
            <img src="/favicon.svg" alt="" width={22} height={22} />
            <span>dovey</span>
          </a>
          <nav aria-label="footer">
            <a href="/play">Play</a>
            <a href="#worlds">Worlds</a>
            <a href="#games">Games</a>
            <a href="#safety">Safety</a>
          </nav>
          <span className="lp-foot__fine">© {new Date().getFullYear()} dovey · be kind in rooms</span>
        </div>
      </footer>
    </div>
  );
}
