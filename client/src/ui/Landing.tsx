import { useEffect, useState } from 'react';
import { SYSTEM_ROOMS, TABLE_GAMES, TABLE_GAME_KINDS } from '@dovey/shared';
import { fetchRooms } from '../api';
import { goPlay, goToRoom } from '../router';
import { GoogleButton } from './GoogleButton';
import { LeyparkLogo } from './LeyparkLogo';
import './landing.css';

/**
 * Marketing landing page at `/`: a pasar malam at night. Real in-game
 * screenshots, and live counts of real players (bots excluded server-side)
 * from the rooms API. No Pixi here: the game bundle loads only when someone steps in.
 */

/** only offer Google sign-in once it is configured; a disabled button reads as broken to visitors */
const GOOGLE_ON = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

const SHOTS = [
  { src: '/landing/wonder-dome.jpg', label: 'Wonder Dome', slug: 'wonderdome' },
  { src: '/landing/game-den.jpg', label: 'Game Den', slug: 'gameden' },
  { src: '/landing/main-lobby.jpg', label: 'Main Lobby', slug: 'mainlobby' },
];

/** stall copy per system room; rooms without a screenshot get a themed placeholder */
const WORLD_INFO: Record<string, { tag: string; blurb: string; img?: string; glyph: string; adult?: boolean }> = {
  mainlobby: { tag: 'Tempat lepak', glyph: '⛲', img: '/landing/main-lobby.jpg', blurb: 'Taman besar tempat semua jumpa. Maze pagar, air pancut, locals ajak borak.' },
  harborwalk: { tag: 'Santai', glyph: '⛵', blurb: 'Jalan tepi laut, bot dan angin petang. Duduk, borak, chill.' },
  lovemeter: { tag: '18+', glyph: '💘', adult: true, blurb: 'Beratur, kena match, video call 30 saat. Satu bilik tengok meter cinta naik.' },
  rocketlab: { tag: 'Showcase', glyph: '🚀', blurb: 'Roket, krew dan angkasa lepas. Naik atas, tengok bintang.' },
  sunsetcove: { tag: 'Santai', glyph: '🌅', blurb: 'Pasir, ombak dan matahari terbenam yang tak habis-habis.' },
  dreamsuite: { tag: 'Tempat lepak', glyph: '☁️', blurb: 'Awan pastel, bantal lembut. Bilik paling selesa nak lepak.' },
  wonderdome: { tag: 'Taman tema', glyph: '🎢', img: '/landing/wonder-dome.jpg', blurb: 'Roller coaster kayu, karusel, cawan pusing dan drop tower dengan sesiapa ada.' },
  gameden: { tag: 'Game', glyph: '🎲', img: '/landing/game-den.jpg', blurb: 'Duduk depan orang, terus main. Menang dapat coin.' },
  casino: { tag: 'Game', glyph: '🎰', blurb: 'Dadu, Wheel of Fortune dan meja Holodice. Golek sama-sama, riuh macam pasar.' },
  kitchen: { tag: 'Co-op', glyph: '🍳', blurb: 'Masak sama-sama dengan geng. Berdiri atas rug, tekan Start, jom!' },
};

const GAMES = [
  {
    slug: 'gameden',
    name: 'Game Den',
    sign: 'Meja Game',
    blurb: `${TABLE_GAME_KINDS.map((k) => TABLE_GAMES[k].name).join(', ')}. Duduk je, match terus start.`,
  },
  { slug: 'casino', name: 'Casino', sign: 'Gerai Dadu', blurb: 'Golek dadu, pusing roda, tengok siapa paling ong malam ni.' },
  { slug: 'kitchen', name: 'Kitchen', sign: 'Dapur Geng', blurb: 'Berdiri atas rug dengan geng, tekan Start, masak satu round sama-sama.' },
];

const FEATURES = [
  { icon: '🏠', title: 'Buat bilik sendiri', body: 'Susun perabot, pusing, share link. Kawan terus sampai sebelah kau.' },
  { icon: '🎲', title: 'Main game dengan geng', body: 'Board game, dadu, masak co-op. Takde orang? Bot pun sudi lawan.' },
  { icon: '📹', title: 'Video call kawan', body: 'Tekan avatar, call voice atau video terus dari bilik yang sama.' },
  { icon: '🎙️', title: 'Suara bila dekat', body: 'Buka mic, orang sebelah dengar. Jalan jauh sikit, suara pudar.' },
];

const SAFETY = [
  { title: 'Block & report sekali tekan', body: 'Dari mana-mana avatar. Orang yang kau block tak nampak chat kau, tak boleh call.' },
  { title: 'Chat ditapis', body: 'Setiap mesej disemak di server, ada had spam.' },
  { title: 'Moderator betul', body: 'Report masuk queue, orang sebenar semak dengan konteks.' },
  { title: 'Suara hanya bila dekat', body: 'Takde siapa dengar kau kecuali kau buka mic dan berdiri dekat.' },
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

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function useRotator(n: number, ms: number, paused: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms, paused]);
  return i;
}

