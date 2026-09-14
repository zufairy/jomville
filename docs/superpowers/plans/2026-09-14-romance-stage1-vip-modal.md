# Romance Den Stage 1 — VIP Game Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Game Den and Duel popups with a shared premium "Neon arcade VIP" modal that always has a ✕ close and an Exit Game button, and shows avatar portraits of both players.

**Architecture:** A tiny client roster store mirrors each room player's handle + avatar string by sessionId (fed from `net.ts` player sync). The server adds seat sessionIds to `tg_state` so the table UI can look up avatars. `VipModal` (shell, Esc/✕/Exit with in-modal confirm) and `PlayerVsCard` (AvatarPreview portrait) are new components; `TableGameUI` and `DuelUI` render inside them. Game rules and messages are otherwise unchanged.

**Tech Stack:** React 18, Zustand 5, Vitest 2, Colyseus 0.16, plain CSS (`client/src/styles.css`).

**Spec:** `docs/superpowers/specs/2026-09-14-romance-den-design.md` (Stage 1 only)

## Global Constraints

- Palette tokens exactly: `--vip-bg: rgba(18,10,28,.86)`, `--vip-gold: #e8c26a`, `--vip-pink: #ff4fa3`, `--vip-violet: #8b5cf6`, backdrop blur 14px.
- ✕ button 40×40 top-right, always visible; Exit Game full-width ghost button in footer.
- Exit/✕/Esc during a live match shows an in-modal confirm — never `window.confirm`/`alert`.
- Modal has `role="dialog"` and `aria-modal="true"`; animations disabled under `prefers-reduced-motion`.
- ≤ 480px: modal full-screen.
- Portraits 96px (72px ≤ 480px), drawn with existing `AvatarPreview` (`focus="head"`).
- Client tests are pure logic (no jsdom in repo); do not add testing-library.
- Commands run from repo root: `pnpm --filter @dovey/client test`, `pnpm --filter @dovey/client typecheck`, `pnpm --filter @dovey/server test`, `pnpm dev`.

---

### Task 1: Client roster store

**Files:**
- Create: `client/src/roster.ts`
- Create: `client/src/roster.test.ts`
- Modify: `client/src/net.ts` (players `onAdd`/`onRemove` block ~line 188; `this.events.onReset()` in `resume()` ~line 117; `events.onReset()` in `room.onLeave` ~line 279)

**Interfaces:**
- Produces:
  - `interface RosterEntry { handle: string; userId: string; avatar: string }`
  - `useRoster` Zustand store: `{ players: Record<string, RosterEntry>; upsert(id: string, e: RosterEntry): void; remove(id: string): void; clear(): void }`
  - `avatarOf(sessionId: string | null | undefined): AvatarConfig | null`

- [ ] **Step 1: Write the failing test** — `client/src/roster.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, serializeAvatar } from '@dovey/shared';
import { avatarOf, useRoster } from './roster';

describe('roster', () => {
  beforeEach(() => useRoster.getState().clear());

  it('upserts, reads and removes players', () => {
    const avatar = serializeAvatar({ ...DEFAULT_AVATAR, body: 'female' });
    useRoster.getState().upsert('s1', { handle: 'mia', userId: 'u1', avatar });
    expect(useRoster.getState().players.s1.handle).toBe('mia');
    expect(avatarOf('s1')?.body).toBe('female');
    useRoster.getState().remove('s1');
    expect(avatarOf('s1')).toBeNull();
  });

  it('returns null for unknown or empty ids', () => {
    expect(avatarOf('nope')).toBeNull();
    expect(avatarOf('')).toBeNull();
    expect(avatarOf(null)).toBeNull();
  });

  it('clear empties everything', () => {
    useRoster.getState().upsert('s1', { handle: 'a', userId: 'u', avatar: '' });
    useRoster.getState().clear();
    expect(useRoster.getState().players).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/client test -- roster`
Expected: FAIL — cannot resolve `./roster`.

- [ ] **Step 3: Write minimal implementation** — `client/src/roster.ts`

```ts
import { create } from 'zustand';
import { AvatarConfig, parseAvatar } from '@dovey/shared';

/**
 * Who is in the room right now, by sessionId. Popups need a player's look
 * (portraits) without reaching into the Pixi world; net.ts keeps this in step
 * with room state.
 */
export interface RosterEntry {
  handle: string;
  userId: string;
  avatar: string;
}

interface RosterStore {
  players: Record<string, RosterEntry>;
  upsert: (id: string, e: RosterEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useRoster = create<RosterStore>((set) => ({
  players: {},
  upsert: (id, e) => set((s) => ({ players: { ...s.players, [id]: e } })),
  remove: (id) =>
    set((s) => {
      const players = { ...s.players };
      delete players[id];
      return { players };
    }),
  clear: () => set({ players: {} }),
}));

export function avatarOf(sessionId: string | null | undefined): AvatarConfig | null {
  if (!sessionId) return null;
  const p = useRoster.getState().players[sessionId];
  return p ? parseAvatar(p.avatar) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dovey/client test -- roster`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `net.ts`**

