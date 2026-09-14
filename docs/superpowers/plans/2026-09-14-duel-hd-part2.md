# Duel HD Implementation Plan (part 2 of 7: Tasks 4-5, server)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Header, Global Constraints and File Map: `docs/superpowers/plans/2026-09-14-duel-hd.md`. Spec: `docs/superpowers/specs/2026-09-14-duel-hd-design.md`. Tasks 1-3 must be done first. Client tests run in vitest's **node** environment (no DOM); every unit-tested client module is pure TypeScript.

---

## Task 4: `duels` table + escrow/settlement repo methods

**Files:**
- Modify: `server/src/db.ts` (SCHEMA string)
- Modify: `server/src/repo.ts`
- Create: `server/src/repo.duel.test.ts`

**Interfaces:**
- Consumes: `Db.transaction` (Task 1), and the existing `Repo#spendCoins(userId, amount): Promise<number | null>` / `Repo#creditCoins(userId, amount): Promise<number>`.
- Produces:
  - `interface DuelSettleInput { aId: string; bId: string; stake: number; credits: Array<{ userId: string; amount: number }>; winnerId: string | null; outcome: 'win' | 'draw' | 'forfeit' | 'left'; roomId: string; log: boolean }`
  - `Repo#escrowDuel(aId: string, bId: string, stake: number): Promise<{ ok: true; coins: [number, number] } | { ok: false; short: 'a' | 'b' }>`
  - `Repo#settleDuel(s: DuelSettleInput): Promise<Record<string, number>>`, which maps each credited user id to their new balance.

- [ ] **Step 1: Write the failing test**

Create `server/src/repo.duel.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@dovey/shared';
import { Db, openTestDb } from './db';
import { Repo, User } from './repo';

let db: Db;
let repo: Repo;
let a: User;
let b: User;
const setCoins = (id: string, n: number) => db.query('update users set coins = $2 where id = $1', [id, n]);
const duelRows = () => db.query<{ n: number }>('select count(*)::int as n from duels').then((r) => r[0].n);

beforeAll(async () => {
  db = await openTestDb();
  repo = new Repo(db);
  a = await repo.createUser('duelRepoA'.padEnd(32, 'a'), DEFAULT_AVATAR);
  b = await repo.createUser('duelRepoB'.padEnd(32, 'b'), DEFAULT_AVATAR);
});
afterAll(() => db.close());

describe('staked duel escrow', () => {
  it('takes both stakes in one go', async () => {
    await setCoins(a.id, 1000);
    await setCoins(b.id, 1000);
    expect(await repo.escrowDuel(a.id, b.id, 250)).toEqual({ ok: true, coins: [750, 750] });
    expect(await repo.coins(a.id)).toBe(750);
    expect(await repo.coins(b.id)).toBe(750);
  });

  it('charges nobody when the second player is short (rollback)', async () => {
    await setCoins(a.id, 500);
    await setCoins(b.id, 40);
    expect(await repo.escrowDuel(a.id, b.id, 50)).toEqual({ ok: false, short: 'b' });
    expect(await repo.coins(a.id)).toBe(500);
    expect(await repo.coins(b.id)).toBe(40);
  });

  it('charges nobody when the first player is short', async () => {
    await setCoins(a.id, 10);
    await setCoins(b.id, 500);
    expect(await repo.escrowDuel(a.id, b.id, 25)).toEqual({ ok: false, short: 'a' });
    expect(await repo.coins(a.id)).toBe(10);
    expect(await repo.coins(b.id)).toBe(500);
  });

  it('refuses a non-positive stake', async () => {
    await expect(repo.escrowDuel(a.id, b.id, 0)).rejects.toThrow();
  });
});

describe('duel settlement', () => {
  it('credits the winner the pot and logs the duel', async () => {
    await setCoins(a.id, 950);
    await setCoins(b.id, 950);
    const coins = await repo.settleDuel({
      aId: a.id,
      bId: b.id,
      stake: 50,
      credits: [{ userId: a.id, amount: 100 }],
      winnerId: a.id,
      outcome: 'win',
      roomId: 'gameden',
      log: true,
    });
    expect(coins).toEqual({ [a.id]: 1050 });
    expect(await repo.coins(b.id)).toBe(950);
    const rows = await db.query('select a_id, b_id, stake, winner_id, outcome, room_id from duels order by id desc limit 1');
    expect(rows[0]).toEqual({ a_id: a.id, b_id: b.id, stake: 50, winner_id: a.id, outcome: 'win', room_id: 'gameden' });
  });

  it('a draw refunds both stakes with no winner', async () => {
    await setCoins(a.id, 400);
    await setCoins(b.id, 300);
    const coins = await repo.settleDuel({
      aId: a.id,
      bId: b.id,
      stake: 100,
      credits: [
        { userId: a.id, amount: 100 },
        { userId: b.id, amount: 100 },
      ],
      winnerId: null,
      outcome: 'draw',
      roomId: 'gameden',
      log: true,
    });
    expect(coins).toEqual({ [a.id]: 500, [b.id]: 400 });
    const rows = await db.query<{ winner_id: string | null; outcome: string }>('select winner_id, outcome from duels order by id desc limit 1');
    expect(rows[0]).toEqual({ winner_id: null, outcome: 'draw' });
  });

  it('a free duel pays the reward without a log row', async () => {
    await setCoins(b.id, 100);
    const before = await duelRows();
    expect(
      await repo.settleDuel({ aId: a.id, bId: b.id, stake: 0, credits: [{ userId: b.id, amount: 25 }], winnerId: b.id, outcome: 'win', roomId: 'gameden', log: false }),
    ).toEqual({ [b.id]: 125 });
    expect(await duelRows()).toBe(before);
  });

  it('escrow then payout nets the winner +stake and the loser -stake', async () => {
    await setCoins(a.id, 1500);
    await setCoins(b.id, 1500);
    expect((await repo.escrowDuel(a.id, b.id, 50)).ok).toBe(true);
    await repo.settleDuel({ aId: a.id, bId: b.id, stake: 50, credits: [{ userId: b.id, amount: 100 }], winnerId: b.id, outcome: 'forfeit', roomId: 'gameden', log: true });
    expect(await repo.coins(a.id)).toBe(1450);
    expect(await repo.coins(b.id)).toBe(1550);
  });

  it('a failed log insert rolls the payout back', async () => {
    await setCoins(a.id, 100);
    const before = await duelRows();
    await expect(
      repo.settleDuel({ aId: a.id, bId: 'no-such-user', stake: 50, credits: [{ userId: a.id, amount: 100 }], winnerId: a.id, outcome: 'win', roomId: 'gameden', log: true }),
    ).rejects.toThrow();
    expect(await repo.coins(a.id)).toBe(100);
    expect(await duelRows()).toBe(before);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @dovey/server exec vitest run src/repo.duel.test.ts`
