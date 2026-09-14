# Duel HD Implementation Plan (part 3 of 7: Tasks 6-8, client protocol, stake rules, reveal timeline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Header, Global Constraints and File Map: `docs/superpowers/plans/2026-09-14-duel-hd.md`. Spec: `docs/superpowers/specs/2026-09-14-duel-hd-design.md`. Tasks 1-5 must be done first. Client tests run in vitest's **node** environment (no DOM); every unit-tested client module is pure TypeScript.

---

## Task 6: Client protocol, store and duel flow

**Files:**
- Modify: `client/src/net.ts`, `client/src/store.ts`, `client/src/game/Game.ts`, `client/src/ui/ProfileSheet.tsx` (one call), `client/src/ui/DuelUI.tsx` (temporary advance)
- Create: `client/src/ui/duel/duelFlow.ts`, `client/src/ui/duel/duelFlow.test.ts`

**Interfaces:**
- Consumes: the Task 5 wire messages: `duel_incoming {from, handle, stake}`, `duel_start {peer, handle, you, stake}`, `duel_round {winner, picks, score, done, stake, pot}`, `duel_end {reason, pot}`.
- Produces:
  - `net.ts`:
    - `export interface DuelRoundMsg { winner: 'a' | 'b' | 'draw'; picks: [number, number]; score: [number, number]; done: boolean; stake: number; pot: number }`
    - `NetEvents.onDuelIncoming(from: string, handle: string, stake: number)`
    - `NetEvents.onDuelStart(peer: string, handle: string, you: 'a' | 'b', stake: number)`
    - `NetEvents.onDuelRound(r: DuelRoundMsg)`
    - `NetEvents.onDuelEnd(reason: string, pot: number)`
  - `store.ts`:
    - `DuelInfo` gains `stake: number; done: boolean; endedBy: 'score' | 'forfeit' | null`, and `won: null` now means draw.
    - `GameActions.duelInvite(peer: string, handle: string, stake: number)`
    - `GameActions.duelRevealDone(): void`
  - `duelFlow.ts`:
    - `applyRound(d: DuelInfo, r: DuelRoundMsg): DuelInfo`
    - `afterReveal(d: DuelInfo): DuelInfo`
    - `applyEnd(d: DuelInfo, reason: string, pot: number): { duel: DuelInfo; toast: string | null }`

- [ ] **Step 1: Write the failing test**

Create `client/src/ui/duel/duelFlow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DuelInfo, IDLE_DUEL } from '../../store';
import { afterReveal, applyEnd, applyRound } from './duelFlow';

const playing = (over: Partial<DuelInfo> = {}): DuelInfo => ({ ...IDLE_DUEL, phase: 'pick', peer: 's2', handle: 'mia', you: 'b', stake: 50, myPick: 1, ...over });

describe('duel flow', () => {
  it('a round result starts the reveal and clears my pick', () => {
    const d = applyRound(playing(), { winner: 'b', picks: [0, 1], score: [0, 1], done: false, stake: 50, pot: 100 });
    expect(d).toMatchObject({ phase: 'reveal', score: [0, 1], last: { picks: [0, 1], winner: 'b' }, myPick: null, done: false, won: null, round: 1, endedBy: null });
  });

  it('after a normal reveal the next round opens', () => {
    const d = afterReveal(applyRound(playing(), { winner: 'draw', picks: [2, 2], score: [0, 0], done: false, stake: 50, pot: 100 }));
    expect(d).toMatchObject({ phase: 'pick', round: 2, last: null });
  });

  it('the deciding round plays its reveal before the result screen', () => {
    const r = applyRound(playing({ you: 'b' }), { winner: 'b', picks: [2, 0], score: [1, 2], done: true, stake: 50, pot: 100 });
    expect(r).toMatchObject({ phase: 'reveal', done: true, won: true, endedBy: 'score' });
    expect(afterReveal(r)).toMatchObject({ phase: 'over', round: 1, won: true });
  });

  it('a tie at the cap is a draw (won null); a loss is false', () => {
    expect(applyRound(playing({ you: 'a' }), { winner: 'draw', picks: [0, 0], score: [1, 1], done: true, stake: 50, pot: 100 }).won).toBeNull();
    expect(applyRound(playing({ you: 'a' }), { winner: 'b', picks: [0, 1], score: [0, 2], done: true, stake: 50, pot: 100 }).won).toBe(false);
  });

  it('afterReveal leaves other phases alone', () => {
    const d = playing();
    expect(afterReveal(d)).toBe(d);
  });

  it('a staked opponent walking out mid-duel shows me the win screen', () => {
    const { duel, toast } = applyEnd(playing(), 'left', 100);
    expect(duel).toMatchObject({ phase: 'over', won: true, done: true, endedBy: 'forfeit', myPick: null });
    expect(toast).toBeNull();
    expect(applyEnd(playing({ phase: 'reveal' }), 'forfeit', 100).duel.phase).toBe('over');
  });

  it('the result screen survives a late end message', () => {
    const over = playing({ phase: 'over', won: true });
    expect(applyEnd(over, 'left', 0)).toEqual({ duel: over, toast: null });
  });

  it('other endings close the duel with a toast', () => {
    expect(applyEnd(playing({ phase: 'incoming' }), 'insufficient', 0)).toEqual({ duel: IDLE_DUEL, toast: 'duel cancelled: not enough coins' });
    expect(applyEnd(playing({ phase: 'ringing' }), 'declined', 0).toast).toBe('they passed on the duel');
    expect(applyEnd(playing(), 'left', 0)).toEqual({ duel: IDLE_DUEL, toast: 'they left the duel' });
    expect(applyEnd(playing(), 'forfeit', 0).toast).toBe('they left the duel');
    expect(applyEnd(playing({ phase: 'ringing' }), 'failed', 0).toast).toBe('duel could not start, try again');
    expect(applyEnd(playing(), 'whatever', 0).toast).toBe('duel ended');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @dovey/client exec vitest run src/ui/duel/duelFlow.test.ts`
