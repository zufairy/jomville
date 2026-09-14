import { useState } from 'react';
import { REPORT_NOTE_MAX, REPORT_REASONS, ReportReason } from '@dovey/shared';
import { useAppStore } from '../store';
import { useRoster } from '../roster';
import { friends, useFriends } from '../friends';

/** Tap-on-avatar popover: who they are, what you can do with them, and how to get away from them. */
export function ProfileSheet() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const actions = useAppStore((s) => s.actions);
  const call = useAppStore((s) => s.call);
  const duel = useAppStore((s) => s.duel);
  const muted = useAppStore((s) => s.muted);
  const blocked = useAppStore((s) => s.blocked);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
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
      <div className="sheet profile" role="dialog" aria-label={`report ${handle}`}>
        <div className="profile__head">
          <span className="profile__name">report {handle}</span>
          <button className="btn" onClick={() => setReporting(false)}>
            back
          </button>
        </div>
        <p className="profile__note">what happened? a moderator reads every report.</p>
        <div className="reasons">
          {REPORT_REASONS.map((r) => (
            <button key={r.id} className={`reason ${reason === r.id ? 'reason--on' : ''}`} onClick={() => setReason(r.id)}>
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
          <button className="btn btn--danger" disabled={!reason} onClick={sendReport}>
            send report
          </button>
          <button
            className="btn btn--danger"
            disabled={!reason}
            onClick={() => {
              actions?.block(sessionId, true);
              sendReport();
            }}
          >
            report and block
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet profile" role="dialog" aria-label={handle}>
      <div className="profile__head">
        <span className="profile__name">{handle}</span>
        <button className="btn" onClick={close}>
          close
        </button>
      </div>

      {isBlocked ? (
        <p className="profile__blocked">blocked. they cannot see your messages or call you.</p>
      ) : (
        <>
          {userId && !userId.startsWith('bot:') && sessionId !== mySession && (
            <div className="profile__actions">
              {friendState === 'friends' ? (
                <button className="btn" disabled>
                  👥 friends ✓
                </button>
              ) : friendState === 'sent' ? (
                <button className="btn" disabled>
                  👥 requested…
                </button>
              ) : friendState === 'incoming' ? (
                <button className="btn btn--primary" onClick={() => void friends.respond(userId, true)}>
                  👥 accept friend request
                </button>
              ) : (
                <button className="btn btn--primary" onClick={() => void friends.request(userId)}>
                  👥 add friend
                </button>
              )}
            </div>
          )}
          <div className="profile__actions">
            <button className="btn btn--primary" disabled={busy} onClick={() => start(false)}>
              🎙 voice call
            </button>
            <button className="btn btn--primary" disabled={busy} onClick={() => start(true)}>
              📹 video call
            </button>
          </div>
          <div className="profile__actions">
            <button
              className="btn btn--duel"
              disabled={duel.phase !== 'idle'}
              onClick={() => {
                actions?.duelInvite(sessionId, handle, 0);
                close();
              }}
            >
              ⚔️ challenge to a duel
            </button>
          </div>
        </>
      )}

      <div className="profile__safety">
        <button className={`safety ${isMuted ? 'safety--on' : ''}`} onClick={() => useAppStore.getState().toggleMute(sessionId)}>
          {isMuted ? '🔈 unmute' : '🔇 mute'}
        </button>
        <button className="safety" onClick={() => actions?.block(sessionId, !isBlocked)}>
          {isBlocked ? '↩️ unblock' : '🚫 block'}
        </button>
        <button className="safety safety--report" onClick={() => setReporting(true)}>
          🚩 report
        </button>
      </div>
      <p className="profile__note">
        mute hides their messages for you. block also stops calls, both ways. reports go to a human.
      </p>
    </div>
  );
}