Add import at top (next to the other store imports):

```ts
import { useRoster } from './roster';
```

Replace the players block:

```ts
    $(room.state).players.onAdd((p: RemotePlayer, id: string) => {
      events.onAdd(id, p);
      useRoster.getState().upsert(id, { handle: p.handle, userId: p.userId, avatar: p.avatar });
      if (id === room.sessionId) syncRoom();
      $(p).onChange(() => {
        events.onChange(id, p);
        useRoster.getState().upsert(id, { handle: p.handle, userId: p.userId, avatar: p.avatar });
      });
      store.setPlayerCount(room.state.players.size);
    });
    $(room.state).players.onRemove((_p: RemotePlayer, id: string) => {
      events.onRemove(id);
      useRoster.getState().remove(id);
      store.setPlayerCount(room.state.players.size);
    });
```

Directly before `this.events.onReset();` in `resume()` and before `events.onReset();` in `room.onLeave`, add:

```ts
    useRoster.getState().clear();
```

- [ ] **Step 6: Typecheck + tests**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/roster.ts client/src/roster.test.ts client/src/net.ts
git commit -m "feat(client): room roster store for player portraits"
```

---

### Task 2: Seat sessionIds in table-game state

**Files:**
- Modify: `server/src/GameRoom.ts` (`sendTableState`, ~line 883)
- Modify: `client/src/tableGames.ts` (`TableMatchView`)
- Create: `client/src/tableGames.test.ts`

**Interfaces:**
- Produces: `TableMatchView.seats: [string, string]` — sessionId per seat, `''` for the bot.

- [ ] **Step 1: Write the failing test** — `client/src/tableGames.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { TableState } from '@dovey/shared';
import { onTableState, useTables } from './tableGames';

const base = {
  id: 'm1',
  kind: 'ttt' as const,
  you: 0 as const,
  names: ['me', 'mia'] as [string, string],
  seats: ['s-me', 's-mia'] as [string, string],
  state: {} as TableState,
  turnLeft: 10_000,
  rematch: [false, false] as [boolean, boolean],
  bot: false,
  round: 1,
  over: false,
  table: null,
};