function pillText(live: Live) {
  if (live.state === 'loading') return 'Tengah kira kawan online…';
  if (live.state === 'error') return 'Buka 24 jam · percuma';
  if (live.total === 0) return 'Jadi yang pertama lepak malam ni';
  return `${live.total} kawan online sekarang`;
}

const BULBS = 23;
const SAG = 34;

/** a string of festival lights hung across the top of the hero */
function StringLights() {
  return (
    <div className="lk-lights" aria-hidden>
      <svg className="lk-lights__wire" viewBox="0 0 100 60" preserveAspectRatio="none">
        <path d={`M0 2 Q50 ${2 + SAG * 2} 100 2`} vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULBS }, (_, i) => {
        const t = (i + 0.5) / BULBS;
        return <i key={i} style={{ left: `${t * 100}%`, top: `${2 + SAG * 4 * t * (1 - t)}px`, animationDelay: `${-(i % 7) * 0.45}s` }} />;
      })}
    </div>
  );
}

function Hibiscus({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="-12 -12 24 24" aria-hidden>
      <g fill="#e8384f">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="0" cy="-5.6" rx="4.4" ry="6" transform={`rotate(${a})`} />
        ))}
      </g>
      <circle r="2.6" fill="#8e1830" />
      <path d="M0 0 L3 -8" stroke="#ffe08a" strokeWidth="1" strokeLinecap="round" />
      <circle cx="3" cy="-8" r="1.3" fill="#ffe08a" />
    </svg>
  );
}

function countText(live: Live, slug: string) {
  if (live.state !== 'ok') return live.state === 'loading' ? '…' : '';
  return `${live.bySlug[slug] ?? 0} lepak sini`;
}

