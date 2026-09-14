import { create } from 'zustand';
import type { kitchen } from '@dovey/shared';
import type { KitchenView, OrderView } from './view';

export interface CrewInfo {
  pad: number;
  code: string;
  members: string[];
  names: string[];
  phase: 'open' | 'cooking';
}

export interface RoundResult {
  score: number;
  stars: number;
  served: number;
  failed: number;
  earned: number;
}

export type KitchenPhase = 'off' | 'joining' | 'playing' | 'results';

const DISH_NAMES: Record<kitchen.Dish, string> = {
  soup_tomato: 'tomato soup',
  soup_onion: 'onion soup',
  soup_mushroom: 'mushroom soup',
  salad: 'salad',
  salad_tomato: 'tomato salad',
};
export const dishName = (d: kitchen.Dish) => DISH_NAMES[d];

interface KitchenStore {
  crew: CrewInfo | null;
  phase: KitchenPhase;
  roomId: string | null;
  score: number;
  streak: number;
  time: number;
  timeAt: number;
  over: boolean;
  orders: OrderView[];
  lag: boolean;
  reconnecting: boolean;
  result: RoundResult | null;
  note: string | null;
  setCrew: (c: CrewInfo | null) => void;
  go: (roomId: string) => void;
  setPhase: (p: KitchenPhase) => void;
  setHud: (v: KitchenView) => void;
  setLag: (lag: boolean) => void;
  setReconnecting: (on: boolean) => void;
  setResult: (r: RoundResult) => void;
  onEvent: (e: kitchen.KitchenEvent, me: string) => void;
  lost: () => void;
  exit: () => void;
}

export const useKitchen = create<KitchenStore>((set, get) => ({
  crew: null,
  phase: 'off',
  roomId: null,
  score: 0,
  streak: 0,
  time: 0,
  timeAt: 0,
  over: false,
  orders: [],
  lag: false,
  reconnecting: false,
  result: null,
  note: null,
  setCrew: (crew) => set({ crew }),
  go: (roomId) =>
    set({ roomId, phase: 'joining', result: null, note: null, score: 0, streak: 0, orders: [], over: false, time: 0, timeAt: 0, lag: false, reconnecting: false }),
  setPhase: (phase) => set({ phase }),
  setHud: (v) => {
    const s = get();
    if (s.score === v.score && s.streak === v.streak && s.orders === v.orders && s.over === v.over && s.timeAt !== 0 && Math.abs(s.time - v.time) < 0.5) return;
    set({ score: v.score, streak: v.streak, orders: v.orders, over: v.over, time: v.time, timeAt: v.timeAt });
  },
  setLag: (lag) => {
    if (get().lag !== lag) set({ lag });
  },
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setResult: (result) => set({ result, phase: 'results' }),
  onEvent: (e, me) => {
    if (e.type === 'served') set({ note: `+${e.points} ${dishName(e.dish)}${e.streak > 1 ? ` · combo x${e.streak}` : ''}` });
    else if (e.type === 'expired') set({ note: `missed ${dishName(e.dish)}` });
    else if (e.type === 'burnt') set({ note: 'soup burnt! bin it' });
    else if (e.type === 'rejected' && e.chef === me) set({ note: 'nobody ordered that' });
  },
  lost: () => set({ phase: 'off', roomId: null, reconnecting: false, note: 'lost the kitchen' }),
  exit: () => set({ phase: 'off', roomId: null, result: null, reconnecting: false }),
}));
