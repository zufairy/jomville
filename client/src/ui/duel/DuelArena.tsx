import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { AvatarConfig, DUEL_REWARD, parseAvatar } from '@dovey/shared';
import { useAppStore } from '../../store';
import { useRoster } from '../../roster';
import { setSfxMuted, sfx, sfxMuted } from '../../audio';
import { FxLayer } from '../../game/duelFx';
import { AvatarPreview } from '../AvatarPreview';
import { VipModal } from '../VipModal';
import { HAND_NAMES, HandIcon, HandPick } from './HandIcon';
import { CoinGlyph } from './StakePicker';
import { canCover, resultCoins, resultNet } from './stakes';
import { COUNT_WORDS, RevealFrame, pickRingMs, useCountUp, useDuelTimeline } from './useDuelTimeline';
import './duel.css';

/** which side of the screen took the round: left is always you */
type Outcome = 'left' | 'right' | 'draw';

function useMatchMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const sync = () => setOn(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, [query]);
  return on;
}

/** A player's look: my local avatar for me, the roster copy for anyone else in the room. */
function useLook(sessionId: string): AvatarConfig | null {
  const mySession = useAppStore((s) => s.sessionId);
  const myAvatar = useAppStore((s) => s.avatar);
  const raw = useRoster((s) => (sessionId ? s.players[sessionId]?.avatar : undefined));
  return useMemo(() => (sessionId && sessionId === mySession ? myAvatar : raw ? parseAvatar(raw) : null), [sessionId, mySession, myAvatar, raw]);
}

