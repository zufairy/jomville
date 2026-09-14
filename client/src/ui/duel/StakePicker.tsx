import { useState } from 'react';
import { DUEL_REWARD, DuelStake } from '@dovey/shared';
import { stakeChoices } from './stakes';
import './duel.css';

/** Small vector coin used by the picker, HUD and result screen. */
export function CoinGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8.5" fill="#f5c542" stroke="#9c6b12" strokeWidth="2" />
      <circle cx="10" cy="10" r="4.6" fill="none" stroke="#9c6b12" strokeWidth="1.5" opacity="0.7" />
      <rect x="6" y="5" width="2" height="4" rx="1" fill="#fff" opacity="0.75" />
    </svg>
  );
}

export interface StakePickerProps {
  handle: string;
  /** your coins; null while unknown */
  balance: number | null;
  /** the target is a lobby local: free duels only */
  bot: boolean;
  onSend: (stake: DuelStake) => void;
  onBack: () => void;
}

/** Choose what to put on a duel before sending the challenge. */
export function StakePicker({ handle, balance, bot, onSend, onBack }: StakePickerProps) {
  const [stake, setStake] = useState<DuelStake>(0);
  const choices = stakeChoices(balance, { bot });
  // a balance that dropped since the chip was chosen falls back to a free duel
  const sendable = choices.find((c) => c.stake === stake)?.enabled ? stake : 0;

  return (
    <div className="dhd-stake">
      <div className="profile__head">
        <span className="profile__name">duel {handle}</span>
        <button className="btn" onClick={onBack}>
          back
        </button>
      </div>
      <p className="dhd-stake__note">{bot ? 'locals duel for fun: no stakes' : 'you both put in the stake. winner takes the pot.'}</p>
      <div className="dhd-stake__chips" role="radiogroup" aria-label="stake">
        {choices.map((c) => (
          <button
            key={c.stake}
            role="radio"
            aria-checked={sendable === c.stake}
            className={`dhd-chip ${sendable === c.stake ? 'dhd-chip--on' : ''}`}
            disabled={!c.enabled}
            title={c.blocked === 'coins' ? 'not enough coins' : c.blocked === 'bot' ? 'locals duel for free' : undefined}
            onClick={() => setStake(c.stake)}
          >
            {c.stake === 0 ? (
              'free'
            ) : (
              <>
                <CoinGlyph className="dhd-coin" />
                {c.stake}
              </>
            )}
          </button>
        ))}
      </div>
      <div className="dhd-stake__pot">
        <span>{sendable === 0 ? `winner earns ${DUEL_REWARD} coins` : `pot ${sendable * 2} coins`}</span>
        {balance !== null && <span className="dhd-stake__bal">you have {balance}</span>}
      </div>
      <button className="btn btn--duel dhd-stake__send" onClick={() => onSend(sendable)}>
        send challenge
      </button>
    </div>
  );
}
