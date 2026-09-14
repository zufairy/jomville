# Duel HD Implementation Plan (part 6 of 7: Tasks 14-15, arena, smoke script)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Header, Global Constraints and File Map: `docs/superpowers/plans/2026-09-14-duel-hd.md`. Spec: `docs/superpowers/specs/2026-09-14-duel-hd-design.md`. Tasks 1-13 must be done first. Client tests run in vitest's **node** environment (no DOM); every unit-tested client module is pure TypeScript.

---

## Task 14: The arena

**Files:**
- Modify: `client/src/ui/VipModal.tsx` (optional `cardClassName`)
- Create: `client/src/ui/duel/DuelArena.tsx`
- Rewrite: `client/src/ui/DuelUI.tsx`

**Interfaces:**
- Consumes:
  - store: `useAppStore` (`duel`, `actions`, `sessionId`, `coins`, `avatar`), `useRoster`
  - `AvatarPreview` (`cfg`, `scale`, `animate`, `dir`, `focus`)
  - `VipModal` (+ `cardClassName`, `headerExtra`, `wide`)
  - Task 7: `canCover`, `resultCoins`, `resultNet`
  - Task 8: `COUNT_WORDS`, `RevealFrame`, `pickRingMs`, `useDuelTimeline`, `useCountUp`
  - Task 9: `FxLayer`
  - Task 10: `sfx.*`, `sfxMuted`, `setSfxMuted`
  - Task 11: `HandIcon`, `HAND_NAMES`, `HandPick`
  - Task 13: `CoinGlyph`
  - actions: `duelAccept`, `duelDecline`, `duelPick`, `duelEnd`, `duelRevealDone`
- Produces:
  - `VipModalProps.cardClassName?: string`
  - `DuelArena(): JSX.Element`
  - `DuelUI(): JSX.Element | null`

- [ ] **Step 1: `VipModal` card class**

