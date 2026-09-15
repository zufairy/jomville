import { useState } from 'react';
import { REPORT_NOTE_MAX, REPORT_REASONS, ReportReason } from '@dovey/shared';
import { useAppStore } from '../store';
import { useRoster } from '../roster';
import { friends, useFriends } from '../friends';
import { StakePicker } from './duel/StakePicker';
import { isBotUser } from './duel/stakes';
import { trade, useTrade } from '../trade';
import './profile.css';

/** Tap-on-avatar popover: who they are, what you can do with them, and how to get away from them. */
export function ProfileSheet() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const actions = useAppStore((s) => s.actions);
  const call = useAppStore((s) => s.call);
  const duel = useAppStore((s) => s.duel);
  const tradePhase = useTrade((s) => s.phase);
  const muted = useAppStore((s) => s.muted);
  const blocked = useAppStore((s) => s.blocked);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [staking, setStaking] = useState(false);
  const coins = useAppStore((s) => s.coins);
  const mySession = useAppStore((s) => s.sessionId);
  const userId = useRoster((s) => (profile ? s.players[profile.sessionId]?.userId : undefined));
  const friendState = useFriends((s) =>
    !userId ? 'none' : s.friends.some((f) => f.id === userId) ? 'friends' : s.outgoing.some((r) => r.id === userId) ? 'sent' : s.incoming.some((r) => r.id === userId) ? 'incoming' : 'none',
  );

  if (!profile) return null;
  const { sessionId, handle } = profile;
  const isMuted = muted.includes(sessionId);
  const isBlocked = blocked.includes(sessionId);
  const busy = call.phase !== 'idle';
  const close = () => {
    setProfile(null);
    setReporting(false);
    setReason(null);
    setNote('');
    setStaking(false);
  };

  const start = (video: boolean) => {
    actions?.callInvite(sessionId, handle, video);
    close();
  };

  const sendReport = () => {
    if (!reason) return;
    actions?.report(sessionId, reason, note.trim() || undefined);
    close();
  };

  if (reporting) {
    return (
      <div className="sheet profile pf" role="dialog" aria-label={`report ${handle}`}>
        <div className="profile__head">
          <span className="profile__name">report {handle}</span>
          <button className="pf-btn pf-btn--sm" onClick={() => setReporting(false)}>
            ← Back
          </button>
        </div>
        <p className="profile__note">what happened? a moderator reads every report.</p>
        <div className="reasons">
          {REPORT_REASONS.map((r) => (
            <button key={r.id} className={`pf-chip ${reason === r.id ? 'pf-chip--on' : ''}`} aria-pressed={reason === r.id} onClick={() => setReason(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <input
          className="profile__note-input"
          placeholder="anything else? (optional)"
          maxLength={REPORT_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="extra detail"
        />
        <div className="profile__actions">
          <button className="pf-btn pf-btn--red" disabled={!reason} onClick={sendReport}>
            🚩 Send report
          </button>
          <button
            className="pf-btn pf-btn--red"
            disabled={!reason}
            onClick={() => {
              actions?.block(sessionId, true);
              sendReport();
            }}
          >
            🚫 Report and block
          </button>
        </div>
      </div>
    );
  }

  if (staking) {
    return (
      <div className="sheet profile pf" role="dialog" aria-label={`duel ${handle}`}>
        <StakePicker
          handle={handle}
          balance={coins}
          bot={isBotUser(userId)}
          onBack={() => setStaking(false)}
          onSend={(stake) => {
            actions?.duelInvite(sessionId, handle, stake);
            close();
          }}
        />
      </div>
    );
  }

  return (
    <div className="sheet profile pf" role="dialog" aria-label={handle}>
      <div className="profile__head">
        <span className="profile__name">{handle}</span>
      </div>

      {isBlocked ? (
        <p className="profile__blocked">blocked. they cannot see your messages or call you.</p>
      ) : (
        <>
          {userId && !userId.startsWith('bot:') && sessionId !== mySession && (
            <div className="profile__actions">
              {friendState === 'friends' ? (
                <button className="pf-btn pf-btn--soft pf-btn--full" disabled>
                  👥 Friends ✓
                </button>
              ) : friendState === 'sent' ? (
                <button className="pf-btn pf-btn--soft pf-btn--full" disabled>
                  👥 Requested…
                </button>
              ) : friendState === 'incoming' ? (
                <button className="pf-btn pf-btn--green pf-btn--full" onClick={() => void friends.respond(userId, true)}>
                  👥 Accept friend request
                </button>
              ) : (
                <button className="pf-btn pf-btn--green pf-btn--full" onClick={() => void friends.request(userId)}>
                  ➕ Add friend
                </button>
              )}
            </div>
          )}
          <div className="profile__actions">
            <button className="pf-btn pf-btn--blue" disabled={busy} onClick={() => start(false)}>
              🎙 Voice call
            </button>
            <button className="pf-btn pf-btn--blue" disabled={busy} onClick={() => start(true)}>
              📹 Video call
            </button>
          </div>
          <div className="profile__actions">
            <button
              className="pf-btn pf-btn--orange"
              disabled={duel.phase !== 'idle'}
              onClick={() => setStaking(true)}
            >
              ⚔️ Duel
            </button>
            {userId && !userId.startsWith('bot:') && (
              <button
                className="pf-btn pf-btn--purple"
                disabled={tradePhase !== 'idle'}
                onClick={() => {
                  trade.invite(sessionId, handle);
                  close();
                }}
              >
                🤝 Trade
              </button>
            )}
          </div>
        </>
      )}

      <div className="profile__safety">
        <button className={`pf-pill ${isMuted ? 'pf-pill--on' : ''}`} aria-pressed={isMuted} onClick={() => useAppStore.getState().toggleMute(sessionId)}>
          {isMuted ? '🔈 Unmute' : '🔇 Mute'}
        </button>
        <button className={`pf-pill ${isBlocked ? '' : 'pf-pill--danger'}`} onClick={() => actions?.block(sessionId, !isBlocked)}>
          {isBlocked ? '↩️ Unblock' : '🚫 Block'}
        </button>
        <button className="pf-pill pf-pill--danger" onClick={() => setReporting(true)}>
          🚩 Report
        </button>
      </div>
      <p className="profile__note">
        mute hides their messages for you. block also stops calls, both ways. reports go to a human.
      </p>
      <button className="pf-btn pf-close" onClick={close}>
        Close
      </button>
    </div>
  );
}
