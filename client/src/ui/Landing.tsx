import { useEffect, useState } from "react";
import { fetchRooms } from "../api";
import { goPlay, goToRoom } from "../router";
import { GoogleButton } from "./GoogleButton";
import { LeyparkLogo } from "./LeyparkLogo";
import "./landing.css";

const GOOGLE_ON = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
const NAV = [
  { href: "#how", label: "The lepak plan" },
  { href: "#kitchen", label: "Play together" },
  { href: "#love", label: "Find your person" },
];
type Live =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ok"; total: number; bySlug: Record<string, number> };

/** real players online, polled every 20s; per-room counts come from the same response */
function useLiveCount(): Live {
  const [live, setLive] = useState<Live>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchRooms("busy")
        .then((rooms) => {
          if (!alive) return;
          const bySlug: Record<string, number> = {};
          for (const r of rooms) bySlug[r.slug] = r.live ?? 0;
          setLive({
            state: "ok",
            total: rooms.reduce((n, r) => n + (r.live ?? 0), 0),
            bySlug,
          });
        })
        // keep the last good numbers through a blip; only fall back when there were none
        .catch(
          () =>
            alive &&
            setLive((prev) =>
              prev.state === "ok" ? prev : { state: "error" },
            ),
        );
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
  if (n === 0) return "Be the first one here tonight";
  return n === 1
    ? "1 person online now"
    : `${n.toLocaleString("en")} people online now`;
}

function pillText(live: Live) {
  if (live.state === "loading") return "Checking who’s online…";
  if (live.state === "error") return "Free to play, right in your browser";
  return peopleOnline(live.total);
}

function LivePill({ live }: { live: Live }) {
  const on = live.state === "ok" && live.total > 0;
  return (
    <span className="lk-pill" aria-live="polite">
      <i className={`lk-dot ${on ? "lk-dot--live" : ""}`} aria-hidden />
      {pillText(live)}
    </span>
  );
}