In `client/src/ui/VipModal.tsx`, replace:
```ts
  wide?: boolean;
  children: ReactNode;
}
```
with:
```ts
  wide?: boolean;
  /** extra class on the card, e.g. a game that needs a bigger stage */
  cardClassName?: string;
  children: ReactNode;
}
```
Replace:
```ts
export function VipModal({ title, label, live = false, onExit, exitLabel = 'exit game', headerExtra, wide, children }: VipModalProps) {
```
with:
```ts
export function VipModal({ title, label, live = false, onExit, exitLabel = 'exit game', headerExtra, wide, cardClassName, children }: VipModalProps) {
```
Replace:
```tsx
      <div ref={card} tabIndex={-1} className={`vip__card ${wide ? 'vip__card--wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
```
with:
```tsx
      <div ref={card} tabIndex={-1} className={`vip__card ${wide ? 'vip__card--wide' : ''} ${cardClassName ?? ''}`} role="dialog" aria-modal="true" aria-label={label}>
```

- [ ] **Step 2: Create `client/src/ui/duel/DuelArena.tsx`**

```tsx
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
```

- [ ] **Step 3: Rewrite `client/src/ui/DuelUI.tsx` as a thin wrapper**

Full new contents (this also removes the temporary 1600 ms advance from Task 6):
```tsx
import { useAppStore } from '../store';
import { DuelArena } from './duel/DuelArena';

/** Rock-paper-scissors duel popup. The arena draws every phase; nothing shows while idle. */
export function DuelUI() {
  const phase = useAppStore((s) => s.duel.phase);
  return phase === 'idle' ? null : <DuelArena />;
}
```

- [ ] **Step 4: Types, tests, build**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test`
Expected: no type errors; all client tests pass.

Run: `grep -rn "setTimeout" client/src/ui/DuelUI.tsx client/src/game/Game.ts | grep -i duel`
Expected: no output (no fixed reveal timer remains).

Run: `pnpm build`
Expected: `vite build` finishes with `✓ built in …` and no errors. The emitted CSS includes `dhd-stage`; check with `grep -l "dhd-stage" client/dist/assets/*.css`, which should print one file.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/VipModal.tsx client/src/ui/duel/DuelArena.tsx client/src/ui/DuelUI.tsx
git commit -F - <<'MSG'
feat(client): HD duel arena with LPC fighters, choreographed reveal and result screen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

## Task 15: `smoke-duel.mjs` against a live server on port 2597

**Files:**
- Create: `client/scripts/smoke-duel.mjs`

**Interfaces:**
- Consumes:
  - HTTP: `POST /api/me {token}` (creates the user), `POST /api/inventory {token}` → `{coins, …}`, `POST /api/shop/buy {token, def, qty}`.
  - WebSocket room `room` with `{slug, token}`.
  - Messages from Task 5: `duel_invite`, `duel_accept`, `duel_pick`, `duel_end` → `duel_incoming`, `duel_start`, `duel_round`, `duel_end`, `sys`, `coins`.
  - `COINS_PER_MINUTE` = 5: trickle `coins` messages carry `earned: 5` and are subtracted from the net.
  - Furniture prices: `hottub` 900, `chair` 40.
- Produces: exit code 0 and a final `PASS` line when every check holds; exit code 1 and `FAIL` otherwise.

- [ ] **Step 1: Create `client/scripts/smoke-duel.mjs`**

```js
/**
 * End-to-end check of staked rock-paper-scissors duels against a running server:
 *  1. A challenges B for 50, both stakes are escrowed, A wins 2-0: A nets +50, B nets -50
 *  2. a staked forfeit hands the pot to whoever stayed
 *  3. a stake B cannot cover is cancelled (insufficient) and nobody is charged
 *  4. a broke inviter is refused, a bad stake is refused
 *  5. a lobby local refuses a staked duel
 *
 *   rm -rf "$TMPDIR/dovey-duel-pg"
 *   PORT=2597 PGLITE_DIR="$TMPDIR/dovey-duel-pg" pnpm start        (another shell)
 *   DOVEY_API=http://localhost:2597 node client/scripts/smoke-duel.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2597';
const WS = API.replace(/^http/, 'ws');
const SLUG = process.argv[2] ?? 'gameden';
const TRICKLE = 5; // COINS_PER_MINUTE: the once-a-minute coins message
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const checks = [];
const check = (label, ok) => {
  checks.push(!!ok);
  console.log(ok ? '  ok  ' : '  FAIL', label);
};
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(60);
  }
  return false;
}
async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const coinsOf = async (token) => (await post('/api/inventory', { token })).json.coins;

// fresh accounts every run, so reruns against the same database start at the default balance
const run = Date.now().toString(36);
const tokenA = `duelSmokeA${run}`.padEnd(32, 'a');
const tokenB = `duelSmokeB${run}`.padEnd(32, 'b');
const ua = (await post('/api/me', { token: tokenA })).json;
const ub = (await post('/api/me', { token: tokenB })).json;
console.log('users:', ua?.handle, ub?.handle);

const client = new Client(WS);
const A = await client.joinOrCreate('room', { slug: SLUG, token: tokenA });
const B = await client.joinOrCreate('room', { slug: SLUG, token: tokenB });
await wait(700);

const newLog = () => ({ incoming: [], start: [], rounds: [], ends: [], sys: [], trickle: 0 });
const log = { A: newLog(), B: newLog() };
const QUIET = ['chat', 'emote', 'love', 'duel_over', 'duel_ringing', 'duel_wait', 'call_state', 'tg_state', 'tg_status', 'tg_end', 'roll', 'gear_use', 'maze_win', 'inventory_refresh', 'inventory_delta'];
for (const [name, room] of [
  ['A', A],
  ['B', B],
]) {
  const L = log[name];
  room.onMessage('duel_incoming', (m) => L.incoming.push(m));
  room.onMessage('duel_start', (m) => L.start.push(m));
  room.onMessage('duel_round', (m) => L.rounds.push(m));
  room.onMessage('duel_end', (m) => L.ends.push(m));
  room.onMessage('sys', (m) => L.sys.push(m.code));
  room.onMessage('coins', (m) => {
    if (m.earned === TRICKLE) L.trickle += TRICKLE;
  });
  for (const t of QUIET) room.onMessage(t, () => {});
}

/** wallet snapshot that ignores the minute trickle */
const snap = async (name, token) => ({ coins: await coinsOf(token), trickle: log[name].trickle });
const netSince = async (name, token, s) => (await coinsOf(token)) - s.coins - (log[name].trickle - s.trickle);

// ---- 1. staked duel to a win
let sA = await snap('A', tokenA);
let sB = await snap('B', tokenB);
A.send('duel_invite', { to: B.sessionId, stake: 50 });
check('B is challenged for 50', await until(() => log.B.incoming.some((m) => m.from === A.sessionId && m.stake === 50)));
B.send('duel_accept');
check('both duels start', await until(() => log.A.start.length === 1 && log.B.start.length === 1));
check('duel_start carries the stake', log.A.start[0]?.stake === 50 && log.B.start[0]?.stake === 50);
check('both stakes left the wallets', (await netSince('A', tokenA, sA)) === -50 && (await netSince('B', tokenB, sB)) === -50);
for (let round = 0; round < 6 && !log.A.rounds.some((r) => r.done); round++) {
  const before = log.A.rounds.length;
  A.send('duel_pick', { pick: 0 }); // rock
  B.send('duel_pick', { pick: 2 }); // scissors
  await until(() => log.A.rounds.length > before && log.B.rounds.length > before);
}
const final = log.A.rounds.at(-1);
check('A wins 2-0', final?.done === true && final.winner === 'a' && final.score[0] === 2 && final.score[1] === 0);
check('duel_round carries stake and pot', final?.stake === 50 && final?.pot === 100);
await wait(600); // payout is written after the round message
const netA1 = await netSince('A', tokenA, sA);
const netB1 = await netSince('B', tokenB, sB);
check(`winner nets +50 (got ${netA1})`, netA1 === 50);
check(`loser nets -50 (got ${netB1})`, netB1 === -50);

// ---- 2. staked forfeit: B walks out, A takes the pot
sA = await snap('A', tokenA);
sB = await snap('B', tokenB);
A.send('duel_invite', { to: B.sessionId, stake: 25 });
check('B is challenged for 25', await until(() => log.B.incoming.some((m) => m.stake === 25)));
B.send('duel_accept');
check('forfeit duel starts', await until(() => log.A.start.length === 2 && log.B.start.length === 2));
B.send('duel_end');
check('A hears the forfeit with the pot', await until(() => log.A.ends.some((e) => e.reason === 'forfeit' && e.pot === 50)));
await wait(600);
const netA2 = await netSince('A', tokenA, sA);
const netB2 = await netSince('B', tokenB, sB);
check(`stayer nets +25 (got ${netA2})`, netA2 === 25);
check(`quitter nets -25 (got ${netB2})`, netB2 === -25);

// ---- 3. a stake B cannot cover: cancelled, nobody charged
await post('/api/shop/buy', { token: tokenB, def: 'hottub', qty: 1 });
for (let i = 0; i < 10 && (await coinsOf(tokenB)) >= 500; i++) await post('/api/shop/buy', { token: tokenB, def: 'chair', qty: 5 });
sA = await snap('A', tokenA);
sB = await snap('B', tokenB);
check(`B is below 500 (${sB.coins})`, sB.coins < 500);
const endsA = log.A.ends.length;
const endsB = log.B.ends.length;
A.send('duel_invite', { to: B.sessionId, stake: 500 });
check('B is challenged for 500', await until(() => log.B.incoming.some((m) => m.stake === 500)));
B.send('duel_accept'); // a client that ignores the disabled accept button
check(
  'both hear the duel was cancelled for coins',
  await until(() => log.A.ends.slice(endsA).some((e) => e.reason === 'insufficient') && log.B.ends.slice(endsB).some((e) => e.reason === 'insufficient')),
);
check('no duel started', log.A.start.length === 2 && log.B.start.length === 2);
await wait(300);
check('nobody was charged', (await netSince('A', tokenA, sA)) === 0 && (await netSince('B', tokenB, sB)) === 0);

// ---- 4. a broke inviter and a bad stake are refused
const sysB = log.B.sys.length;
B.send('duel_invite', { to: A.sessionId, stake: 500 });
check('a broke inviter gets not_enough_coins', await until(() => log.B.sys.slice(sysB).includes('not_enough_coins')));
const sysA = log.A.sys.length;
A.send('duel_invite', { to: B.sessionId, stake: 30 });
check('an unlisted stake gets bad_request', await until(() => log.A.sys.slice(sysA).includes('bad_request')));
check('neither refusal reached B as an invite', !log.B.incoming.some((m) => m.stake === 30));

await A.leave();
await B.leave();

// ---- 5. a lobby local refuses a staked duel
const L = await client.joinOrCreate('room', { slug: 'mainlobby', token: tokenA });
const lobbySys = [];
L.onMessage('sys', (m) => lobbySys.push(m.code));
L.onMessage('duel_incoming', () => {});
L.onMessage('duel_start', () => {});
L.onMessage('duel_end', () => {});
L.onMessage('duel_round', () => {});
L.onMessage('coins', () => {});
for (const t of QUIET) L.onMessage(t, () => {});
await wait(1200);
let botId = null;
L.state.players.forEach((p, id) => {
  if (!botId && String(p.userId).startsWith('bot:')) botId = id;
});
check('the lobby has a local', !!botId);
if (botId) {
  L.send('duel_invite', { to: botId, stake: 25 });
  check('a local refuses a staked duel', await until(() => lobbySys.includes('bot_no_stake')));
}
await L.leave();

const ok = checks.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Start a throwaway server on 2597**

Run:
```bash
rm -rf "$TMPDIR/dovey-duel-pg"
(PORT=2597 PGLITE_DIR="$TMPDIR/dovey-duel-pg" pnpm start > "$TMPDIR/dovey-duel-server.log" 2>&1 &)
for i in $(seq 1 60); do curl -sf http://localhost:2597/api/shop/stock > /dev/null && break; sleep 1; done; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:2597/api/shop/stock
```
Expected: the last line prints `200`. If not, read `"$TMPDIR/dovey-duel-server.log"`. Never use ports 5173 or 2567.

- [ ] **Step 3: Run the smoke**

Run: `DOVEY_API=http://localhost:2597 node client/scripts/smoke-duel.mjs`
Expected: every check line starts with `  ok  ` (23 checks: 8 staked win, 5 forfeit, 5 insufficient, 3 refusals, 2 locals) and the last line is `PASS`. The exit code is 0.

If a check fails, debug it with superpowers:systematic-debugging against Task 5's handlers, fix the cause, and re-run. Do not loosen the assertion.

- [ ] **Step 4: Stop the server**

Run: `lsof -ti tcp:2597 | xargs kill; sleep 1; lsof -ti tcp:2597 || echo stopped`
Expected: `stopped`

- [ ] **Step 5: Commit**

```bash
git add client/scripts/smoke-duel.mjs
git commit -F - <<'MSG'
test(duel): end-to-end smoke for staked duels, forfeit, insufficient funds and locals

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

Continue with `docs/superpowers/plans/2026-09-14-duel-hd-part7.md`.
