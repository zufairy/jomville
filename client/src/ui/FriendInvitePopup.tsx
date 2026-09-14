import { useEffect, useMemo } from 'react';
import { parseAvatar } from '@dovey/shared';
import { useFriends } from '../friends';
import { goToRoom } from '../router';
import { useAppStore } from '../store';
import { AvatarPreview } from './AvatarPreview';
import './friends.css';

/** how long an unanswered invite stays up */
const INVITE_TTL_MS = 20_000;

/** A friend invited you to their room: Join takes you there, Later dismisses. One at a time. */
export function FriendInvitePopup() {
  const invite = useFriends((s) => s.invites[0]);
  const dismiss = useFriends((s) => s.dismissInvite);
  const here = useAppStore((s) => s.room?.slug);
  const cfg = useMemo(() => (invite ? parseAvatar(invite.from.avatar) : null), [invite]);

  useEffect(() => {
    if (!invite) return;
    const t = window.setTimeout(() => dismiss(invite.key), INVITE_TTL_MS);
    return () => clearTimeout(t);
  }, [invite, dismiss]);

  if (!invite || !cfg) return null;

  const join = () => {
    dismiss(invite.key);
    if (invite.room.slug === here) {
      useAppStore.getState().flash("you're already here");
      return;
    }
    goToRoom(invite.room.slug);
  };

  return (
    <div className="finvite" role="alertdialog" aria-label={`${invite.from.handle} invites you`}>
      <span className="friend__head">
        <AvatarPreview cfg={cfg} focus="head" scale={1.4} animate={false} fx={false} />
      </span>
      <div className="finvite__text">
        <b>{invite.from.handle}</b> invites you to <b>{invite.room.name}</b>
      </div>
      <div className="finvite__btns">
        <button className="btn btn--primary" onClick={join}>
          join
        </button>
        <button className="btn" onClick={() => dismiss(invite.key)}>
          later
        </button>
      </div>
    </div>
  );
}
