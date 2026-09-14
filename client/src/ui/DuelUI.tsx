import { useAppStore } from '../store';

const HANDS = ['✊', '✋', '✌️'];
const NAMES = ['rock', 'paper', 'scissors'];

/** Rock-paper-scissors duel popup: invite, pick, reveal, result. Best of three, winner earns coins. */
export function DuelUI() {
  const duel = useAppStore((s) => s.duel);
  const actions = useAppStore((s) => s.actions);
  if (duel.phase === 'idle') return null;
  const me = duel.you === 'a' ? 0 : 1;
  const them = 1 - me;
  const myScore = duel.score[me];
  const theirScore = duel.score[them];

  return (
    <div className="duel" role="dialog" aria-label="duel">
      <div className="duel__card">
        {duel.phase === 'ringing' && (
          <>
            <h2 className="duel__title">⚔️ challenging {duel.handle}…</h2>
            <p className="duel__sub">waiting for them to accept</p>
            <div className="duel__btns">
              <button className="btn" onClick={() => actions?.duelEnd()}>
                cancel
              </button>
            </div>
          </>
        )}
        {duel.phase === 'incoming' && (
          <>
            <h2 className="duel__title">⚔️ {duel.handle} challenges you!</h2>
            <p className="duel__sub">rock · paper · scissors, best of three. winner takes 25 coins.</p>
            <div className="duel__btns">
              <button className="btn btn--go" onClick={() => actions?.duelAccept()}>
                accept
              </button>
              <button className="btn" onClick={() => actions?.duelDecline()}>
                pass
              </button>
            </div>
          </>
        )}
        {(duel.phase === 'pick' || duel.phase === 'reveal' || duel.phase === 'over') && (
          <>
            <h2 className="duel__title">you vs {duel.handle}</h2>
            <div className="duel__score">
              <span>{myScore}</span>
              <span className="duel__vs">round {duel.round}</span>
              <span>{theirScore}</span>
            </div>
            {duel.phase === 'pick' && (
              <>
                <div className="duel__timer" key={duel.round}>
                  <i />
                </div>
                <p className="duel__sub">{duel.myPick === null ? 'pick your hand' : `you threw ${NAMES[duel.myPick]}… waiting for ${duel.handle}`}</p>
                <div className="duel__hands">
                  {HANDS.map((h, i) => (
                    <button
                      key={h}
                      className={`hand ${duel.myPick === i ? 'hand--on' : ''}`}
                      disabled={duel.myPick !== null}
                      onClick={() => actions?.duelPick(i as 0 | 1 | 2)}
                      aria-label={NAMES[i]}
                    >
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
                  <span className={duel.last.winner !== 'draw' && duel.last.winner !== duel.you ? 'win' : duel.last.winner === 'draw' ? '' : 'lose'}>
                    {HANDS[duel.last.picks[them]]}
                  </span>
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
            <div className="duel__btns">
              <button className="btn" onClick={() => actions?.duelEnd()}>
                {duel.phase === 'over' ? 'close' : 'forfeit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