Expected: FAIL, `Failed to resolve import "./duelFlow"`.

- [ ] **Step 3: Store types in `client/src/store.ts`**

Replace:
```ts
  won: boolean | null;
}
export const IDLE_DUEL: DuelInfo = { phase: 'idle', peer: '', handle: '', you: 'a', score: [0, 0], round: 1, myPick: null, last: null, won: null };
```
with:
```ts
  /** at the end: true won, false lost, null draw */
  won: boolean | null;
  /** coins each side put in; 0 = free duel */
  stake: number;
  /** the round on show ended the duel: the result screen follows its reveal */
  done: boolean;
  /** how it ended: by score, or the other side walked out */
  endedBy: 'score' | 'forfeit' | null;
}
export const IDLE_DUEL: DuelInfo = {
  phase: 'idle',
  peer: '',
  handle: '',
  you: 'a',
  score: [0, 0],
  round: 1,
  myPick: null,
  last: null,
  won: null,
  stake: 0,
  done: false,
  endedBy: null,
};
```

In `interface GameActions`, replace:
```ts
  duelInvite: (peer: string, handle: string) => void;
```
with:
```ts
  duelInvite: (peer: string, handle: string, stake: number) => void;
  /** the reveal animation finished: next pick, or the result screen */
  duelRevealDone: () => void;
```

- [ ] **Step 4: Create `client/src/ui/duel/duelFlow.ts`**

```ts
import { DuelInfo, IDLE_DUEL } from '../../store';
import type { DuelRoundMsg } from '../../net';

/** A round result arrives: play its reveal. The result screen waits for the reveal to finish. */
export function applyRound(d: DuelInfo, r: DuelRoundMsg): DuelInfo {
  const mine = d.you === 'a' ? 0 : 1;
  const won = r.done ? (r.score[mine] > r.score[1 - mine] ? true : r.score[mine] < r.score[1 - mine] ? false : null) : null;
  return {
    ...d,
    phase: 'reveal',
    score: r.score,
    last: { picks: r.picks, winner: r.winner },
    won,
    done: r.done,
    stake: r.stake,
    myPick: null,
    endedBy: r.done ? 'score' : null,
  };
}

/** The reveal finished: back to picking, or on to the result screen. */
export function afterReveal(d: DuelInfo): DuelInfo {
  if (d.phase !== 'reveal') return d;
  return d.done ? { ...d, phase: 'over' } : { ...d, phase: 'pick', round: d.round + 1, last: null };
}

/** The server ended the duel early. A staked opponent walking out mid-duel hands you the pot. */
export function applyEnd(d: DuelInfo, reason: string, pot: number): { duel: DuelInfo; toast: string | null } {
  if (d.phase === 'over') return { duel: d, toast: null };
  const walkout = reason === 'forfeit' || reason === 'left';
  const midDuel = d.phase === 'pick' || d.phase === 'reveal';
  if (walkout && midDuel && pot > 0) {
    return { duel: { ...d, phase: 'over', won: true, done: true, endedBy: 'forfeit', myPick: null }, toast: null };
  }
  const toast =
    reason === 'declined'
      ? 'they passed on the duel'
      : reason === 'insufficient'
        ? 'duel cancelled: not enough coins'
        : reason === 'failed'
          ? 'duel could not start, try again'
          : walkout
            ? 'they left the duel'
            : 'duel ended';
  return { duel: IDLE_DUEL, toast };
}
```

