/**
 * Rock-paper-scissors duels between two people in the same room.
 * Best of 3, optionally for a coin stake. Pure state machine; GameRoom does the
 * messaging and moves the coins that duelSettlement() calls for.
 */
import { DUEL_MAX_ROUNDS, DUEL_PICK_MS, DuelStake, duelPrize } from '@dovey/shared';

export { DUEL_REWARD } from '@dovey/shared';

export type Pick = 0 | 1 | 2; // rock, paper, scissors
export const PICK_NAMES = ['rock', 'paper', 'scissors'] as const;
const INVITE_TTL_MS = 30_000;
const WIN_AT = 2;

export type Side = 'a' | 'b';

export interface Duel {
  a: string;
  b: string;
  /** coins each side puts in; 0 = free duel */
  stake: DuelStake;
  /** both stakes are in escrow (never true for a free duel) */
  paid: boolean;
  /** account ids for a and b, filled in by the room at accept */
  users: [string, string];
  score: [number, number];
  picks: [Pick | null, Pick | null];
  round: number;
  deadline: number;
}

export type RoundResult = { winner: 'a' | 'b' | 'draw'; picks: [Pick, Pick]; score: [number, number]; done: boolean };

export type DuelEnd = { kind: 'done'; score: [number, number] } | { kind: 'forfeit' | 'left'; quitter: Side };
export type DuelOutcome = 'win' | 'draw' | 'forfeit' | 'left';
export interface Settlement {
  outcome: DuelOutcome;
  winner: Side | null;
  /** coins to credit, per side */
  credits: Array<{ side: Side; amount: number }>;
  /** write a duels log row (staked duels whose stakes were escrowed) */
  log: boolean;
}

/** 0 draw, 1 = first wins, -1 = second wins */
export function beats(x: Pick, y: Pick): number {
  if (x === y) return 0;
  return (x - y + 3) % 3 === 1 ? 1 : -1;
}

/**
 * Who gets what when a duel ends. A win pays the pot (or the free reward); a tie
 * at the round cap refunds both stakes; a walkout hands the pot to whoever stayed.
 * Stakes that never reached escrow move nothing.
 */
export function duelSettlement(d: { stake: DuelStake; paid: boolean }, end: DuelEnd): Settlement {
  const staked = d.stake > 0 && d.paid;
  const unpaid = d.stake > 0 && !d.paid;
  if (end.kind === 'done') {
    const [sa, sb] = end.score;
    if (sa === sb) {
      const credits: Settlement['credits'] = staked
        ? [
            { side: 'a', amount: d.stake },
            { side: 'b', amount: d.stake },
          ]
        : [];
      return { outcome: 'draw', winner: null, credits, log: staked };
    }
    const winner: Side = sa > sb ? 'a' : 'b';
    return { outcome: 'win', winner, credits: unpaid ? [] : [{ side: winner, amount: duelPrize(d.stake) }], log: staked };
  }
  const winner: Side = end.quitter === 'a' ? 'b' : 'a';
  return { outcome: end.kind, winner, credits: staked ? [{ side: winner, amount: d.stake * 2 }] : [], log: staked };
}

export class DuelBook {
  private invites = new Map<string, { from: string; at: number; stake: DuelStake }>(); // keyed by invitee
  private duels = new Map<string, Duel>(); // keyed by both session ids
  constructor(private now: () => number = Date.now) {}

  invite(from: string, to: string, stake: DuelStake = 0): string | null {
    if (from === to) return 'bad_request';
    if (this.duels.has(from) || this.duels.has(to)) return 'busy';
    const cur = this.invites.get(to);
    if (cur && cur.from !== from && this.now() - cur.at < INVITE_TTL_MS) return 'busy_peer';
    this.invites.set(to, { from, at: this.now(), stake });
    return null;
  }

