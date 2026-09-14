/**
 * Rock-paper-scissors duels between two people in the same room.
 * Best of 3. Pure state machine; GameRoom does the messaging.
 */
export type Pick = 0 | 1 | 2; // rock, paper, scissors
export const PICK_NAMES = ['rock', 'paper', 'scissors'] as const;
export const DUEL_REWARD = 25;
const INVITE_TTL_MS = 30_000;
const PICK_TTL_MS = 20_000;
const WIN_AT = 2;

export interface Duel {
  a: string;
  b: string;
  score: [number, number];
  picks: [Pick | null, Pick | null];
  round: number;
  deadline: number;
}

export type RoundResult = { winner: 'a' | 'b' | 'draw'; picks: [Pick, Pick]; score: [number, number]; done: boolean };

/** 0 draw, 1 = first wins, -1 = second wins */
export function beats(x: Pick, y: Pick): number {
  if (x === y) return 0;
  return (x - y + 3) % 3 === 1 ? 1 : -1;
}

export class DuelBook {
  private invites = new Map<string, { from: string; at: number }>(); // keyed by invitee
  private duels = new Map<string, Duel>(); // keyed by both session ids
  constructor(private now: () => number = Date.now) {}

  invite(from: string, to: string): string | null {
    if (from === to) return 'bad_request';
    if (this.duels.has(from) || this.duels.has(to)) return 'busy';
    const cur = this.invites.get(to);
    if (cur && cur.from !== from && this.now() - cur.at < INVITE_TTL_MS) return 'busy_peer';
    this.invites.set(to, { from, at: this.now() });
    return null;
  }

  accept(to: string): Duel | null {
    const inv = this.invites.get(to);
    if (!inv || this.now() - inv.at > INVITE_TTL_MS) {
      this.invites.delete(to);
      return null;
    }
    this.invites.delete(to);
    if (this.duels.has(inv.from) || this.duels.has(to)) return null;
    const d: Duel = { a: inv.from, b: to, score: [0, 0], picks: [null, null], round: 1, deadline: this.now() + PICK_TTL_MS };
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
    d.deadline = this.now() + PICK_TTL_MS;
    const done = d.score[0] >= WIN_AT || d.score[1] >= WIN_AT;
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
      d.deadline = this.now() + PICK_TTL_MS;
      const done = d.score[0] >= WIN_AT || d.score[1] >= WIN_AT || d.round > 6;
      out.push({ duel: d, result: { winner: r === 0 ? 'draw' : r === 1 ? 'a' : 'b', picks, score: [d.score[0], d.score[1]], done } });
      if (done) this.end(d.a);
    }
    return out;
  }
}