- [ ] **Step 5: Protocol in `client/src/net.ts`**

After the `export interface RemotePlayer { … }` block add:
```ts
export interface DuelRoundMsg {
  winner: 'a' | 'b' | 'draw';
  picks: [number, number];
  score: [number, number];
  done: boolean;
  /** coins each side put in */
  stake: number;
  /** what the winner takes: 2 × stake */
  pot: number;
}
```

In `interface NetEvents`, replace:
```ts
  onDuelIncoming: (from: string, handle: string) => void;
  onDuelStart: (peer: string, handle: string, you: 'a' | 'b') => void;
  onDuelRound: (r: { winner: 'a' | 'b' | 'draw'; picks: [number, number]; score: [number, number]; done: boolean }) => void;
  onDuelEnd: (reason: string) => void;
```
with:
```ts
  onDuelIncoming: (from: string, handle: string, stake: number) => void;
  onDuelStart: (peer: string, handle: string, you: 'a' | 'b', stake: number) => void;
  onDuelRound: (r: DuelRoundMsg) => void;
  /** `pot` = coins credited to you because of this ending (0 when none) */
  onDuelEnd: (reason: string, pot: number) => void;
```

Replace the four message registrations:
```ts
    room.onMessage('duel_incoming', (m: { from: string; handle: string }) => events.onDuelIncoming(m.from, m.handle));
```
```ts
    room.onMessage('duel_start', (m: { peer: string; handle: string; you: 'a' | 'b' }) => events.onDuelStart(m.peer, m.handle, m.you));
    room.onMessage('duel_round', (m: { winner: 'a' | 'b' | 'draw'; picks: [number, number]; score: [number, number]; done: boolean }) => events.onDuelRound(m));
    room.onMessage('duel_end', (m: { reason: string }) => events.onDuelEnd(m.reason));
```
with (keep the `duel_ringing` / `duel_wait` lines between them as they are):
```ts
    room.onMessage('duel_incoming', (m: { from: string; handle: string; stake?: number }) => events.onDuelIncoming(m.from, m.handle, m.stake ?? 0));
```
```ts
    room.onMessage('duel_start', (m: { peer: string; handle: string; you: 'a' | 'b'; stake?: number }) => events.onDuelStart(m.peer, m.handle, m.you, m.stake ?? 0));
    room.onMessage('duel_round', (m: DuelRoundMsg) => events.onDuelRound({ ...m, stake: m.stake ?? 0, pot: m.pot ?? 0 }));
    room.onMessage('duel_end', (m: { reason: string; pot?: number }) => events.onDuelEnd(m.reason, m.pot ?? 0));
```

In the `sys` code map, directly after the line `        sold_out: 'sold out. only trades now',` add:
```ts
        bot_no_stake: 'locals only duel for fun, no stakes',
        not_enough_coins: 'not enough coins',
```

- [ ] **Step 6: Wire `client/src/game/Game.ts`**

After `import { IDLE_DUEL } from '../store';` add:
```ts
import { afterReveal, applyEnd, applyRound } from '../ui/duel/duelFlow';
```

Replace the duel actions:
```ts
      duelInvite: (peer, handle) => {
        this.net.send('duel_invite', { to: peer });
        useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'ringing', peer, handle });
      },
```
with:
```ts
      duelInvite: (peer, handle, stake) => {
        this.net.send('duel_invite', { to: peer, stake });
        useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'ringing', peer, handle, stake });
      },
      duelRevealDone: () => useAppStore.getState().setDuel(afterReveal),
```