Expected: FAIL with `repo.escrowDuel is not a function` and `relation "duels" does not exist`.

- [ ] **Step 3: Add the `duels` table to SCHEMA in `server/src/db.ts`**

Inside the `const SCHEMA = \`...\`` template, find the line:
```sql
create index if not exists rolls_room_at on rolls(room_id, at);
```
Directly after it, still inside the template and before the closing backtick, add:
```sql
create table if not exists duels (
  id serial primary key,
  a_id text not null references users(id),
  b_id text not null references users(id),
  stake int not null,
  winner_id text references users(id),
  outcome text not null,
  room_id text,
  at timestamptz not null default now()
);
create index if not exists duels_at on duels(at);
```
If the trading session has already appended tables after `rolls_room_at`, add these statements after the last statement in SCHEMA instead.

- [ ] **Step 4: Add the repo methods in `server/src/repo.ts`**

After `export interface RoomSummary { … }` (ends with `createdAt: string;\n}`), add:
```ts
export interface DuelSettleInput {
  aId: string;
  bId: string;
  stake: number;
  credits: Array<{ userId: string; amount: number }>;
  winnerId: string | null;
  outcome: 'win' | 'draw' | 'forfeit' | 'left';
  roomId: string;
  /** write a duels log row */
  log: boolean;
}

/** Thrown inside the escrow transaction to roll it back when a side is short. */
class ShortStake extends Error {
  constructor(readonly side: 'a' | 'b') {
    super('short_stake');
  }
}
```