  /** The live invite waiting on `to`, if any. */
  pending(to: string): { from: string; stake: DuelStake } | null {
    const inv = this.invites.get(to);
    if (!inv || this.now() - inv.at > INVITE_TTL_MS) return null;
    return { from: inv.from, stake: inv.stake };
  }

  accept(to: string): Duel | null {
    const inv = this.invites.get(to);
    if (!inv || this.now() - inv.at > INVITE_TTL_MS) {
      this.invites.delete(to);
      return null;
    }
    this.invites.delete(to);
    if (this.duels.has(inv.from) || this.duels.has(to)) return null;
    const d: Duel = {
      a: inv.from,
      b: to,
      stake: inv.stake,
      paid: false,
      users: ['', ''],
      score: [0, 0],
      picks: [null, null],
      round: 1,
      deadline: this.now() + DUEL_PICK_MS,
    };
    this.duels.set(d.a, d);
    this.duels.set(d.b, d);
    return d;
  }

  decline(to: string): string | null {
    const inv = this.invites.get(to);
    this.invites.delete(to);
    return inv?.from ?? null;
  }

  get(id: string): Duel | undefined {
    return this.duels.get(id);
  }

  sideOf(id: string): Side | null {
    const d = this.duels.get(id);
    if (!d) return null;
    return d.a === id ? 'a' : 'b';
  }

  /** Records a pick; when both are in, resolves the round. */
  pick(id: string, p: Pick): RoundResult | 'waiting' | null {
    const d = this.duels.get(id);
    if (!d) return null;
    const i = d.a === id ? 0 : 1;
    if (d.picks[i] !== null) return 'waiting';
    d.picks[i] = p;
    if (d.picks[0] === null || d.picks[1] === null) return 'waiting';
    const picks: [Pick, Pick] = [d.picks[0], d.picks[1]];
    const r = beats(picks[0], picks[1]);
    if (r === 1) d.score[0]++;
    if (r === -1) d.score[1]++;
    d.picks = [null, null];
    d.round++;
    d.deadline = this.now() + DUEL_PICK_MS;
    const done = d.score[0] >= WIN_AT || d.score[1] >= WIN_AT || d.round > DUEL_MAX_ROUNDS;
    const out: RoundResult = { winner: r === 0 ? 'draw' : r === 1 ? 'a' : 'b', picks, score: [d.score[0], d.score[1]], done };
    if (done) this.end(id);
    return out;
  }

  /** Remove a duel; returns the other participant, if any. */
  end(id: string): string | null {
    const d = this.duels.get(id);
    this.invites.delete(id);
    if (!d) return null;
    this.duels.delete(d.a);
    this.duels.delete(d.b);
    return d.a === id ? d.b : d.a;
  }

  /** Duels whose pick timer ran out: the slow side forfeits the round. */
  sweep(): Array<{ duel: Duel; result: RoundResult }> {
    const out: Array<{ duel: Duel; result: RoundResult }> = [];
    const seen = new Set<Duel>();
    for (const d of this.duels.values()) {
      if (seen.has(d) || this.now() < d.deadline) continue;
      seen.add(d);
      // whoever hasn't picked loses the round; both idle -> draw
      const ap = d.picks[0];
      const bp = d.picks[1];
      const r = ap !== null && bp === null ? 1 : bp !== null && ap === null ? -1 : 0;
      if (r === 1) d.score[0]++;
      if (r === -1) d.score[1]++;
      const picks: [Pick, Pick] = [ap ?? 0, bp ?? 0];
      d.picks = [null, null];
      d.round++;
      d.deadline = this.now() + DUEL_PICK_MS;
      const done = d.score[0] >= WIN_AT || d.score[1] >= WIN_AT || d.round > DUEL_MAX_ROUNDS;
      out.push({ duel: d, result: { winner: r === 0 ? 'draw' : r === 1 ? 'a' : 'b', picks, score: [d.score[0], d.score[1]], done } });
      if (done) this.end(d.a);
    }
    return out;
  }
}