Replace the four duel handlers:
```ts
        onDuelIncoming: (from, handle) => useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'incoming', peer: from, handle }),
        onDuelStart: (peer, handle, you) => useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'pick', peer, handle, you }),
        onDuelRound: (r) => {
          const st = useAppStore.getState();
          const you = st.duel.you;
          const won = r.done ? (you === 'a' ? r.score[0] > r.score[1] : r.score[1] > r.score[0]) : null;
          st.setDuel((d) => ({ ...d, phase: r.done ? 'over' : 'reveal', score: r.score, last: { picks: r.picks, winner: r.winner }, won, myPick: null }));
          if (!r.done) setTimeout(() => st.setDuel((d) => (d.phase === 'reveal' ? { ...d, phase: 'pick', round: d.round + 1, last: null } : d)), 1600);
          const me = this.net.sessionId;
          if (me) this.emotes.pop(me, r.winner === 'draw' ? 3 : (r.winner === you) ? 0 : 2);
        },
        onDuelEnd: (reason) => {
          useAppStore.getState().setDuel(IDLE_DUEL);
          useAppStore.getState().flash(reason === 'declined' ? 'they passed on the duel' : 'duel ended');
        },
```
with:
```ts
        onDuelIncoming: (from, handle, stake) => useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'incoming', peer: from, handle, stake }),
        onDuelStart: (peer, handle, you, stake) => useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'pick', peer, handle, you, stake }),
        onDuelRound: (r) => {
          const st = useAppStore.getState();
          const you = st.duel.you;
          // the arena's reveal timeline calls duelRevealDone when it finishes; no fixed timer here
          st.setDuel((d) => applyRound(d, r));
          const me = this.net.sessionId;
          if (me) this.emotes.pop(me, r.winner === 'draw' ? 3 : r.winner === you ? 0 : 2);
        },
        onDuelEnd: (reason, pot) => {
          const st = useAppStore.getState();
          const { duel, toast } = applyEnd(st.duel, reason, pot);
          st.setDuel(duel);
          if (toast) st.flash(toast);
        },
```

- [ ] **Step 7: Keep the old popup compiling and advancing until Task 14**

In `client/src/ui/ProfileSheet.tsx` replace:
```ts
                actions?.duelInvite(sessionId, handle);
```
with:
```ts
                actions?.duelInvite(sessionId, handle, 0);
```

In `client/src/ui/DuelUI.tsx` replace the first line `import { useAppStore } from '../store';` with:
```ts
import { useEffect } from 'react';
import { useAppStore } from '../store';
```
and directly after `  const sessionId = useAppStore((s) => s.sessionId);` add:
```ts
  // temporary until the arena lands (Task 14): advance after a fixed pause
  useEffect(() => {
    if (duel.phase !== 'reveal') return;
    const t = setTimeout(() => actions?.duelRevealDone(), 1600);
    return () => clearTimeout(t);
  }, [duel.phase, duel.round, actions]);
```

- [ ] **Step 8: Run tests and types**

Run: `pnpm --filter @dovey/client exec vitest run src/ui/duel/duelFlow.test.ts`
Expected: `Tests  8 passed (8)`

Run: `pnpm --filter @dovey/client test && pnpm --filter @dovey/client typecheck`
Expected: all client tests pass; no type errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/net.ts client/src/store.ts client/src/game/Game.ts client/src/ui/ProfileSheet.tsx client/src/ui/DuelUI.tsx client/src/ui/duel/duelFlow.ts client/src/ui/duel/duelFlow.test.ts
git commit -F - <<'MSG'
feat(client): duel stake/pot protocol and pure reveal-gated duel flow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

## Task 7: Stake rules for the picker and result screen

**Files:**
- Create: `client/src/ui/duel/stakes.ts`, `client/src/ui/duel/stakes.test.ts`

**Interfaces:**
- Consumes: `DUEL_STAKES`, `DuelStake`, `DUEL_REWARD` from `@dovey/shared`.
- Produces:
  - `type StakeBlock = 'coins' | 'bot' | null`
  - `interface StakeChoice { stake: DuelStake; enabled: boolean; blocked: StakeBlock }`
  - `stakeChoices(balance: number | null, opts?: { bot?: boolean }): StakeChoice[]`
  - `canCover(balance: number | null, stake: number): boolean`
  - `isBotUser(userId: string | null | undefined): boolean`
  - `resultCoins(stake: number, won: boolean | null): number`
  - `resultNet(stake: number, won: boolean | null): number`

- [ ] **Step 1: Write the failing test**