describe('table store', () => {
  beforeEach(() => useTables.getState().reset());

  it('keeps seat session ids from the server', () => {
    onTableState(base);
    expect(useTables.getState().match?.seats).toEqual(['s-me', 's-mia']);
    expect(useTables.getState().phase).toBe('playing');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dovey/client test -- tableGames`
Expected: FAIL — `match?.seats` is `undefined` (store stores what it is given, but `TableMatchView` has no `seats`; also `pnpm --filter @dovey/client typecheck` reports excess property `seats`).

Note: if Vitest passes at runtime because the spread copies extra fields, the typecheck failure is the red signal — run `pnpm --filter @dovey/client typecheck` and confirm the `seats` error before implementing.

- [ ] **Step 3: Implement**

In `client/src/tableGames.ts`, inside `interface TableMatchView` after `names`:

```ts
  /** sessionId per seat ('' for the bot), for portraits */
  seats: [string, string];
```

In `server/src/GameRoom.ts` `sendTableState`, after `const names = ...`:

```ts
    const seats = m.players.map((id) => (isBot(id) ? '' : id));
```

and add `seats,` directly after `names,` in the `tg_state` payload.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test -- tableGames && pnpm --filter @dovey/server test -- tableGames`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/GameRoom.ts client/src/tableGames.ts client/src/tableGames.test.ts
git commit -m "feat: send seat session ids with table game state"
```

---

### Task 3: VipModal shell + close/exit logic

**Files:**
- Create: `client/src/ui/vipModal.ts`
- Create: `client/src/ui/vipModal.test.ts`
- Create: `client/src/ui/VipModal.tsx`
- Modify: `client/src/styles.css` (append VIP section directly before `/* ---- wearable catalog ---- */`)

**Interfaces:**
- Produces:
  - `type ExitIntent = 'close' | 'confirm' | 'cancel-confirm' | 'none'`
  - `exitIntent(o: { live: boolean; confirming: boolean; key?: string; source: 'x' | 'exit' | 'key' | 'backdrop' }): ExitIntent`
  - `VipModal` props: `{ title: ReactNode; label: string; live?: boolean; onExit: () => void; exitLabel?: string; headerExtra?: ReactNode; wide?: boolean; children: ReactNode }`
  - CSS button classes for later tasks: `vip__btn`, `vip__btn--pink`, `vip__btn--ghost`, `vip__btn--danger`.

Rules of `exitIntent`:
- `source:'key'` with key other than `Escape` → `'none'`.
- `confirming` and (Escape key or backdrop) → `'cancel-confirm'`.
- `source:'backdrop'` and not confirming → `'none'` (backdrop never closes; avoids mid-game misclicks).
- `live` and not confirming (x / exit / Escape) → `'confirm'`.
- otherwise → `'close'` (includes x/exit while confirming = the "leave" path).

- [ ] **Step 1: Write the failing test** — `client/src/ui/vipModal.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { exitIntent } from './vipModal';

describe('exitIntent', () => {
  it('closes straight away when no match is live', () => {
    expect(exitIntent({ live: false, confirming: false, source: 'x' })).toBe('close');
    expect(exitIntent({ live: false, confirming: false, source: 'exit' })).toBe('close');
    expect(exitIntent({ live: false, confirming: false, source: 'key', key: 'Escape' })).toBe('close');
  });
  it('asks to confirm when a match is live', () => {
    expect(exitIntent({ live: true, confirming: false, source: 'x' })).toBe('confirm');
    expect(exitIntent({ live: true, confirming: false, source: 'exit' })).toBe('confirm');
    expect(exitIntent({ live: true, confirming: false, source: 'key', key: 'Escape' })).toBe('confirm');
  });
  it('leave button inside the confirm closes', () => {
    expect(exitIntent({ live: true, confirming: true, source: 'exit' })).toBe('close');
  });
  it('Escape or backdrop backs out of the confirm', () => {
    expect(exitIntent({ live: true, confirming: true, source: 'key', key: 'Escape' })).toBe('cancel-confirm');
    expect(exitIntent({ live: true, confirming: true, source: 'backdrop' })).toBe('cancel-confirm');
  });
  it('ignores other keys and backdrop clicks', () => {
    expect(exitIntent({ live: false, confirming: false, source: 'key', key: 'a' })).toBe('none');
    expect(exitIntent({ live: true, confirming: false, source: 'backdrop' })).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dovey/client test -- vipModal`
Expected: FAIL — cannot resolve `./vipModal`.

- [ ] **Step 3: Implement logic** — `client/src/ui/vipModal.ts`

```ts
/** What a close gesture on the VIP game popup should do. Pure so it is testable without a DOM. */
export type ExitIntent = 'close' | 'confirm' | 'cancel-confirm' | 'none';

export function exitIntent(o: { live: boolean; confirming: boolean; key?: string; source: 'x' | 'exit' | 'key' | 'backdrop' }): ExitIntent {
  if (o.source === 'key' && o.key !== 'Escape') return 'none';
  if (o.confirming && (o.source === 'key' || o.source === 'backdrop')) return 'cancel-confirm';
  if (o.source === 'backdrop') return 'none';
  if (o.live && !o.confirming) return 'confirm';
  return 'close';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dovey/client test -- vipModal`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement component** — `client/src/ui/VipModal.tsx`

```tsx
import { ReactNode, useEffect, useRef, useState } from 'react';
import { exitIntent } from './vipModal';

interface VipModalProps {
  title: ReactNode;
  /** accessible name for the dialog */
  label: string;
  /** a match is in progress: leaving asks first */
  live?: boolean;
  onExit: () => void;
  exitLabel?: string;
  headerExtra?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

/** Premium neon-arcade shell shared by every game popup: ✕ in the header, Exit Game in the footer. */
export function VipModal({ title, label, live = false, onExit, exitLabel = 'exit game', headerExtra, wide, children }: VipModalProps) {
  const [confirming, setConfirming] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  const act = (source: 'x' | 'exit' | 'key' | 'backdrop', key?: string) => {
    const i = exitIntent({ live, confirming, source, key });
    if (i === 'close') {
      setConfirming(false);
      onExit();
    } else if (i === 'confirm') setConfirming(true);
    else if (i === 'cancel-confirm') setConfirming(false);
  };

  // re-bound every render so the handler sees current live/confirming
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      act('key', e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    card.current?.focus();
  }, []);

  useEffect(() => {
    if (!live) setConfirming(false);
  }, [live]);

  return (
    <div className="vip" onPointerDown={(e) => e.target === e.currentTarget && act('backdrop')}>
      <div ref={card} tabIndex={-1} className={`vip__card ${wide ? 'vip__card--wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="vip__trim" aria-hidden />
        <header className="vip__head">
          <h2 className="vip__title">{title}</h2>
          {headerExtra}
          <button className="vip__x" onClick={() => act('x')} aria-label="close">
            ✕
          </button>
        </header>
        <div className="vip__body">{children}</div>
        <footer className="vip__foot">
          <button className="vip__exit" onClick={() => act('exit')}>
            {exitLabel}
          </button>
        </footer>
        {confirming && (
          <div className="vip__confirm" role="alertdialog" aria-label="leave the match?">
            <div className="vip__confirm-card">
              <div className="vip__confirm-title">leave the match?</div>
              <p className="vip__confirm-sub">you'll forfeit this game.</p>
              <div className="vip__confirm-btns">
                <button className="vip__btn vip__btn--danger" onClick={() => act('exit')}>
                  leave
                </button>
                <button className="vip__btn" onClick={() => setConfirming(false)}>
                  stay
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add CSS** — insert into `client/src/styles.css` directly before `/* ---- wearable catalog ---- */`

```css
/* ---- VIP game popup: neon arcade, gold trim */
:root {
  --vip-bg: rgba(18,10,28,.86);
  --vip-gold: #e8c26a;
  --vip-pink: #ff4fa3;
  --vip-violet: #8b5cf6;
}
.vip {
  position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: radial-gradient(80% 60% at 50% 40%, rgba(139, 92, 246, 0.22), rgba(6, 3, 12, 0.72));
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.vip__card {
  position: relative; width: 100%; max-width: 460px; max-height: calc(100% - 20px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(40, 20, 60, 0.9), var(--vip-bg) 45%);
  color: #fbf5ff; border: 1px solid var(--vip-gold); border-radius: 26px; outline: none; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(232, 194, 106, 0.25) inset, 0 0 40px rgba(255, 79, 163, 0.28), 0 18px 50px rgba(0, 0, 0, 0.55);
  animation: vip-in 0.34s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.vip__card--wide { max-width: 500px; }
.vip__trim {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(115deg, transparent 30%, rgba(232, 194, 106, 0.18) 45%, transparent 60%) no-repeat;
  background-size: 250% 100%; animation: vip-sheen 5s ease-in-out infinite;
}
.vip__head { position: relative; display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px 18px; border-bottom: 1px solid rgba(232, 194, 106, 0.22); }
.vip__title {
  flex: 1; min-width: 0; margin: 0; font-weight: 900; font-size: 20px; letter-spacing: 0.3px; text-align: left;
  color: #fff; text-shadow: 0 0 10px var(--vip-pink), 0 0 22px rgba(255, 79, 163, 0.55); animation: vip-pulse 2.8s ease-in-out infinite;
  display: flex; align-items: center; gap: 8px;
}
.vip__x {
  flex: none; width: 40px; height: 40px; border-radius: 14px; border: 1px solid rgba(232, 194, 106, 0.55);
  background: rgba(255, 255, 255, 0.06); color: var(--vip-gold); font-size: 18px; font-weight: 900; cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}
.vip__x:hover { background: rgba(232, 194, 106, 0.16); box-shadow: 0 0 14px rgba(232, 194, 106, 0.45); }
.vip__x:active { transform: scale(0.94); }
.vip__body { position: relative; flex: 1; min-height: 0; overflow: auto; padding: 12px 16px; text-align: center; }
.vip__foot { position: relative; padding: 10px 16px 16px; }
.vip__exit {
  width: 100%; min-height: 44px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.22); background: transparent;
  color: rgba(255, 255, 255, 0.82); font: inherit; font-weight: 800; font-size: 14px; letter-spacing: 0.4px; text-transform: uppercase; cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.vip__exit:hover { border-color: var(--vip-pink); color: #fff; background: rgba(255, 79, 163, 0.1); }
.vip__btn {
  min-height: 42px; padding: 8px 18px; border-radius: 14px; border: 1px solid rgba(232, 194, 106, 0.6);
  background: linear-gradient(180deg, #f3d98f, var(--vip-gold)); color: #2a1a08; font: inherit; font-weight: 900; cursor: pointer;
  box-shadow: 0 3px 0 #9c7a2e, 0 0 16px rgba(232, 194, 106, 0.35);
}
.vip__btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #9c7a2e; }
.vip__btn:disabled { opacity: 0.5; cursor: default; }
.vip__btn--pink { background: linear-gradient(180deg, #ff86c1, var(--vip-pink)); color: #fff; border-color: #ffb3d6; box-shadow: 0 3px 0 #a3185e, 0 0 16px rgba(255, 79, 163, 0.45); }
.vip__btn--ghost { background: rgba(255, 255, 255, 0.06); color: #fff; border-color: rgba(255, 255, 255, 0.25); box-shadow: none; }
.vip__btn--danger { background: linear-gradient(180deg, #ff7a8a, #e3344c); color: #fff; border-color: #ffb0ba; box-shadow: 0 3px 0 #8e1627; }
.vip__confirm { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 16px; background: rgba(6, 3, 12, 0.7); animation: vip-fade 0.15s ease-out; }
.vip__confirm-card { width: 100%; max-width: 300px; padding: 18px; border-radius: 20px; background: #1d1030; border: 1px solid var(--vip-pink); box-shadow: 0 0 30px rgba(255, 79, 163, 0.35); text-align: center; }
.vip__confirm-title { font-weight: 900; font-size: 18px; }
.vip__confirm-sub { margin: 6px 0 14px; font-weight: 700; font-size: 13px; opacity: 0.7; }
.vip__confirm-btns { display: flex; gap: 10px; justify-content: center; }
.vip .btn { color: var(--ink); }
@keyframes vip-in { from { opacity: 0; transform: translateY(14px) scale(0.94); } }
@keyframes vip-fade { from { opacity: 0; } }
@keyframes vip-sheen { 0%, 60% { background-position: 150% 0; } 100% { background-position: -150% 0; } }
@keyframes vip-pulse { 50% { text-shadow: 0 0 6px var(--vip-pink), 0 0 14px rgba(255, 79, 163, 0.35); } }
@media (max-width: 480px) {
  .vip { padding: 0; }
  .vip__card, .vip__card--wide { max-width: none; max-height: none; height: 100%; border-radius: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .vip__card, .vip__trim, .vip__title, .vip__confirm { animation: none; }
}
```

- [ ] **Step 7: Typecheck + tests**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/ui/vipModal.ts client/src/ui/vipModal.test.ts client/src/ui/VipModal.tsx client/src/styles.css
git commit -m "feat(client): VIP game popup shell with close and exit"
```

---

### Task 4: PlayerVsCard portraits

**Files:**
- Create: `client/src/ui/PlayerVsCard.tsx`
- Modify: `client/src/styles.css` (append directly after the VIP section from Task 3)

**Interfaces:**
- Consumes: `useRoster` (Task 1); `AvatarPreview` from `client/src/ui/AvatarPreview.tsx` (props `cfg`, `scale`, `animate`, `focus`, `className`); `useAppStore((s) => s.avatar)` and `useAppStore((s) => s.sessionId)` from `client/src/store.ts`.
- Produces:
  - `interface VsPlayer { sessionId: string; name: string; bot?: boolean; active?: boolean; score?: number | null; badge?: ReactNode }`
  - `PlayerVsCard({ player }: { player: VsPlayer })`
  - `PlayersVs({ left, right, divider }: { left: VsPlayer; right: VsPlayer; divider?: ReactNode })` — `divider` defaults to `'VS'`.

Portrait source: own sessionId → `useAppStore` avatar (no roster lag); other sessionId → roster entry; bot or unknown → emoji fallback (`🤖` bot, `❔` otherwise).

- [ ] **Step 1: Implement component** — `client/src/ui/PlayerVsCard.tsx`

```tsx
import { ReactNode } from 'react';
import { parseAvatar } from '@dovey/shared';
import { useAppStore } from '../store';
import { useRoster } from '../roster';
import { AvatarPreview } from './AvatarPreview';

export interface VsPlayer {
  sessionId: string;
  name: string;
  bot?: boolean;
  active?: boolean;
  score?: number | null;
  badge?: ReactNode;
}

/** A player's portrait card for game popups: avatar head, name, turn glow and score. */
export function PlayerVsCard({ player }: { player: VsPlayer }) {
  const mySession = useAppStore((s) => s.sessionId);
  const myAvatar = useAppStore((s) => s.avatar);
  const entry = useRoster((s) => (player.sessionId ? s.players[player.sessionId] : undefined));
  const cfg = player.bot ? null : player.sessionId && player.sessionId === mySession ? myAvatar : entry ? parseAvatar(entry.avatar) : null;

  return (
    <div className={`vs-card ${player.active ? 'vs-card--active' : ''}`}>
      <div className="vs-card__ring">
        {cfg ? (
          <AvatarPreview cfg={cfg} focus="head" scale={3} animate={false} className="vs-card__img" />
        ) : (
          <span className="vs-card__fallback" aria-hidden>
            {player.bot ? '🤖' : '❔'}
          </span>
        )}
      </div>
      <div className="vs-card__name">{player.name}</div>
      {player.badge}
      {player.score !== undefined && player.score !== null && <div className="vs-card__score">{player.score}</div>}
    </div>
  );
}

export function PlayersVs({ left, right, divider = 'VS' }: { left: VsPlayer; right: VsPlayer; divider?: ReactNode }) {
  return (
    <div className="vs">
      <PlayerVsCard player={left} />
      <div className="vs__divider" aria-hidden>
        {divider}
      </div>
      <PlayerVsCard player={right} />
    </div>
  );
}
```

- [ ] **Step 2: Add CSS** — append after the VIP section

```css
/* VIP portraits */
.vs { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 4px 0 12px; }
.vs__divider {
  flex: none; font-weight: 900; font-size: 20px; font-style: italic; color: var(--vip-gold);
  text-shadow: 0 0 10px rgba(232, 194, 106, 0.7); animation: vip-pulse 2.8s ease-in-out infinite;
}
.vs-card { flex: 1; min-width: 0; max-width: 170px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px; border-radius: 18px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s; }
.vs-card--active { border-color: var(--vip-pink); box-shadow: 0 0 18px rgba(255, 79, 163, 0.45); transform: translateY(-2px); }
.vs-card__ring {
  width: 96px; height: 96px; border-radius: 50%; padding: 3px; display: grid; place-items: center;
  background: conic-gradient(from 200deg, var(--vip-gold), var(--vip-pink), var(--vip-violet), var(--vip-gold));
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.45);
}
.vs-card__img, .vs-card__fallback { width: 100%; height: 100%; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #3a2160, #140a22); image-rendering: pixelated; display: grid; place-items: center; font-size: 40px; }
.vs-card__name { max-width: 100%; font-weight: 800; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vs-card__score { font-weight: 900; font-size: 22px; color: var(--vip-gold); text-shadow: 0 0 10px rgba(232, 194, 106, 0.6); }
@media (max-width: 480px) {
  .vs-card__ring { width: 72px; height: 72px; }
  .vs-card__fallback { font-size: 30px; }
}
@media (prefers-reduced-motion: reduce) {
  .vs__divider { animation: none; }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dovey/client typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/PlayerVsCard.tsx client/src/styles.css
git commit -m "feat(client): VS portrait cards for game popups"
```

---

### Task 5: Migrate Game Den (TableGameUI) to VIP modal

**Files:**
- Modify: `client/src/ui/TableGameUI.tsx`
- Modify: `client/src/styles.css` (game den section ~lines 1634-1658 and the `@media (max-width: 480px)` block ~line 1805)

**Interfaces:**
- Consumes: `VipModal` (Task 3); `PlayersVs` (Task 4); `TableMatchView.seats` (Task 2); `tables.leave()`, `tables.cancel()`, `useTables.getState().close()` from `client/src/tableGames.ts`.

Behaviour:
- Menu: title `🎲 game den`; exit = `useTables.getState().close()`; not live.
- Queue: exit = `tables.cancel()`; waiting (sat at a table): exit = `useTables.getState().close()`; not live.
- Playing: `live = !match.over && !match.bot`; exit = `tables.leave()`; exit label `forfeit & exit` while live, else `exit game`.
- Headers with `tg__x` removed from `GameMenu` and `MatchView` (header now in `VipModal`).
- `tg-players` + `PlayerChip` replaced by `PlayersVs`; seat token passed as `badge`.

- [ ] **Step 1: Add imports** at top of `TableGameUI.tsx`

```tsx
import { VipModal } from './VipModal';
import { PlayersVs } from './PlayerVsCard';
```

- [ ] **Step 2: Replace the popup return** in `TableGameUI` (the `return (<div className="tg" …>…</div>);` block, lines 40-48) with:

```tsx
  const leaveNow = () => {
    if (phase === 'playing') tables.leave();
    else if (phase === 'queue') tables.cancel();
    else useTables.getState().close();
  };
  const live = phase === 'playing' && !!match && !match.over && !match.bot;
  const title =
    phase === 'playing' && match ? (
      <>
        {TABLE_GAMES[match.kind].icon} {TABLE_GAMES[match.kind].name}
        {match.round > 1 && <span className="tg__round">round {match.round}</span>}
      </>
    ) : phase !== 'menu' && kind ? (
      `${TABLE_GAMES[kind].icon} ${TABLE_GAMES[kind].name}`
    ) : (
      '🎲 game den'
    );

  return (
    <VipModal title={title} label="board game" live={live} onExit={leaveNow} exitLabel={live ? 'forfeit & exit' : 'exit game'} wide={phase === 'playing'}>
      {phase === 'menu' && <GameMenu />}
      {(phase === 'queue' || phase === 'waiting') && kind && <Matchmaking kind={kind} waiting={phase === 'waiting'} />}
      {phase === 'playing' && match && <MatchView match={match} />}
    </VipModal>
  );
```

- [ ] **Step 3: Update `GameMenu`** — delete its `<div className="tg__head">…</div>` block (lines 54-59); keep `tg__sub` and the grid.

- [ ] **Step 4: Update `Matchmaking`** — change `<h2 className="tg__title">…</h2>` to `<div className="tg__title">…</div>` (the modal owns the `h2`).

- [ ] **Step 5: Update `MatchView`** — delete the `tg__head` block (lines 162-170). Replace the `tg-players` block (lines 172-176) with:

```tsx
      <PlayersVs
        left={{
          sessionId: match.seats[me],
          name: 'you',
          active: !match.over && s.turn === me,
          score: scored ? s.score[me] : null,
          badge: <span className={`tg-token tg-token--${match.kind} p${me}`}>{match.kind === 'ttt' ? (me === 0 ? '✕' : '○') : ''}</span>,
        }}
        right={{
          sessionId: match.seats[them],
          name: match.names[them],
          bot: match.bot,
          active: !match.over && s.turn === them,
          score: scored ? s.score[them] : null,
          badge: <span className={`tg-token tg-token--${match.kind} p${them}`}>{match.kind === 'ttt' ? (them === 0 ? '✕' : '○') : ''}</span>,
        }}
      />
```

In the result block's buttons replace:

```tsx
            <button className="btn btn--go" disabled={match.rematch[me] || status !== 'connected'} onClick={() => tables.rematch()}>
```

with

```tsx
            <button className="vip__btn" disabled={match.rematch[me] || status !== 'connected'} onClick={() => tables.rematch()}>
```

and

```tsx
            <button className="btn" onClick={() => tables.leave()}>
              leave
            </button>
```

with

```tsx
            <button className="vip__btn vip__btn--ghost" onClick={() => tables.leave()}>
              exit game
            </button>
```

- [ ] **Step 6: Delete the unused `PlayerChip` function** (lines 212-223).

- [ ] **Step 7: CSS cleanup** — in `client/src/styles.css`:
  - Delete rules: `.tg { … }`, `.tg__card { … }`, `.tg__card--play { … }`, `.tg__head { … }`, `.tg__x { … }`, `.tg .btn { … }`, and the whole players block `.tg-players`, `.tg-players__vs`, `.tg-chip`, `.tg-chip--active`, `.tg-chip__name`, `.tg-chip__score`.
  - In `@media (max-width: 480px)` near the end of the game den section, delete the `.tg__card { … }` line (keep `.tg-launch`).
  - Replace `.tg__title` with:

```css
.tg__title { margin: 0; font-weight: 900; font-size: 20px; letter-spacing: 0.2px; }
```

  - Replace `.tg-game:hover` with:

```css
.tg-game:hover { border-color: var(--vip-pink); box-shadow: 0 0 16px rgba(255, 79, 163, 0.35); }
```

- [ ] **Step 8: Typecheck + tests**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test && grep -rn "PlayerChip\|tg__x\|tg-chip" client/src`
Expected: typecheck + tests PASS; grep prints nothing.

- [ ] **Step 9: Manual check**

Run: `pnpm dev`. Two browser windows, both in the game room, open 🎲 games:
- Menu: ✕ and EXIT GAME both close; Esc closes.
- Quick match in both: both portraits show real avatars; active glow follows the turn.
- Mid-match ✕ / Esc / EXIT → "leave the match?"; "stay" returns; "leave" ends the match and the other window shows "your opponent left the table".
- vs bot: right portrait is 🤖; exit closes without confirm.
- Window ≤ 480px wide: modal is full-screen.

- [ ] **Step 10: Commit**

```bash
git add client/src/ui/TableGameUI.tsx client/src/styles.css
git commit -m "feat(client): game den uses VIP popup with player portraits"
```

---

### Task 6: Migrate Duel popup to VIP modal

**Files:**
- Modify: `client/src/ui/DuelUI.tsx`
- Modify: `client/src/styles.css` (duel section ~lines 1550-1601)

**Interfaces:**
- Consumes: `VipModal` (Task 3); `PlayersVs` (Task 4); `useAppStore((s) => s.duel)` — `duel.peer` is the opponent sessionId (server `GameRoom.ts:416`); `useAppStore((s) => s.sessionId)`; `actions.duelEnd / duelAccept / duelDecline / duelPick`.

Behaviour:
- Exit: phase `incoming` → `actions.duelDecline()`; any other phase → `actions.duelEnd()`.
- `live = phase === 'pick' || phase === 'reveal'`.
- Title: `ringing` → `⚔️ challenging…`; `incoming` → `⚔️ duel challenge`; else `⚔️ rock paper scissors`.
- Portraits in every phase; scores only in pick/reveal/over.

- [ ] **Step 1: Replace `client/src/ui/DuelUI.tsx`** entirely with:

```tsx
import { useAppStore } from '../store';
import { VipModal } from './VipModal';
import { PlayersVs } from './PlayerVsCard';

const HANDS = ['✊', '✋', '✌️'];
const NAMES = ['rock', 'paper', 'scissors'];

/** Rock-paper-scissors duel popup: invite, pick, reveal, result. Best of three, winner earns coins. */
export function DuelUI() {
  const duel = useAppStore((s) => s.duel);
  const actions = useAppStore((s) => s.actions);
  const sessionId = useAppStore((s) => s.sessionId);
  if (duel.phase === 'idle') return null;
  const me = duel.you === 'a' ? 0 : 1;
  const them = 1 - me;
  const playing = duel.phase === 'pick' || duel.phase === 'reveal' || duel.phase === 'over';
  const live = duel.phase === 'pick' || duel.phase === 'reveal';
  const exit = () => (duel.phase === 'incoming' ? actions?.duelDecline() : actions?.duelEnd());
  const title = duel.phase === 'ringing' ? '⚔️ challenging…' : duel.phase === 'incoming' ? '⚔️ duel challenge' : '⚔️ rock paper scissors';
  const exitLabel = live ? 'forfeit & exit' : duel.phase === 'incoming' ? 'pass' : duel.phase === 'ringing' ? 'cancel' : 'exit game';

  return (
    <VipModal title={title} label="duel" live={live} onExit={exit} exitLabel={exitLabel}>
      <PlayersVs
        left={{ sessionId: sessionId ?? '', name: 'you', score: playing ? duel.score[me] : null }}
        right={{ sessionId: duel.peer, name: duel.handle, score: playing ? duel.score[them] : null }}
        divider={playing ? <span className="duel__round">R{duel.round}</span> : 'VS'}
      />
      {duel.phase === 'ringing' && <p className="duel__sub">waiting for {duel.handle} to accept</p>}
      {duel.phase === 'incoming' && (
        <>
          <p className="duel__sub">{duel.handle} challenges you! best of three. winner takes 25 coins.</p>
          <div className="duel__btns">
            <button className="vip__btn vip__btn--pink" onClick={() => actions?.duelAccept()}>
              accept
            </button>
          </div>
        </>
      )}
      {duel.phase === 'pick' && (
        <>
          <div className="duel__timer" key={duel.round}>
            <i />
          </div>
          <p className="duel__sub">{duel.myPick === null ? 'pick your hand' : `you threw ${NAMES[duel.myPick]}… waiting for ${duel.handle}`}</p>
          <div className="duel__hands">
            {HANDS.map((h, i) => (
              <button key={h} className={`hand ${duel.myPick === i ? 'hand--on' : ''}`} disabled={duel.myPick !== null} onClick={() => actions?.duelPick(i as 0 | 1 | 2)} aria-label={NAMES[i]}>
                {h}
              </button>
            ))}
          </div>
        </>
      )}
      {(duel.phase === 'reveal' || duel.phase === 'over') && duel.last && (
        <>
          <div className="duel__reveal">
            <span className={duel.last.winner === duel.you ? 'win' : duel.last.winner === 'draw' ? '' : 'lose'}>{HANDS[duel.last.picks[me]]}</span>
            <span className="duel__vs">vs</span>
            <span className={duel.last.winner !== 'draw' && duel.last.winner !== duel.you ? 'win' : duel.last.winner === 'draw' ? '' : 'lose'}>{HANDS[duel.last.picks[them]]}</span>
          </div>
          <p className="duel__result">
            {duel.phase === 'over'
              ? duel.won
                ? '🏆 you win! +25 coins'
                : duel.won === false
                  ? `${duel.handle} wins`
                  : 'draw'
              : duel.last.winner === 'draw'
                ? 'draw!'
                : duel.last.winner === duel.you
                  ? 'you take the round'
                  : `${duel.handle} takes the round`}
          </p>
        </>
      )}
    </VipModal>
  );
}
```

- [ ] **Step 2: Restyle duel CSS** — in `client/src/styles.css`:
  - Delete rules `.duel { … }`, `.duel__card { … }`, `.duel__title { … }`, `.duel__score { … }`, `.duel__score span { … }`. Keep `@keyframes sheet-pop` (line 1573).
  - Replace `.duel__sub`, `.hand`, `.hand:active, .hand--on`, `.duel__timer`, `.duel__timer i` with:

```css
.duel__sub { font-weight: 700; opacity: 0.75; margin: 0 0 12px; font-size: 13px; }
.duel__round { font-size: 14px; font-style: normal; }
.hand {
  width: 92px; height: 92px; border-radius: 22px; border: 1px solid rgba(232, 194, 106, 0.55);
  background: rgba(255, 255, 255, 0.06); font-size: 44px; cursor: pointer;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35); transition: transform 0.12s, box-shadow 0.12s;
}
.hand:hover:not(:disabled) { box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 0 18px rgba(255, 79, 163, 0.45); }
.hand:active, .hand--on { transform: translateY(3px) scale(1.06); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35), 0 0 20px rgba(232, 194, 106, 0.6); background: rgba(232, 194, 106, 0.22); }
.duel__timer { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); overflow: hidden; margin: 0 20px 10px; }
.duel__timer i { display: block; height: 100%; background: linear-gradient(90deg, var(--vip-gold), var(--vip-pink)); animation: timer 20s linear forwards; }
```

  - Keep: `.btn--duel`, `.duel__vs`, `.duel__hands`, `.hand:disabled`, `.duel__reveal*`, `.duel__result`, `.duel__btns`, `@keyframes timer`, `@keyframes hand-pop`.

- [ ] **Step 3: Typecheck + tests**

Run: `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test && grep -n "duel__card\|duel__title" client/src -r`
Expected: PASS; grep prints nothing.

- [ ] **Step 4: Manual check**

`pnpm dev`, two windows: tap other avatar → duel.
- Ringing: both portraits; CANCEL / ✕ ends it.
- Incoming: both portraits + accept; ✕ / PASS declines.
- Mid-round ✕ / Esc / EXIT → confirm; "leave" forfeits.
- Over: EXIT closes without confirm.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/DuelUI.tsx client/src/styles.css
git commit -m "feat(client): duel uses VIP popup with player portraits"
```

---

## Stage 1 done when

- `pnpm --filter @dovey/client typecheck`, `pnpm --filter @dovey/client test`, `pnpm --filter @dovey/server test` all pass.
- Game Den and Duel popups show the VIP look; ✕ and Exit Game always visible; confirm on live exit; real avatar portraits for human players, 🤖 for the bot.
- Stages 2-4 (romance queue + Truth or Dare, Draw & Guess + Blind Date, match/couples/DM) get their own plans after Stage 1 lands.
