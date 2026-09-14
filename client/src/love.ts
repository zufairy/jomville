import { create } from 'zustand';
import { LoveSide, LoveSnapshot, LoveVibe } from '@dovey/shared';
import { unlockAudio } from './call';

/**
 * Love Meter client state. Kept out of the main store: only the Love Meter
 * room ever receives these messages.
 */
interface LoveState {
  snap: LoveSnapshot | null;
  /** performance.now() when snap arrived; phase timers count down from here */
  at: number;
  set: (s: LoveSnapshot | null) => void;
}

export const useLove = create<LoveState>((set) => ({
  snap: null,
  at: 0,
  set: (snap) => set({ snap, at: performance.now() }),
}));

type Send = (type: string, data?: unknown) => void;
let send: Send | null = null;

export function bindLoveSender(fn: Send | null) {
  send = fn;
}

export const love = {
  join: (side: LoveSide) => {
    // runs inside the button tap: unlock audio now so the call's voice meter isn't silent later
    unlockAudio();
    send?.('love_join', { side });
  },
  leave: () => send?.('love_leave'),
  vibe: (v: LoveVibe) => send?.('love_vibe', v),
};

/** ms left in the current match phase */
export function loveLeft(): number {
  const { snap, at } = useLove.getState();
  return snap?.pair ? Math.max(0, snap.pair.left - (performance.now() - at)) : 0;
}