Create `client/src/ui/duel/stakes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { canCover, isBotUser, resultCoins, resultNet, stakeChoices } from './stakes';

const enabled = (xs: ReturnType<typeof stakeChoices>) => xs.filter((c) => c.enabled).map((c) => c.stake);

describe('stake picker rules', () => {
  it('lists all six stakes and disables the ones above your balance', () => {
    const xs = stakeChoices(120);
    expect(xs.map((c) => c.stake)).toEqual([0, 25, 50, 100, 250, 500]);
    expect(enabled(xs)).toEqual([0, 25, 50, 100]);
    expect(xs.find((c) => c.stake === 250)).toEqual({ stake: 250, enabled: false, blocked: 'coins' });
  });

  it('a stake equal to the balance is allowed', () => {
    expect(enabled(stakeChoices(500))).toEqual([0, 25, 50, 100, 250, 500]);
  });

  it('an unknown balance only allows a free duel', () => {
    expect(enabled(stakeChoices(null))).toEqual([0]);
  });

  it('locals only duel for free', () => {
    const xs = stakeChoices(10_000, { bot: true });
    expect(enabled(xs)).toEqual([0]);
    expect(xs[1]).toEqual({ stake: 25, enabled: false, blocked: 'bot' });
  });

  it('cover check for the invitee accept button', () => {
    expect(canCover(null, 0)).toBe(true);
    expect(canCover(49, 50)).toBe(false);
    expect(canCover(50, 50)).toBe(true);
    expect(canCover(null, 25)).toBe(false);
  });

  it('spots locals by their account id', () => {
    expect(isBotUser('bot:aiman')).toBe(true);
    expect(isBotUser('a1b2c3')).toBe(false);
    expect(isBotUser(undefined)).toBe(false);
  });

  it('result coins: prize for a win, refund for a draw, nothing for a loss', () => {
    expect(resultCoins(50, true)).toBe(100);
    expect(resultCoins(0, true)).toBe(25);
    expect(resultCoins(250, null)).toBe(250);
    expect(resultCoins(0, null)).toBe(0);
    expect(resultCoins(100, false)).toBe(0);
    expect(resultNet(50, true)).toBe(50);
    expect(resultNet(0, true)).toBe(25);
    expect(resultNet(250, null)).toBe(0);
    expect(resultNet(100, false)).toBe(-100);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @dovey/client exec vitest run src/ui/duel/stakes.test.ts`
Expected: FAIL, `Failed to resolve import "./stakes"`.

- [ ] **Step 3: Implement `client/src/ui/duel/stakes.ts`**

```ts
import { DUEL_REWARD, DUEL_STAKES, DuelStake } from '@dovey/shared';

export type StakeBlock = 'coins' | 'bot' | null;
export interface StakeChoice {
  stake: DuelStake;
  enabled: boolean;
  /** why a chip is disabled */
  blocked: StakeBlock;
}

/** The stake chips: free is always on; the rest need the coins, and locals never play for coins. */
export function stakeChoices(balance: number | null, opts: { bot?: boolean } = {}): StakeChoice[] {
  return DUEL_STAKES.map((stake) => {
    if (stake === 0) return { stake, enabled: true, blocked: null };
    if (opts.bot) return { stake, enabled: false, blocked: 'bot' };
    if (balance === null || balance < stake) return { stake, enabled: false, blocked: 'coins' };
    return { stake, enabled: true, blocked: null };
  });
}

/** Can this wallet put in the stake? */
export function canCover(balance: number | null, stake: number): boolean {
  return stake === 0 || (balance !== null && balance >= stake);
}

/** Lobby locals carry `bot:` account ids. */
export function isBotUser(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith('bot:');
}

/** Coins the result screen counts up: the prize for a win, the refund for a draw, nothing for a loss. */
export function resultCoins(stake: number, won: boolean | null): number {
  if (won === true) return stake > 0 ? stake * 2 : DUEL_REWARD;
  if (won === null) return stake;
  return 0;
}

/** Net wallet change the result screen shows under the counter. */
export function resultNet(stake: number, won: boolean | null): number {
  if (won === true) return stake > 0 ? stake : DUEL_REWARD;
  if (won === null) return 0;
  return -stake;
}
```

- [ ] **Step 4: Run tests and types**

Run: `pnpm --filter @dovey/client exec vitest run src/ui/duel/stakes.test.ts`
Expected: `Tests  7 passed (7)`

