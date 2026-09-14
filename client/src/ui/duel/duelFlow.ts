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
        : reason === 'cancelled'
          ? 'they cancelled the duel'
          : reason === 'failed'
            ? 'duel could not start, try again'
            : walkout
              ? 'they left the duel'
              : 'duel ended';
  return { duel: IDLE_DUEL, toast };
}
