import { create } from 'zustand';
import { IDLE_CALL } from './call';
import { useAppStore } from './store';

/** A same-room call to a non-friend was refused until the caller confirms they are 18+. */
interface AdultGateStore {
  pending: { peer: string; handle: string; video: boolean } | null;
  close: () => void;
}

export const useAdultGate = create<AdultGateStore>((set) => ({
  pending: null,
  close: () => set({ pending: null }),
}));

export function onAdultRequired() {
  const st = useAppStore.getState();
  const c = st.call;
  if (c.phase === 'ringing_out') useAdultGate.setState({ pending: { peer: c.peer, handle: c.handle, video: c.video } });
  // nothing was connected yet (no peer connection before accept), so a plain reset is safe
  st.setCall(IDLE_CALL);
}