Run: `pnpm --filter @dovey/client typecheck`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/duel/stakes.ts client/src/ui/duel/stakes.test.ts
git commit -F - <<'MSG'
feat(client): duel stake picker rules and result payout math

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

## Task 8: Reveal timeline (pure + hooks)

**Files:**
- Create: `client/src/ui/duel/useDuelTimeline.ts`, `client/src/ui/duel/useDuelTimeline.test.ts`

**Interfaces:**
- Consumes: `DUEL_PICK_MS` from `@dovey/shared`, React `useLayoutEffect`/`useEffect`/`useRef`/`useState`.
- Produces:
  - `REVEAL_MS = 1800`
  - `type RevealPhase = 'count' | 'shoot' | 'clash' | 'resolve' | 'settle' | 'done'`
  - `COUNT_WORDS: readonly ['ROCK', 'PAPER', 'SCISSORS']`
  - `type RevealCue = 'tick0' | 'tick1' | 'tick2' | 'shoot' | 'clash' | 'result' | 'done'`
  - `REVEAL_CUES: ReadonlyArray<{ at: number; cue: RevealCue }>`
  - `interface RevealFrame { phase: RevealPhase; progress: number; beat: 0 | 1 | 2 | null }`, plus `IDLE_FRAME: RevealFrame`
  - `revealFrame(elapsedMs: number): RevealFrame`
  - `cuesBetween(prevMs: number, nowMs: number): RevealCue[]`, which returns the cues with `prev < at <= now`
  - `interface RevealHandlers { onCue?: (cue: Exclude<RevealCue, 'done'>) => void; onDone?: () => void }`
  - `class RevealRunner { constructor(on: RevealHandlers); advance(elapsedMs: number): RevealFrame; readonly done: boolean }`
  - `COUNT_UP_MS = 1200` and `countUp(elapsedMs: number, total: number, ms?: number): number`
  - `pickRingMs(round: number): number`
  - `useDuelTimeline(runKey: string | null, on?: RevealHandlers & { now?: () => number }): RevealFrame`
  - `useCountUp(runKey: string | null, total: number, onStep?: (value: number) => void): number`

- [ ] **Step 1: Write the failing test**

Create `client/src/ui/duel/useDuelTimeline.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { COUNT_UP_MS, REVEAL_MS, RevealCue, RevealRunner, countUp, cuesBetween, pickRingMs, revealFrame } from './useDuelTimeline';

describe('reveal timeline', () => {
  it('lasts 1.8 s', () => {
    expect(REVEAL_MS).toBe(1800);
  });

  it('phases start and end on the approved beats', () => {
    expect(revealFrame(-5)).toEqual({ phase: 'count', progress: 0, beat: 0 });
    expect(revealFrame(0)).toEqual({ phase: 'count', progress: 0, beat: 0 });
    expect(revealFrame(199).beat).toBe(0);
    expect(revealFrame(200).beat).toBe(1);
    expect(revealFrame(400).beat).toBe(2);
    expect(revealFrame(599)).toMatchObject({ phase: 'count', beat: 2 });
    expect(revealFrame(600)).toEqual({ phase: 'shoot', progress: 0, beat: null });
    expect(revealFrame(725)).toEqual({ phase: 'shoot', progress: 0.5, beat: null });
    expect(revealFrame(850).phase).toBe('clash');
    expect(revealFrame(1050).phase).toBe('resolve');
    expect(revealFrame(1650).phase).toBe('settle');
    expect(revealFrame(1799).phase).toBe('settle');
    expect(revealFrame(1800)).toEqual({ phase: 'done', progress: 1, beat: null });
  });

  it('cues fall in (prev, now]', () => {
    expect(cuesBetween(-1, 0)).toEqual(['tick0']);
    expect(cuesBetween(0, 0)).toEqual([]);
    expect(cuesBetween(0, 600)).toEqual(['tick1', 'tick2', 'shoot']);
    expect(cuesBetween(600, 1800)).toEqual(['clash', 'result', 'done']);
  });

  it('the runner fires each cue once, in order, then done once (fake clock)', () => {
    let clock = 1000;
    const start = clock;
    const cues: RevealCue[] = [];
    let done = 0;
    const run = new RevealRunner({ onCue: (c) => cues.push(c), onDone: () => done++ });
    run.advance(clock - start);
    expect(cues).toEqual(['tick0']);
    clock += 250;
    run.advance(clock - start);
    run.advance(clock - start); // same instant again: nothing new
    expect(cues).toEqual(['tick0', 'tick1']);
    clock += 850;
    expect(run.advance(clock - start).phase).toBe('resolve');
    expect(cues).toEqual(['tick0', 'tick1', 'tick2', 'shoot', 'clash', 'result']);
    expect(done).toBe(0);
    expect(run.done).toBe(false);
    clock += 700;
    expect(run.advance(clock - start).phase).toBe('done');
    expect(done).toBe(1);
    expect(run.done).toBe(true);
    clock += 5000;
    run.advance(clock - start);
    expect(done).toBe(1);
    expect(cues).toHaveLength(6);
  });

  it('a tab that wakes up late plays every missed cue then finishes', () => {
    const cues: RevealCue[] = [];
    let done = 0;
    const run = new RevealRunner({ onCue: (c) => cues.push(c), onDone: () => done++ });
    run.advance(9000);
    expect(cues).toEqual(['tick0', 'tick1', 'tick2', 'shoot', 'clash', 'result']);
    expect(done).toBe(1);
  });

  it('the coin counter eases up to the total', () => {
    expect(COUNT_UP_MS).toBe(1200);
    expect(countUp(0, 100)).toBe(0);
    expect(countUp(600, 100)).toBe(88); // ease-out cubic: 1 - 0.5^3
    expect(countUp(1200, 100)).toBe(100);
    expect(countUp(5000, 100)).toBe(100);
    expect(countUp(600, 0)).toBe(0);
    const steps = [0, 100, 300, 700, 1100, 1200].map((t) => countUp(t, 1000));
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('later rounds lose the reveal from the 20 s pick ring', () => {
    expect(pickRingMs(1)).toBe(20_000);
    expect(pickRingMs(2)).toBe(18_200);
    expect(pickRingMs(6)).toBe(18_200);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @dovey/client exec vitest run src/ui/duel/useDuelTimeline.test.ts`