Inside `class Repo`, directly after the `recordRoll(...)` / `pruneRolls(...)` methods (before `async room(slug: string)`), add:
```ts
  // ---- duels

  /**
   * Take both duel stakes into escrow in one transaction. When either side
   * cannot cover the stake nothing is debited and `short` names who came up short.
   */
  async escrowDuel(aId: string, bId: string, stake: number): Promise<{ ok: true; coins: [number, number] } | { ok: false; short: 'a' | 'b' }> {
    if (!Number.isInteger(stake) || stake <= 0) throw new Error('escrowDuel needs a positive integer stake');
    try {
      return await this.db.transaction(async (tx) => {
        const r = new Repo(tx);
        const ca = await r.spendCoins(aId, stake);
        if (ca === null) throw new ShortStake('a');
        const cb = await r.spendCoins(bId, stake);
        if (cb === null) throw new ShortStake('b');
        return { ok: true as const, coins: [ca, cb] as [number, number] };
      });
    } catch (e) {
      if (e instanceof ShortStake) return { ok: false, short: e.side };
      throw e;
    }
  }

  /**
   * Pay out a finished duel in one transaction: every credit plus, for a staked
   * duel, its log row. Returns each credited user's new balance.
   */
  async settleDuel(s: DuelSettleInput): Promise<Record<string, number>> {
    return this.db.transaction(async (tx) => {
      const r = new Repo(tx);
      const coins: Record<string, number> = {};
      for (const c of s.credits) coins[c.userId] = await r.creditCoins(c.userId, c.amount);
      if (s.log) {
        await tx.query('insert into duels (a_id, b_id, stake, winner_id, outcome, room_id) values ($1, $2, $3, $4, $5, $6)', [
          s.aId,
          s.bId,
          s.stake,
          s.winnerId,
          s.outcome,
          s.roomId,
        ]);
      }
      return coins;
    });
  }
```

- [ ] **Step 5: Run tests and types**

Run: `pnpm --filter @dovey/server exec vitest run src/repo.duel.test.ts`
Expected: `Tests  9 passed (9)`

Run: `pnpm --filter @dovey/server test && pnpm --filter @dovey/server typecheck`
Expected: all server test files pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/repo.ts server/src/repo.duel.test.ts
git commit -F - <<'MSG'
feat(server): duels log table, transactional stake escrow and payout

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

## Task 5: Wire stakes into `GameRoom`

**Files:**
- Modify: `server/src/GameRoom.ts`

**Interfaces:**
- Consumes:
  - `isDuelStake` (Task 2)
  - `Duel`, `DuelBook`, `Pick`, `RoundResult`, `Settlement`, `duelSettlement` from `./duel` (Task 3)
  - `Repo#coins`, `Repo#escrowDuel`, `Repo#settleDuel` (Task 4)
- Produces (wire protocol; the client relies on it in Task 6):
  - `duel_incoming {from, handle, stake}`
  - `duel_ringing {to, stake}`
  - `duel_start {peer, handle, you, stake}`
  - `duel_round {winner, picks, score, done, stake, pot}`
  - `duel_end {reason: 'declined'|'insufficient'|'failed'|'forfeit'|'left', pot}`
  - `sys` codes `bot_no_stake`, `not_enough_coins`
  - `coins {coins, earned}` after escrow (`earned: 0`) and after payout (`earned: amount`)
- Private methods:
  - `sendRound(d: Duel, r: RoundResult): void`
  - `payDuel(d: Duel, s: Settlement): void`
  - `quitDuel(id: string, kind: 'forfeit' | 'left'): void`

There is no room-level unit test harness in this repo; Task 15's smoke script is the end-to-end test for this task. This task is verified by typecheck plus the existing suites.