function Flower({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
    >
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse
          key={r}
          cx="50"
          cy="28"
          rx="17"
          ry="25"
          transform={`rotate(${r} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="9" fill="#f8efdd" />
    </svg>
  );
}

function CallPreview() {
  const [mode, setMode] = useState<"video" | "voice">("video");
  return (
    <div className="lk-call-demo">
      <div className="lk-demo-top">
        <span>
          <i className="lk-dot lk-dot--live" /> A little closer, even from afar
        </span>
        <span>CALL PREVIEW</span>
      </div>
      <div className="lk-call-tabs" aria-label="Call preview mode">
        <button
          aria-pressed={mode === "video"}
          onClick={() => setMode("video")}
        >
          Video call
        </button>
        <button
          aria-pressed={mode === "voice"}
          onClick={() => setMode("voice")}
        >
          Voice call
        </button>
      </div>
      <div className={`lk-call-scene lk-call-scene--${mode}`}>
        <img
          src="/landing/call-friends.jpg"
          alt="Illustrated Malaysian adults laughing together on a video call"
          loading="lazy"
          width="1536"
          height="1024"
        />
        {mode === "voice" && (
          <div className="lk-voice-overlay">
            <span className="lk-voice-heart">♡</span>
            <strong>Just your voices. All the butterflies.</strong>
            <div className="lk-wave" aria-hidden="true">
              {Array.from({ length: 23 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    animationDelay: `${i * -0.13}s`,
                    transform: `scaleY(${0.3 + (i % 5) * 0.17})`,
                  }}
                />
              ))}
            </div>
            <span>A late-night lepak kind of conversation</span>
          </div>
        )}
        {mode === "video" && (
          <div className="lk-call-names">
            <span>Aina · PJ</span>
            <span>Jun · Penang</span>
          </div>
        )}
      </div>
      <div className="lk-demo-bottom">
        <span>
          {mode === "video"
            ? "See the smile behind the avatar."
            : "Camera off. Conversation on."}
        </span>
        <span className="lk-call-end" aria-hidden="true">
          ⌁
        </span>
      </div>
    </div>
  );
}

export function Landing() {
  const live = useLiveCount();
  const [motionPaused, setMotionPaused] = useState(false);
  return (
    <div className={`lk ${motionPaused ? "lk--paused" : ""}`}>
      <a className="lk-skip" href="#main">
        Skip to content
      </a>
      <header className="lk-nav">
        <div className="lk-wrap lk-nav-row">
          <a href="/" aria-label="Leypark home">
            <LeyparkLogo size={36} />
          </a>
          <nav aria-label="Main navigation">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
          <a className="lk-nav-login" href="#join">
            Log in
          </a>
          <button className="lk-btn lk-btn--small" onClick={goPlay}>
            Jom, play free <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      <main id="main">
        <section className="lk-hero lk-wrap">
          <div className="lk-hero-copy">
            <span className="lk-eyebrow">
              <span className="lk-mini-flower">✳</span> A little Malaysian. A
              lot of connection.
            </span>
            <h1>
              Come for
              <br />
              the <em>lepak.</em>
              <br />
              Stay for{" "}
              <span className="lk-love-word">
                the love.
                <svg viewBox="0 0 360 20" aria-hidden="true">
                  <path d="M3 12Q170 -2 355 9M30 18Q185 5 322 14" />
                </svg>
              </span>
            </h1>
            <p>
              Your next “jom makan?” could be the love of your life. Meet new
              people, cook up a little chaos, and let something real begin.
            </p>
            <div className="lk-actions">
              <button className="lk-btn" onClick={goPlay}>
                Find your people <span aria-hidden="true">↗</span>
              </button>
              <a className="lk-text-link" href="#how">
                Take a look around <span aria-hidden="true">↓</span>
              </a>
            </div>
            <span className="lk-note">
              Free to play · No download · Romance features 18+
            </span>
            <LivePill live={live} />
          </div>
          <div className="lk-hero-art">
            <span className="lk-malaysia lk-malaysia--kl">KL</span>
            <span className="lk-malaysia lk-malaysia--hibiscus">✺</span>
            <span className="lk-malaysia lk-malaysia--ketupat">◆</span>
            <span className="lk-stamp">
              MADE FOR
              <br />
              <b>
                the jom
                <br />
                generation.
              </b>
            </span>
            <img
              className="lk-hero-img"
              src="/landing/lepak-world.jpg"
              alt="Illustrated Malaysian kopitiam world with friends, a couple, hawker cooking and the KL skyline"
              width="1536"
              height="1024"
              fetchPriority="high"
            />
            <div className="lk-float lk-float--chat">
              <span className="lk-float-avatar">a.</span>
              <span>
                <b>Same time tomorrow?</b>
                <small>And just like that, a little spark.</small>
              </span>
              <span className="lk-heart">♡</span>
            </div>
            <div className="lk-art-caption">
              A little taste of the Leypark feeling · Concept illustration
            </div>
            <Flower className="lk-hero-flower" />
          </div>
        </section>
        <div className="lk-culture">
          <div className="lk-wrap">
            <span>Lepak, laugh, repeat.</span>
            <span aria-hidden="true">✳</span>
            <span>From “hi lah” to “sayang”.</span>
            <span aria-hidden="true">✳</span>
            <span>Your kind of people.</span>
            <button
              onClick={() => setMotionPaused((v) => !v)}
              aria-pressed={motionPaused}
            >
              {motionPaused ? "Play motion" : "Pause motion"}
            </button>
          </div>
        </div>
        <section id="how" className="lk-section lk-wrap">
          <div className="lk-section-heading">
            <div>
              <span className="lk-eyebrow">
                Good company. Zero awkward openings.
              </span>
              <h2>
                A meet-cute with
                <br />
                something to do.
              </h2>
            </div>
            <p>
              Like your favourite mamak table, there’s always room for one more.
              Drop in as yourself. See who you click with.
            </p>
          </div>
          <div className="lk-plan">
            <article>
              <span>01 / SAY HELLO</span>
              <h3>Find your lepak spot.</h3>
              <p>
                Make an avatar, wander into a room, and meet the people already
                there.
              </p>
            </article>
            <article>
              <span>02 / BREAK THE ICE</span>
              <h3>Play a little. Laugh a lot.</h3>
              <p>
                Team up in the kitchen or sit down for a board game. The
                conversation comes naturally.
              </p>
            </article>
            <article>
              <span>03 / FEEL THE SPARK</span>
              <h3>Make “one more round” a thing.</h3>
              <p>
                Keep talking on voice or video. Maybe a new friend. Maybe your
                favourite person.
              </p>
            </article>
          </div>
        </section>
        <section id="kitchen" className="lk-kitchen">
          <div className="lk-wrap lk-feature-grid">
            <div className="lk-kitchen-art">
              <img
                src="/landing/kitchen-party.jpg"
                alt="Concept illustration of four chefs teaming up in a Malaysian-inspired co-op kitchen"
                loading="lazy"
                width="1536"
                height="1024"
              />
              <span className="lk-order">
                ORDER UP! <b>A little chaos. A lot of chemistry.</b>
              </span>
              <small>
                Promotional illustration · Explore the playable Kitchen below
              </small>
            </div>
            <div className="lk-feature-copy">
              <span className="lk-eyebrow">Co-op kitchen / maximum kecoh</span>
              <h2>
                Can you handle
                <br />
                the heat <em>together?</em>
              </h2>
              <p>
                Chop, cook, plate, panic. Jump into Leypark’s co-op Kitchen and
                turn a bunch of strangers into your dream team.
              </p>
              <p>
                Someone’s on prep. Someone’s on the stove. Someone might just
                steal your heart.
              </p>
              <div className="lk-tags">
                <span>Cook together</span>
                <span>Beat the clock</span>
                <span>Find your teammate</span>
              </div>
              <button className="lk-btn" onClick={() => goToRoom("kitchen")}>
                Jom, masuk kitchen <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </section>
        <section
          id="video-calls"
          className="lk-section lk-wrap lk-feature-grid lk-calls-section"
        >
          <div className="lk-feature-copy">
            <span className="lk-eyebrow">Voice & video calls</span>
            <h2>
              Less typing.
              <br />
              More <em>“you lah”.</em>
            </h2>
            <p>
              Hear their laugh. Catch that smile. Start a voice or video call
              from their profile when you both feel like talking.
            </p>
            <ul className="lk-call-points">
              <li>Voice for the shy-shy first hello.</li>
              <li>Video when you’re ready to go face to face.</li>
              <li>Calls are opt-in. You choose who gets close.</li>
            </ul>
            <a className="lk-text-link" href="#join">
              Meet someone worth unmuting for ↗
            </a>
          </div>
          <div>
            <CallPreview />
            <p className="lk-caption">
              Illustrated preview with fictional people. Switch tabs to explore.
            </p>
          </div>
        </section>

        <section id="soulmate" className="lk-soulmate">
          <div className="lk-wrap lk-soulmate-grid">
            <div className="lk-soulmate-art" aria-hidden="true">
              <div className="lk-date-card lk-date-card--one">
                <span className="lk-person lk-person--a">A</span>
                <b>"jom cook?"</b>
                <small>first round: chaos</small>
              </div>
              <div className="lk-date-card lk-date-card--two">
                <span className="lk-person lk-person--b">S</span>
                <b>"same table tomorrow?"</b>
                <small>second round: butterflies</small>
              </div>
              <div className="lk-mamak-table">
                <i className="lk-teh lk-teh--one" />
                <i className="lk-teh lk-teh--two" />
                <span className="lk-roti">♡</span>
              </div>
              <span className="lk-spark lk-spark--one">✦</span>
              <span className="lk-spark lk-spark--two">✺</span>
              <span className="lk-spark lk-spark--three">♡</span>
            </div>
            <div className="lk-feature-copy">
              <span className="lk-eyebrow">Find the love of your life</span>
              <h2>
                Start with a game.
                <br />End up with
                <br /><em>someone special.</em>
              </h2>
              <p>
                Leypark gives you the easiest first move: cook together, ride together,
                talk on voice, then see if the vibe becomes something more.
              </p>
              <div className="lk-love-steps">
                <span><b>1</b> Match the vibe</span>
                <span><b>2</b> Play, laugh, talk</span>
                <span><b>3</b> Meet again tomorrow</span>
              </div>
              <button className="lk-btn" onClick={goPlay}>
                Register and find your person <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </section>
        <section id="love" className="lk-love">
          <div className="lk-wrap lk-love-grid">
            <div>
              <span className="lk-eyebrow">
                A little courage. A little chemistry.{" "}
                <b className="lk-age">18+</b>
              </span>
              <h2>
                Maybe your forever
                <br />
                starts with
                <br />
                <em>“jom, one game?”</em>
              </h2>
              <p>
                You don’t need the perfect opening line. Just a place to be
                yourself, a shared laugh, and someone who wants to stay for
                another round.
              </p>
              <button className="lk-btn" onClick={() => goToRoom("lovemeter")}>
                Meet someone new <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="lk-love-note">
              <Flower className="lk-note-flower" />
              <span>THE LOVE METER</span>
              <h3>
                A hello.
                <br />A few butterflies.
                <br />A possibility.
              </h3>
              <p>
                Enter the Love Meter room, join a lane, and get paired for a
                30-second video chat.
              </p>
              <small>
                The meter is just for fun. The connection is yours to discover.
                For adults 18+.
              </small>
            </div>
          </div>
        </section>
        <section id="worlds" className="lk-section lk-wrap">
          <div className="lk-section-heading">
            <div>
              <span className="lk-eyebrow">Make a night of it</span>
              <h2>
                Your next hangout
                <br />
                is just a click away.
              </h2>
            </div>
            <a className="lk-text-link" href="/leaderboards">
              Meet the leaderboard regulars ↗
            </a>
          </div>
          <div className="lk-worlds">
            {[
              {
                slug: "mainlobby",
                name: "The Main Lobby",
                text: "Your first hello starts here.",
                img: "main-lobby.jpg",
              },
              {
                slug: "wonderdome",
                name: "Wonder Dome",
                text: "A little theme-park date energy.",
                img: "wonder-dome.jpg",
              },
              {
                slug: "gameden",
                name: "Game Den",
                text: "A friendly rivalry is a good start.",
                img: "game-den.jpg",
              },
            ].map((w) => (
              <button
                className="lk-world"
                key={w.slug}
                onClick={() => goToRoom(w.slug)}
              >
                <img
                  src={`/landing/${w.img}`}
                  alt={`${w.name} actual gameplay screenshot`}
                  loading="lazy"
                  width="1512"
                  height="800"
                />
                <span>
                  <b>{w.name}</b>
                  <span aria-hidden="true">↗</span>
                </span>
                <small>{w.text}</small>
              </button>
            ))}
          </div>
          <p className="lk-caption">
            Actual Leypark worlds. Build and decorate your own room, too.
          </p>
        </section>
        <section id="safety" className="lk-safety lk-wrap">
          <div>
            <span className="lk-eyebrow">Your pace. Your space.</span>
            <h2>Good vibes need boundaries.</h2>
          </div>
          <p>
            Accept calls when you want to. Block or report from a profile when
            you need to. Romance features are for adults 18+.
          </p>
        </section>
        <section id="join" className="lk-join">
          <div className="lk-wrap">
            <Flower className="lk-join-flower" />
            <span className="lk-eyebrow">Your people are a hello away</span>
            <h2>
              Okay, enough scrolling.
              <br />
              <em>Jom lepak.</em>
            </h2>
            <p>Make your avatar. Find your table. See where the night goes.</p>
            <div className="lk-join-actions">
              {GOOGLE_ON && <GoogleButton onDone={goPlay} />}
              <button className="lk-btn" onClick={goPlay}>
                {GOOGLE_ON ? "Continue to sign in" : "Set up Google login"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            <span className="lk-note">
              Free in your browser. Google login keeps your account safe.
            </span>
          </div>
        </section>
      </main>
      <footer className="lk-wrap lk-footer">
        <a href="/" aria-label="Leypark home">
          <LeyparkLogo size={30} />
        </a>
        <span>A little lepak. A little love.</span>
        <nav aria-label="Footer">
          <a href="#safety">Safety</a>
          <a href="/leaderboards">Rankings</a>
          <a href="#join">Join Leypark</a>
        </nav>
        <small>© {new Date().getFullYear()} Leypark</small>
      </footer>
    </div>
  );
}