export function Landing() {
  const live = useLiveCount();
  const reduced = useReducedMotion();
  const shot = useRotator(SHOTS.length, 4200, reduced);
  const [scrolled, setScrolled] = useState(false);
  const liveOn = live.state === 'ok' && live.total > 0;

  // the app locks the page for the game, so the landing scrolls inside its own container
  return (
    <div className="lk" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}>
      <header className={`lk-nav ${scrolled ? 'lk-nav--solid' : ''}`}>
        <div className="lk-wrap lk-nav__row">
          <a className="lk-home" href="/" aria-label="Leypark, laman utama">
            <LeyparkLogo />
          </a>
          <nav className="lk-nav__links" aria-label="Bahagian">
            <a href="#dunia">Dunia</a>
            <a href="#main">Main</a>
            <a href="#kawan">Kawan</a>
            <a href="#selamat">Selamat</a>
          </nav>
          <button className="lk-btn lk-btn--sm" onClick={goPlay}>
            Jom Main!
          </button>
        </div>
      </header>

      <main>
        <section className="lk-hero">
          <StringLights />
          <div className="lk-wrap lk-hero__grid">
            <div className="lk-hero__copy">
              <span className="lk-pill" aria-live="polite">
                <i className={`lk-dot ${liveOn ? 'lk-dot--live' : ''}`} />
                {pillText(live)}
              </span>
              <h1 className="lk-h1">
                Jumpa kawan baru — <span className="lk-h1__glow">atau cinta hati kau</span> <span aria-hidden>💘</span>
              </h1>
              <p className="lk-lead">Bukan random chat. Lepak, main, kenal betul{'‑'}betul.</p>
              <p className="lk-lead lk-lead--small">Terus dalam browser — tak payah download.</p>
              <div className="lk-cta">
                <button className="lk-btn lk-btn--lg" onClick={goPlay}>
                  Jom Main!
                </button>
                <a className="lk-btn lk-btn--ghost lk-btn--lg" href="#dunia">
                  Tengok dunia
                </a>
                {GOOGLE_ON && <GoogleButton onDone={goPlay} />}
              </div>
              <p className="lk-note">Ciri cinta &amp; bilik romantik untuk 18+ sahaja.</p>
            </div>

            <div className="lk-hero__visual">
              <img className="lk-wau" src="/leypark-mark.svg" alt="" width={112} height={112} />
              <Hibiscus className="lk-flower lk-flower--a" />
              <Hibiscus className="lk-flower lk-flower--b" />
              <figure className="lk-gerai">
                <div className="lk-awning" aria-hidden />
                <div className="lk-gerai__screen">
                  {SHOTS.map((s, i) => (
                    <img key={s.src} src={s.src} alt={i === shot ? `${s.label}, dalam game` : ''} className={i === shot ? 'on' : ''} loading={i === 0 ? 'eager' : 'lazy'} />
                  ))}
                  <span className="lk-tag">
                    <b>LIVE</b> {SHOTS[shot].label}
                  </span>
                </div>
                <div className="lk-gerai__counter" aria-hidden />
              </figure>
            </div>
          </div>
        </section>

        <div className="lk-songket" aria-hidden />

        <section id="dunia" className="lk-section">
          <div className="lk-wrap">
            <div className="lk-head">
              <span className="lk-eyebrow">Dunia</span>
              <h2 className="lk-h2">Pilih gerai, terus masuk.</h2>
              <p className="lk-sub">Setiap bilik ada orang betul dalamnya. Kiraan di bawah ni orang je, bot tak dikira.</p>
            </div>
            <div className="lk-stalls">
              {SYSTEM_ROOMS.map((r) => {
                const w = WORLD_INFO[r.slug] ?? { tag: r.category, glyph: '🏮', blurb: 'Bilik rasmi Leypark.' };
                const n = live.state === 'ok' ? (live.bySlug[r.slug] ?? 0) : 0;
                return (
                  <article key={r.slug} className={`lk-stall lk-stall--${r.theme}`}>
                    <div className="lk-stall__awning" aria-hidden />
                    <div className="lk-stall__art">
                      {w.img ? (
                        <img src={w.img} alt={`${r.name}, dalam game`} loading="lazy" />
                      ) : (
                        <span className="lk-stall__glyph" aria-hidden>
                          {w.glyph}
                        </span>
                      )}
                      <span className={`lk-stall__tag ${w.adult ? 'lk-stall__tag--adult' : ''}`}>{w.tag}</span>
                    </div>
                    <div className="lk-stall__body">
                      <h3>{r.name}</h3>
                      <p>{w.blurb}</p>
                      <div className="lk-stall__foot">
                        <span className="lk-count">
                          <i className={`lk-dot ${n > 0 ? 'lk-dot--live' : ''}`} />
                          {countText(live, r.slug)}
                        </span>
                        <button className="lk-btn lk-btn--sm" onClick={() => goToRoom(r.slug)} aria-label={`Masuk ${r.name}`}>
                          Masuk
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="main" className="lk-section lk-section--maroon">
          <div className="lk-wrap">
            <div className="lk-head">
              <span className="lk-eyebrow">Main</span>
              <h2 className="lk-h2">Gerai game dah buka.</h2>
              <p className="lk-sub">Tarik kerusi, ajak geng, atau lawan sesiapa yang ada.</p>
            </div>
            <div className="lk-signs">
              {GAMES.map((g) => (
                <article key={g.slug} className="lk-sign">
                  <span className="lk-sign__board">{g.sign}</span>
                  <h3>{g.name}</h3>
                  <p>{g.blurb}</p>
                  <div className="lk-sign__foot">
                    <span className="lk-count">
                      <i className={`lk-dot ${live.state === 'ok' && (live.bySlug[g.slug] ?? 0) > 0 ? 'lk-dot--live' : ''}`} />
                      {countText(live, g.slug)}
                    </span>
                    <button className="lk-btn lk-btn--sm" onClick={() => goToRoom(g.slug)} aria-label={`Masuk ${g.name}`}>
                      Masuk
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="kawan" className="lk-section">
          <div className="lk-wrap">
            <div className="lk-head">
              <span className="lk-eyebrow">Kawan</span>
              <h2 className="lk-h2">Kenal orang macam lepak kat pasar malam.</h2>
            </div>
            <div className="lk-features">
              {FEATURES.map((f) => (
                <article key={f.title} className="lk-feature">
                  <span className="lk-feature__icon" aria-hidden>
                    {f.icon}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="selamat" className="lk-section lk-section--teal">
          <div className="lk-wrap lk-split">
            <div>
              <span className="lk-eyebrow">Selamat</span>
              <h2 className="lk-h2">Lepak dengan tenang.</h2>
              <p className="lk-sub">Kalau ada yang tak kena, kau yang pegang kawalan.</p>
              <p className="lk-note">Ciri cinta &amp; bilik romantik untuk 18+ sahaja.</p>
            </div>
            <ul className="lk-safety">
              {SAFETY.map((s) => (
                <li key={s.title}>
                  <b>{s.title}</b>
                  <span>{s.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lk-final">
          <div className="lk-wrap">
            <div className="lk-final__card">
              <img className="lk-final__wau" src="/leypark-mark.svg" alt="" width={72} height={72} />
              <h2 className="lk-h2">Jom, kawan dah tunggu!</h2>
              <p className="lk-sub" aria-live="polite">
                {live.state === 'ok'
                  ? live.total > 0
                    ? `${live.total} kawan tengah lepak dalam ni.`
                    : 'Jadi yang pertama lepak malam ni.'
                  : 'Percuma, terus dalam browser.'}
              </p>
              <button className="lk-btn lk-btn--lg" onClick={goPlay}>
                Jom Main!
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="lk-foot">
        <div className="lk-wrap lk-foot__row">
          <a className="lk-home" href="/" aria-label="Leypark, laman utama">
            <LeyparkLogo size={26} className="lk-logo--small" />
          </a>
          <nav aria-label="Pautan bawah">
            <a href="/play">Main</a>
            <a href="#dunia">Dunia</a>
            <a href="#kawan">Kawan</a>
            <a href="#selamat">Selamat</a>
          </nav>
          <span className="lk-foot__fine">© Leypark · Dibuat di Malaysia 🇲🇾</span>
        </div>
      </footer>
    </div>
  );
}