**Do not touch** the `bots` import line or `spawnBots` (another session's work). `this.bots?.has(...)` calls stay as they are.

- [ ] **Step 1: Update imports**

Replace:
```ts
import { DUEL_REWARD, DuelBook, Pick } from './duel';
```
with:
```ts
import { Duel, DuelBook, Pick, RoundResult, Settlement, duelSettlement } from './duel';
import { isDuelStake } from '@dovey/shared';
```

- [ ] **Step 2: Sweep calls the new `sendRound` signature**

Replace:
```ts
      for (const { duel, result } of this.duels.sweep()) this.sendRound(duel.a, duel.b, result);
```
with:
```ts
      for (const { duel, result } of this.duels.sweep()) this.sendRound(duel, result);
```

- [ ] **Step 3: Replace the duel handlers**

Replace the whole block from the comment `// ---- duels: rock-paper-scissors, best of three, winner earns coins` down to and including the `duel_end` handler:
```ts
    this.onMessage('duel_end', (client) => {
      const peer = this.duels.end(client.sessionId);
      if (peer) sendTo(peer, 'duel_end', { reason: 'left' });
    });
```
with:
```ts
    // ---- duels: rock-paper-scissors, best of three, for a coin stake (or the free 25-coin reward)
    const sendTo = (id: string, type: string, data: unknown) => this.clients.find((c) => c.sessionId === id)?.send(type, data);
    this.onMessage('duel_invite', async (client, msg: { to?: unknown; stake?: unknown }) => {
      const to = typeof msg?.to === 'string' ? msg.to : '';
      const stake = msg?.stake === undefined ? 0 : msg.stake;
      const me = this.state.players.get(client.sessionId);
      const u = client.auth as User | undefined;
      if (!me || !u || !this.state.players.has(to)) return this.reject(client, 'no_such_player');
      if (!isDuelStake(stake)) return this.reject(client, 'bad_request');
      if (!this.duelLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const bot = !!this.bots?.has(to);
      // locals play for fun only
      if (bot && stake > 0) return this.reject(client, 'bot_no_stake');
      if (stake > 0 && (await GameRoom.repo.coins(u.id)) < stake) return this.reject(client, 'not_enough_coins');
      // either side may have left while the balance was read
      if (!this.state.players.has(client.sessionId)) return;
      if (!this.state.players.has(to)) return this.reject(client, 'no_such_player');
      const err = this.duels.invite(client.sessionId, to, stake);
      if (err) return this.reject(client, err);
      if (bot) {
        // locals never say no to a free duel
        this.clock.setTimeout(() => {
          const d = this.duels.accept(to);
          if (!d) return;
          d.users = [u.id, this.state.players.get(to)?.userId ?? ''];
          client.send('duel_start', { peer: to, handle: this.state.players.get(to)?.handle ?? '', you: 'a', stake: 0 });
          this.botPick(to);
        }, 1500);
        client.send('duel_ringing', { to, stake });
        return;
      }
      sendTo(to, 'duel_incoming', { from: client.sessionId, handle: me.handle, stake });
      client.send('duel_ringing', { to, stake });
    });
    this.onMessage('duel_accept', async (client) => {
      const d = this.duels.accept(client.sessionId);
      if (!d) return this.reject(client, 'no_invite');
      d.users = [this.state.players.get(d.a)?.userId ?? '', this.state.players.get(d.b)?.userId ?? ''];
      if (d.stake > 0) {
        let r: Awaited<ReturnType<Repo['escrowDuel']>> | null = null;
        try {
          r = await GameRoom.repo.escrowDuel(d.users[0], d.users[1], d.stake);
        } catch (e) {
          console.error('[duel] escrow', e);
        }
        if (this.duels.get(d.a) !== d) {
          // someone left while the stakes were moving: hand them straight back
          if (r?.ok) {
            void GameRoom.repo
              .settleDuel({
                aId: d.users[0],
                bId: d.users[1],
                stake: d.stake,
                credits: [
                  { userId: d.users[0], amount: d.stake },
                  { userId: d.users[1], amount: d.stake },
                ],
                winnerId: null,
                outcome: 'left',
                roomId: this.state.slug,
                log: false,
              })
              .catch((e) => console.error('[duel] refund', e));
          }
          return;
        }
        if (!r?.ok) {
          this.duels.end(d.a);
          const reason = r ? 'insufficient' : 'failed';
          for (const id of [d.a, d.b]) sendTo(id, 'duel_end', { reason, pot: 0 });
          return;
        }
        d.paid = true;
        sendTo(d.a, 'coins', { coins: r.coins[0], earned: 0 });
        sendTo(d.b, 'coins', { coins: r.coins[1], earned: 0 });
      }
      const pa = this.state.players.get(d.a);
      const pb = this.state.players.get(d.b);
      sendTo(d.a, 'duel_start', { peer: d.b, handle: pb?.handle ?? '', you: 'a', stake: d.stake });
      sendTo(d.b, 'duel_start', { peer: d.a, handle: pa?.handle ?? '', you: 'b', stake: d.stake });
      this.broadcast('emote', { id: d.a, i: 0 });
    });
    this.onMessage('duel_decline', (client) => {
      const from = this.duels.decline(client.sessionId);
      if (from) sendTo(from, 'duel_end', { reason: 'declined', pot: 0 });
    });
    this.onMessage('duel_pick', (client, msg: { pick?: unknown }) => {
      const p = Number(msg?.pick);
      if (![0, 1, 2].includes(p)) return;
      const d = this.duels.get(client.sessionId);
      if (!d) return this.reject(client, 'no_duel');
      const r = this.duels.pick(client.sessionId, p as Pick);
      if (r === 'waiting') return sendTo(client.sessionId, 'duel_wait', {});
      if (r) this.sendRound(d, r);
    });
    this.onMessage('duel_end', (client) => this.quitDuel(client.sessionId, 'forfeit'));
```

- [ ] **Step 4: Replace `sendRound` and add `payDuel` / `quitDuel`**

Replace the whole method:
```ts
  /** Push a resolved round to both sides; pays the winner when the duel is over. */
  private sendRound(a: string, b: string, r: { winner: 'a' | 'b' | 'draw'; picks: [number, number]; score: [number, number]; done: boolean }) {
```
…through its closing `this.broadcast('duel_over', { a, b, winner });\n  }` with:
```ts
  /** Push a resolved round to both sides; settles the coins when the duel is over. */
  private sendRound(d: Duel, r: RoundResult) {
    const { a, b } = d;
    const payload = { winner: r.winner, picks: r.picks, score: r.score, done: r.done, stake: d.stake, pot: d.stake * 2 };
    for (const id of [a, b]) this.clients.find((c) => c.sessionId === id)?.send('duel_round', payload);
    if (!r.done) {
      for (const id of [a, b]) if (this.bots?.has(id)) this.botPick(id);
      return;
    }
    const bot = [a, b].find((id) => this.bots?.has(id));
    if (bot) {
      const botWon = bot === a ? r.score[0] > r.score[1] : r.score[1] > r.score[0];
      this.clock.setTimeout(() => this.broadcast('chat', { id: bot, text: botWon ? 'gg ez 😎' : 'gg, rematch later!' }), 1200);
    }
    const s = duelSettlement(d, { kind: 'done', score: r.score });
    this.payDuel(d, s);
    const winner = s.winner === 'a' ? a : s.winner === 'b' ? b : null;
    this.broadcast('duel_over', { a, b, winner });
  }

  /** Move the coins a settlement calls for (never to a local) and tell whoever is still here their balance. */
  private payDuel(d: Duel, s: Settlement) {
    const credits = s.credits
      .map((c) => {
        const i = c.side === 'a' ? 0 : 1;
        return { sessionId: i === 0 ? d.a : d.b, userId: d.users[i], amount: c.amount };
      })
      .filter((c) => c.userId && !this.bots?.has(c.sessionId));
    if (!credits.length && !s.log) return;
    const winnerId = s.winner === 'a' ? d.users[0] : s.winner === 'b' ? d.users[1] : null;
    void GameRoom.repo
      .settleDuel({
        aId: d.users[0],
        bId: d.users[1],
        stake: d.stake,
        credits: credits.map(({ userId, amount }) => ({ userId, amount })),
        winnerId: winnerId || null,
        outcome: s.outcome,
        roomId: this.state.slug,
        log: s.log,
      })
      .then((coins) => {
        for (const c of credits) this.clientOf(c.sessionId)?.send('coins', { coins: coins[c.userId], earned: c.amount });
      })
      .catch((e) => console.error('[duel] settle', e));
  }

  /** Someone walks out of a duel (or a pending invite): the other side hears it and, in a staked duel, takes the pot. */
  private quitDuel(id: string, kind: 'forfeit' | 'left') {
    const d = this.duels.get(id);
    const side = this.duels.sideOf(id);
    const peer = this.duels.end(id);
    if (!peer) return;
    const s = d && side ? duelSettlement(d, { kind, quitter: side }) : null;
    const pot = s?.credits.reduce((sum, c) => (c.side !== side ? sum + c.amount : sum), 0) ?? 0;
    this.clientOf(peer)?.send('duel_end', { reason: kind, pot });
    if (d && s) this.payDuel(d, s);
  }
```

- [ ] **Step 5: Bot picks use the new signature**

In `private botPick(id: string)`, replace:
```ts
      if (r && r !== 'waiting') this.sendRound(d.a, d.b, r);
```
with:
```ts
      if (r && r !== 'waiting') this.sendRound(d, r);
```

- [ ] **Step 6: Leaving settles like a forfeit**

In `onLeave(client: Client)`, replace:
```ts
    const duelPeer = this.duels.end(client.sessionId);
    if (duelPeer) this.clients.find((c) => c.sessionId === duelPeer)?.send('duel_end', { reason: 'left' });
```
with:
```ts
    // before the player is removed from state, so the settlement still knows both accounts
    this.quitDuel(client.sessionId, 'left');
```

- [ ] **Step 7: Types and suites**

Run: `pnpm --filter @dovey/server typecheck`
Expected: no output. If `Repo` is reported as a type-only import issue for `Repo['escrowDuel']`, it is already imported as a value (`import { Repo, User } from './repo'`); no change is needed.

Run: `grep -n "DUEL_REWARD\|sendRound(d.a\|sendRound(duel.a" server/src/GameRoom.ts`
Expected: no output.

Run: `pnpm --filter @dovey/server test`
Expected: all server test files pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/GameRoom.ts
git commit -F - <<'MSG'
feat(server): staked duel invites, escrow on accept, pot payout on win/forfeit/leave

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```

---

Continue with `docs/superpowers/plans/2026-09-14-duel-hd-part3.md`.
