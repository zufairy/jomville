import { useEffect } from 'react';
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
  // temporary until the arena lands (Task 14): advance after a fixed pause
  useEffect(() => {
    if (duel.phase !== 'reveal') return;
    const t = setTimeout(() => actions?.duelRevealDone(), 1600);
    return () => clearTimeout(t);
  }, [duel.phase, duel.round, actions]);
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