Expected: FAIL, `Failed to resolve import "./useDuelTimeline"`.

- [ ] **Step 3: Implement `client/src/ui/duel/useDuelTimeline.ts`**

```ts
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DUEL_PICK_MS } from '@dovey/shared';

/**
 * The reveal choreography as a pure function of elapsed time, so it can be
 * tested with a fake clock and resumes correctly when a hidden tab wakes up.
 *
 *   0-600    count    ROCK (0) PAPER (200) SCISSORS (400), fists pump
 *   600-850  shoot    SHOOT! hands slam to the centre
 *   850-1050 clash    flash, sparks, shake
 *   1050-1650 resolve winner pushes through / loser cracks, or DRAW stamp
 *   1650-1800 settle  hold
 */
export const REVEAL_MS = 1800;
export type RevealPhase = 'count' | 'shoot' | 'clash' | 'resolve' | 'settle' | 'done';
export const COUNT_WORDS = ['ROCK', 'PAPER', 'SCISSORS'] as const;
export type RevealCue = 'tick0' | 'tick1' | 'tick2' | 'shoot' | 'clash' | 'result' | 'done';

const PHASES: ReadonlyArray<{ phase: Exclude<RevealPhase, 'done'>; from: number; to: number }> = [
  { phase: 'count', from: 0, to: 600 },
  { phase: 'shoot', from: 600, to: 850 },
  { phase: 'clash', from: 850, to: 1050 },
  { phase: 'resolve', from: 1050, to: 1650 },
  { phase: 'settle', from: 1650, to: 1800 },
];

export const REVEAL_CUES: ReadonlyArray<{ at: number; cue: RevealCue }> = [
  { at: 0, cue: 'tick0' },
  { at: 200, cue: 'tick1' },
  { at: 400, cue: 'tick2' },
  { at: 600, cue: 'shoot' },
  { at: 850, cue: 'clash' },
  { at: 1050, cue: 'result' },
  { at: 1800, cue: 'done' },
];

export interface RevealFrame {
  phase: RevealPhase;
  /** 0..1 through the current phase */
  progress: number;
  /** which count word shows during 'count' */
  beat: 0 | 1 | 2 | null;
}

export const IDLE_FRAME: RevealFrame = { phase: 'done', progress: 1, beat: null };

export function revealFrame(elapsedMs: number): RevealFrame {
  const t = Math.max(0, elapsedMs);
  if (t >= REVEAL_MS) return { phase: 'done', progress: 1, beat: null };
  const p = PHASES.find((x) => t < x.to)!;
  const progress = (t - p.from) / (p.to - p.from);
  const beat = p.phase === 'count' ? (Math.min(2, Math.floor(t / 200)) as 0 | 1 | 2) : null;
  return { phase: p.phase, progress, beat };
}

/** Cues whose time falls in (prevMs, nowMs]. Start with prev = -1 to include the cue at 0. */
export function cuesBetween(prevMs: number, nowMs: number): RevealCue[] {
  return REVEAL_CUES.filter((c) => c.at > prevMs && c.at <= nowMs).map((c) => c.cue);
}

export interface RevealHandlers {
  onCue?: (cue: Exclude<RevealCue, 'done'>) => void;
  onDone?: () => void;
}

/** Feeds elapsed time in, fires every crossed cue exactly once, and finishes once. */
export class RevealRunner {
  private prev = -1;
  private finished = false;
  constructor(private on: RevealHandlers) {}

  advance(elapsedMs: number): RevealFrame {
    for (const cue of cuesBetween(this.prev, elapsedMs)) {
      if (cue !== 'done') this.on.onCue?.(cue);
      else if (!this.finished) {
        this.finished = true;
        this.on.onDone?.();
      }
    }
    this.prev = Math.max(this.prev, elapsedMs);
    return revealFrame(elapsedMs);
  }

  get done(): boolean {
    return this.finished;
  }
}

export const COUNT_UP_MS = 1200;

/** Result-screen coin counter: ease-out cubic from 0 to total over `ms`. */
export function countUp(elapsedMs: number, total: number, ms = COUNT_UP_MS): number {
  if (total <= 0) return 0;
  const k = Math.min(1, Math.max(0, elapsedMs / ms));
  return Math.round(total * (1 - Math.pow(1 - k, 3)));
}

/** The server's pick clock restarts when a round resolves, so rounds after the first lose the reveal. */
export function pickRingMs(round: number): number {
  return round <= 1 ? DUEL_PICK_MS : DUEL_PICK_MS - REVEAL_MS;
}

/**
 * Plays the reveal for `runKey` (null = nothing on show) on requestAnimationFrame.
 * Re-renders only when the phase or count beat changes; handlers always see the latest props.
 */
export function useDuelTimeline(runKey: string | null, on: RevealHandlers & { now?: () => number } = {}): RevealFrame {
  const [frame, setFrame] = useState<RevealFrame>(IDLE_FRAME);
  const latest = useRef(on);
  latest.current = on;
  useLayoutEffect(() => {
    if (runKey === null) {
      setFrame(IDLE_FRAME);
      return;
    }
    const now = latest.current.now ?? (() => performance.now());
    const runner = new RevealRunner({ onCue: (c) => latest.current.onCue?.(c), onDone: () => latest.current.onDone?.() });
    const start = now();
    let id = 0;
    const tick = () => {
      const f = runner.advance(now() - start);
      setFrame((prev) => (prev.phase === f.phase && prev.beat === f.beat ? prev : f));
      if (!runner.done) id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [runKey]);
  return frame;
}

/** Counts 0 → total over COUNT_UP_MS for `runKey`; calls onStep whenever the shown number changes. */
export function useCountUp(runKey: string | null, total: number, onStep?: (value: number) => void): number {
  const [value, setValue] = useState(0);
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => {
    if (runKey === null) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let id = 0;
    let last = -1;
    const tick = () => {
      const v = countUp(performance.now() - start, total);
      if (v !== last) {
        last = v;
        setValue(v);
        step.current?.(v);
      }
      if (v < total) id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [runKey, total]);
  return value;
}
```

- [ ] **Step 4: Run tests and types**

Run: `pnpm --filter @dovey/client exec vitest run src/ui/duel/useDuelTimeline.test.ts`
Expected: `Tests  7 passed (7)`

Run: `pnpm --filter @dovey/client typecheck`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/duel/useDuelTimeline.ts client/src/ui/duel/useDuelTimeline.test.ts
git commit -F - <<'MSG'
feat(client): pure 1.8 s duel reveal timeline with cue runner and hooks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

Continue with `docs/superpowers/plans/2026-09-14-duel-hd-part4.md`.
