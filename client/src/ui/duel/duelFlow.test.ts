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
