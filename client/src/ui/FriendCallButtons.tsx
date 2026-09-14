import type { FriendView } from '../api';
import { friendCall, useFriendCall } from '../friendCall';
import { useFriends } from '../friends';
import { useAppStore } from '../store';
import './friend-call.css';

/** Voice/video call buttons on a friend row. Owned by the friend-calls feature, rendered inside d7's FriendsSheet. */
export function FriendCallButtons({ f }: { f: FriendView }) {
  const friendBusy = useFriendCall((s) => s.phase !== 'idle');
  const roomBusy = useAppStore((s) => s.call.phase !== 'idle');
  const busy = friendBusy || roomBusy;
  const start = (video: boolean) => {
    friendCall.invite({ id: f.id, handle: f.handle, avatar: f.avatar }, video);
    useFriends.getState().setOpen(false);
  };
  return (
    <span className="fcall-btns">
      <button className="btn" disabled={!f.online || busy} onClick={() => start(false)} aria-label={`voice call ${f.handle}`} title="voice call">
        🎙
      </button>
      <button className="btn" disabled={!f.online || busy} onClick={() => start(true)} aria-label={`video call ${f.handle}`} title="video call">
        📹
      </button>
    </span>
  );
}