function MuteToggle() {
  const [off, setOff] = useState(sfxMuted());
  return (
    <button
      className="dhd-mute"
      aria-pressed={off}
      aria-label={off ? 'sound is off' : 'sound is on'}
      onClick={() => {
        setSfxMuted(!off);
        setOff(!off);
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {off ? (
          <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

function Pips({ score, label }: { score: number; label: string }) {
  return (
    <div className="dhd-pips" role="img" aria-label={`${label}: ${score} of 2`}>
      {[0, 1].map((i) => (
        <i key={i} className={i < score ? 'on' : ''} />
      ))}
    </div>
  );
}

interface FighterProps {
  side: 'left' | 'right';
  sessionId: string;
  name: string;
  scale: number;
  pose: string;
  thinking?: boolean;
  pop?: boolean;
}

function Fighter({ side, sessionId, name, scale, pose, thinking = false, pop = false }: FighterProps) {
  const cfg = useLook(sessionId);
  return (
    <div className={`dhd-fighter dhd-fighter--${side} ${pose}`}>
      <div className="dhd-fighter__body">
        <div className="dhd-fighter__shadow" aria-hidden />
        {cfg ? (
          <AvatarPreview cfg={cfg} focus="full" scale={scale} animate={false} dir={side === 'left' ? 1 : 3} className="dhd-fighter__img" />
        ) : (
          <div className="dhd-fighter__img dhd-fighter__ghost" style={{ width: 64 * scale, height: 64 * scale }} aria-hidden />
        )}
        {thinking && (
          <div className="dhd-dots" role="status" aria-label={`${name} is thinking`}>
            <i />
            <i />
            <i />
          </div>
        )}
        {pop && (
          <div className="dhd-fighter__pop" aria-hidden>
            -1
          </div>
        )}
      </div>
      <div className="dhd-fighter__name">{name}</div>
    </div>
  );
}

function PickTimer({ round, ms, resting }: { round: number; ms: number; resting: boolean }) {
  const [left, setLeft] = useState(Math.ceil(ms / 1000));
  useEffect(() => {
    if (resting) return;
    const start = performance.now();
    setLeft(Math.ceil(ms / 1000));
    const id = window.setInterval(() => setLeft(Math.max(0, Math.ceil((ms - (performance.now() - start)) / 1000))), 250);
    return () => window.clearInterval(id);
  }, [round, ms, resting]);
  const c = 2 * Math.PI * 28;
  const ring = { strokeDasharray: c, '--ring-ms': `${ms}ms`, '--ring-c': c } as CSSProperties;
  return (
    <div className={`dhd-timer ${left <= 5 ? 'dhd-timer--hurry' : ''} ${resting ? 'dhd-timer--rest' : ''}`} role="timer" aria-label={`${left} seconds left`}>
      <svg viewBox="0 0 64 64" aria-hidden>
        <circle className="dhd-timer__track" cx="32" cy="32" r="28" />
        {!resting && <circle key={round} className="dhd-timer__bar" cx="32" cy="32" r="28" style={ring} />}
      </svg>
      <span>{left}</span>
    </div>
  );
}

function RevealHands({ frame, mine, theirs, outcome, handle }: { frame: RevealFrame; mine: HandPick; theirs: HandPick; outcome: Outcome; handle: string }) {
  const counting = frame.phase === 'count';
  const resolved = frame.phase === 'resolve' || frame.phase === 'settle' || frame.phase === 'done';
  const word = counting ? COUNT_WORDS[frame.beat ?? 0] : frame.phase === 'shoot' || frame.phase === 'clash' ? 'SHOOT!' : null;
  const fist = (side: 'left' | 'right') =>
    [
      `dhd-fist dhd-fist--${side}`,
      resolved && outcome === side ? 'is-push' : '',
      resolved && outcome !== 'draw' && outcome !== side ? 'is-broken' : '',
      resolved && outcome === 'draw' ? 'is-bump' : '',
    ].join(' ');
  return (
    <>
      <div className={fist('left')}>
        <div className="dhd-fist__hand">
          <HandIcon pick={counting ? 0 : mine} cracked={resolved && outcome === 'right'} className="dhd-fist__icon" />
        </div>
      </div>
      <div className={fist('right')}>
        <div className="dhd-fist__hand">
          <HandIcon pick={counting ? 0 : theirs} cracked={resolved && outcome === 'left'} className="dhd-fist__icon" />
        </div>
      </div>
      {frame.phase === 'clash' && <div className="dhd-flash" aria-hidden />}
      {word && (
        <div key={`${word}${frame.beat}`} className={`dhd-word ${word === 'SHOOT!' ? 'dhd-word--shoot' : ''}`} aria-hidden>
          {word}
        </div>
      )}
      {resolved && outcome === 'draw' && <div className="dhd-stamp">DRAW</div>}
      {resolved && outcome !== 'draw' && <div className={`dhd-caption dhd-caption--${outcome}`}>{outcome === 'left' ? 'you take the round' : `${handle} takes the round`}</div>}
      <span className="dhd-sr" aria-live="polite">
        {resolved ? `you threw ${HAND_NAMES[mine]}, ${handle} threw ${HAND_NAMES[theirs]}` : ''}
      </span>
    </>
  );
}

/** Every non-idle duel phase: invite panels, the arena with its reveal, and the result screen. */
export function DuelArena() {
  const duel = useAppStore((s) => s.duel);
  const actions = useAppStore((s) => s.actions);
  const sessionId = useAppStore((s) => s.sessionId) ?? '';
  const coins = useAppStore((s) => s.coins);
  const narrow = useMatchMedia('(max-width: 480px)');
  const reduced = useMatchMedia('(prefers-reduced-motion: reduce)');
  const scale = narrow ? 2 : 3;

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<FxLayer | null>(null);
  const lastCoinTick = useRef(0);

  const me = duel.you === 'a' ? 0 : 1;
  const them = 1 - me;
  const playing = duel.phase === 'pick' || duel.phase === 'reveal' || duel.phase === 'over';
  const live = duel.phase === 'pick' || duel.phase === 'reveal';
  const outcome: Outcome | null = duel.last ? (duel.last.winner === 'draw' ? 'draw' : duel.last.winner === duel.you ? 'left' : 'right') : null;

  // the particle layer lives while the arena is on screen
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!playing || !canvas) return;
    const layer = new FxLayer(canvas, stageRef.current, reduced);
    layer.resize();
    const onResize = () => layer.resize();
    window.addEventListener('resize', onResize);
    fxRef.current = layer;
    return () => {
      window.removeEventListener('resize', onResize);
      layer.destroy();
      fxRef.current = null;
    };
  }, [playing, reduced]);

  /** a point on the stage in canvas coordinates: dx is a fraction of the stage width from its centre */
  const stagePoint = (dx: number, dy: number) => {
    const root = rootRef.current?.getBoundingClientRect();
    const stage = stageRef.current?.getBoundingClientRect();
    if (!root || !stage) return { x: 0, y: 0 };
    return { x: stage.left - root.left + stage.width * (0.5 + dx), y: stage.top - root.top + stage.height * dy };
  };

  const runKey = duel.phase === 'reveal' && duel.last ? `${duel.round}:${duel.last.picks.join('')}:${duel.last.winner}` : null;
  const frame = useDuelTimeline(runKey, {
    onCue: (cue) => {
      const fx = fxRef.current;
      if (cue === 'tick0') sfx.duelTick(0);
      else if (cue === 'tick1') sfx.duelTick(1);
      else if (cue === 'tick2') sfx.duelTick(2);
      else if (cue === 'shoot') sfx.whoosh();
      else if (cue === 'clash') {
        sfx.clash();
        const p = stagePoint(0, 0.5);
        fx?.sparks(p.x, p.y);
        fx?.shake(outcome === 'draw' ? 5 : 10);
      } else if (cue === 'result') {
        if (outcome === 'left') sfx.roundWin();
        else if (outcome === 'right') sfx.roundLose();
        else sfx.roundDraw();
        if (outcome === 'left' || outcome === 'right') {
          // debris where the losing hand breaks
          const p = stagePoint(outcome === 'left' ? 0.2 : -0.2, 0.5);
          fx?.sparks(p.x, p.y, 12);
        }
      }
    },
    onDone: () => actions?.duelRevealDone(),
  });
  const inResolve = duel.phase === 'reveal' && (frame.phase === 'resolve' || frame.phase === 'settle');

  // result screen: fanfare, confetti and a coin shower for the winner
  const payout = duel.phase === 'over' ? resultCoins(duel.stake, duel.won) : 0;
  const net = resultNet(duel.stake, duel.won);
  const counted = useCountUp(duel.phase === 'over' ? `over:${duel.peer}` : null, payout, () => {
    const t = performance.now();
    if (t - lastCoinTick.current > 70) {
      lastCoinTick.current = t;
      sfx.coinCount();
    }
  });
  useEffect(() => {
    if (duel.phase !== 'over') return;
    const fx = fxRef.current;
    if (duel.won === true) {
      sfx.fanfare();
      fx?.confetti();
      const p = stagePoint(-0.25, 0.45);
      fx?.coins(p.x, p.y);
    } else if (duel.won === false) sfx.defeat();
    else sfx.roundDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.phase]);

  const throwHand = (i: HandPick) => {
    if (duel.phase !== 'pick' || duel.myPick !== null) return;
    sfx.tap();
    actions?.duelPick(i);
  };

  // keys 1/2/3 or R/P/S throw a hand
  useEffect(() => {
    if (duel.phase !== 'pick' || duel.myPick !== null) return;
    const keys: Record<string, HandPick> = { '1': 0, '2': 1, '3': 2, r: 0, p: 1, s: 2 };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const i = keys[e.key.toLowerCase()];
      if (i === undefined) return;
      e.preventDefault();
      throwHand(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.phase, duel.myPick, actions]);

  const poseOf = (side: 'left' | 'right') => {
    if (duel.phase === 'over') return duel.won === null ? '' : (side === 'left') === duel.won ? 'is-victory' : 'is-slump';
    if (inResolve && (outcome === 'left' || outcome === 'right')) return outcome === side ? 'is-lunge' : 'is-hit';
    if (duel.phase === 'pick' && side === 'left' && duel.myPick !== null) return 'is-ready';
    return '';
  };

  const exit = () => (duel.phase === 'incoming' ? actions?.duelDecline() : actions?.duelEnd());
  const title = duel.phase === 'ringing' ? 'challenging…' : duel.phase === 'incoming' ? 'duel challenge' : duel.phase === 'over' ? 'duel over' : 'rock paper scissors';
  const exitLabel = live ? 'forfeit & exit' : duel.phase === 'incoming' ? 'pass' : duel.phase === 'ringing' ? 'cancel' : 'exit game';
  const canAccept = canCover(coins, duel.stake);
  const stakeLine = duel.stake > 0 ? `stake ${duel.stake} · pot ${duel.stake * 2}` : `free duel · winner earns ${DUEL_REWARD}`;

  return (
    <VipModal title={title} label="duel" live={live} onExit={exit} exitLabel={exitLabel} wide cardClassName="dhd-card" headerExtra={<MuteToggle />}>
      <div ref={rootRef} className="dhd" data-phase={duel.phase}>
        {playing && (
          <div className="dhd-hud">
            <Pips score={duel.score[me]} label="you" />
            <div className="dhd-hud__mid">
              <span className="dhd-hud__round">ROUND {duel.round}</span>
              <span className="dhd-hud__pot">
                <CoinGlyph className="dhd-coin" />
                {duel.stake > 0 ? `POT ${duel.stake * 2}` : `WINNER +${DUEL_REWARD}`}
              </span>
            </div>
            <Pips score={duel.score[them]} label={duel.handle} />
          </div>
        )}

        <div className="dhd-stagewrap">
          <div ref={stageRef} className="dhd-stage" data-reveal={duel.phase === 'reveal' ? frame.phase : 'idle'} data-outcome={outcome ?? 'none'}>
            <div className="dhd-stage__glow" aria-hidden />
            <Fighter side="left" sessionId={sessionId} name="you" scale={scale} pose={poseOf('left')} pop={inResolve && outcome === 'right'} />
            <div className="dhd-clash">
              {!playing && (
                <div className="dhd-vs" aria-hidden>
                  VS
                </div>
              )}
              {duel.phase === 'pick' && duel.myPick !== null && (
                <div className="dhd-locked">
                  <HandIcon pick={duel.myPick} className="dhd-locked__icon" />
                  <span>locked in</span>
                </div>
              )}
              {duel.phase === 'reveal' && duel.last && outcome && (
                <RevealHands frame={frame} mine={duel.last.picks[me] as HandPick} theirs={duel.last.picks[them] as HandPick} outcome={outcome} handle={duel.handle} />
              )}
            </div>
            <Fighter
              side="right"
              sessionId={duel.peer}
              name={duel.handle}
              scale={scale}
              pose={poseOf('right')}
              thinking={duel.phase === 'pick' && duel.myPick !== null}
              pop={inResolve && outcome === 'left'}
            />
          </div>
        </div>

        {(duel.phase === 'ringing' || duel.phase === 'incoming') && (
          <div className="dhd-invite">
            <div className={`dhd-stakebadge ${duel.stake > 0 ? '' : 'dhd-stakebadge--free'}`}>
              <CoinGlyph className="dhd-coin dhd-coin--big" />
              <span>{stakeLine}</span>
            </div>
            {duel.phase === 'ringing' ? (
              <p className="dhd-invite__sub">
                waiting for {duel.handle} to accept
                <span className="dhd-dots dhd-dots--inline" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              </p>
            ) : (
              <>
                <p className="dhd-invite__sub">{duel.handle} challenges you! best of three.</p>
                <button className="vip__btn vip__btn--pink dhd-invite__accept" disabled={!canAccept} onClick={() => actions?.duelAccept()}>
                  accept
                </button>
                {!canAccept && <p className="dhd-invite__warn">not enough coins</p>}
              </>
            )}
          </div>
        )}

        {live && (
          <div className="dhd-pick">
            <div className="dhd-pick__row">
              <PickTimer round={duel.round} ms={pickRingMs(duel.round)} resting={duel.phase !== 'pick'} />
              <p className="dhd-pick__prompt">
                {duel.phase === 'reveal' ? 'rock… paper… scissors…' : duel.myPick === null ? 'throw your hand' : `${HAND_NAMES[duel.myPick]} locked in, waiting for ${duel.handle}`}
              </p>
            </div>
            <div className={`dhd-hands ${duel.phase === 'reveal' ? 'dhd-hands--rest' : ''}`} role="group" aria-label="throw your hand">
              {HAND_NAMES.map((name, i) => {
                const locked = duel.phase === 'pick' && duel.myPick === i;
                const dim = duel.phase === 'pick' && duel.myPick !== null && !locked;
                return (
                  <button
                    key={name}
                    className={`dhd-hand ${locked ? 'dhd-hand--locked' : ''} ${dim ? 'dhd-hand--dim' : ''}`}
                    disabled={duel.phase !== 'pick' || duel.myPick !== null}
                    aria-pressed={locked}
                    aria-label={name}
                    onClick={() => throwHand(i as HandPick)}
                  >
                    <HandIcon pick={i as HandPick} className="dhd-hand__icon" />
                    <span className="dhd-hand__label">{name}</span>
                  </button>
                );
              })}
            </div>
            <p className="dhd-keys" aria-hidden>
              keys 1 2 3 or R P S
            </p>
          </div>
        )}

        {duel.phase === 'over' && (
          <div className={`dhd-result dhd-result--${duel.won === true ? 'win' : duel.won === false ? 'lose' : 'draw'}`} role="status">
            <div className="dhd-result__title">{duel.won === true ? 'VICTORY' : duel.won === false ? 'DEFEAT' : 'DRAW'}</div>
            <p className="dhd-result__sub">
              {duel.endedBy === 'forfeit'
                ? `${duel.handle} walked out: the pot is yours`
                : duel.won === true
                  ? `you beat ${duel.handle} ${duel.score[me]}-${duel.score[them]}`
                  : duel.won === false
                    ? `${duel.handle} wins ${duel.score[them]}-${duel.score[me]}`
                    : duel.stake > 0
                      ? 'no winner after 6 rounds: stakes returned'
                      : 'no winner after 6 rounds'}
            </p>
            {payout > 0 && (
              <div className="dhd-result__coins">
                <CoinGlyph className="dhd-coin dhd-coin--big" />
                <span>+{counted}</span>
              </div>
            )}
            <div className={`dhd-result__net ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>{net > 0 ? `net +${net} coins` : net < 0 ? `net ${net} coins` : 'net 0 coins'}</div>
            <button className="vip__btn vip__btn--pink dhd-result__back" onClick={() => actions?.duelEnd()}>
              back to room
            </button>
          </div>
        )}

        <canvas ref={canvasRef} className="dhd-fx" aria-hidden />
      </div>
    </VipModal>
  );
}
