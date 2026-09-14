import { create } from 'zustand';
import { AvatarConfig, Placement, RoomStyle, SLOTS, Slot, isOptionalSlot, isStarter, normalizeAvatar, parseAvatar, randomAvatar, serializeAvatar } from '@dovey/shared';
import { CallInfo, IDLE_CALL } from './call';

export type DuelPhase = 'idle' | 'ringing' | 'incoming' | 'pick' | 'reveal' | 'over';
export interface DuelInfo {
  phase: DuelPhase;
  peer: string;
  handle: string;
  /** which side am I in the server's book */
  you: 'a' | 'b';
  score: [number, number];
  round: number;
  myPick: 0 | 1 | 2 | null;
  last: { picks: [number, number]; winner: 'a' | 'b' | 'draw' } | null;
  won: boolean | null;
}
export const IDLE_DUEL: DuelInfo = { phase: 'idle', peer: '', handle: '', you: 'a', score: [0, 0], round: 1, myPick: null, last: null, won: null };
import type { Me } from './api';

const AVATAR_KEY = 'dovey.avatar';

function loadAvatar(): AvatarConfig {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (raw) return parseAvatar(raw);
  } catch {
    /* storage unavailable */
  }
  return randomAvatar();
}

function saveAvatar(c: AvatarConfig) {
  try {
    localStorage.setItem(AVATAR_KEY, serializeAvatar(c));
  } catch {
    /* ignore */
  }
}

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface GameActions {
  say: (text: string) => void;
  emote: (i: number) => void;
  setAvatar: (c: AvatarConfig) => void;
  setRoomMeta: (p: { name?: string; category?: string; style?: Partial<RoomStyle> }) => void;
  /** calls */
  callInvite: (peer: string, handle: string, video: boolean) => void;
  callAccept: () => void;
  callDecline: () => void;
  callHangup: () => void;
  callToggleMic: () => void;
  callToggleCam: () => void;
  callVideoEls: () => { local: HTMLVideoElement; remote: HTMLVideoElement };
  /** proximity voice: open or close my mic for people nearby */
  toggleVoice: () => void;
  /** duels */
  duelInvite: (peer: string, handle: string) => void;
  duelAccept: () => void;
  duelDecline: () => void;
  duelPick: (pick: 0 | 1 | 2) => void;
  duelEnd: () => void;
  /** vending */
  vend: () => void;
  /** safety */
  block: (sessionId: string, on: boolean) => void;
  report: (sessionId: string, reason: string, note?: string) => void;
  /** editor */
  rotateSelected: () => void;
  removeSelected: () => void;
  undo: () => void;
  /** shop */
  previewOf: (def: string) => string;
  /** camera */
  recenter: () => void;
  /** walk up to a placed item and use it (close = shut chance furni) */
  useFurniture: (id: string, close?: boolean) => void;
}

export interface ChatLine {
  key: number;
  id: string;
  name: string;
  text: string;
  roll: boolean;
  at: number;
}

const CHAT_LOG_CAP = 30;
let chatKeySeq = 0;

export interface RoomInfo {
  slug: string;
  name: string;
  category: string;
  size: number;
  theme: string;
  mask: string[] | null;
  style: RoomStyle;
  ownerHandle: string;
  isOwner: boolean;
}

export type EditMode = { on: false } | { on: true; placing: string | null; placingItem: string | null; selected: string | null; moving: boolean };

interface AppState {
  status: ConnStatus;
  sessionId: string | null;
  playerCount: number;
  toast: string | null;
  actions: GameActions | null;
  avatar: AvatarConfig;
  customizing: boolean;
  edit: EditMode;
  undoCount: number;
  room: RoomInfo | null;
  me: Me | null;
  browsing: boolean;
  shopping: boolean;
  styling: boolean;
  setStyling: (v: boolean) => void;
  coins: number | null;
  /** owned, unplaced furniture: def -> qty */
  inventory: Record<string, number>;
  instances: import('./api').InstanceItem[];
  setInstances: (instances: import('./api').InstanceItem[]) => void;
  setShopping: (v: boolean) => void;
  setCoins: (n: number) => void;
  setInventory: (inv: Record<string, number>) => void;
  addInventory: (def: string, delta: number) => void;
  profile: { sessionId: string; handle: string } | null;
  /** local-only: hides their bubbles for you, needs no round trip */
  muted: string[];
  /** session ids you have blocked this session, for immediate UI feedback */
  blocked: string[];
  toggleMute: (sessionId: string) => void;
  markBlocked: (sessionId: string) => void;
  call: CallInfo;
  /** proximity mic is open */
  voiceMic: boolean;
  setVoiceMic: (on: boolean) => void;
  duel: DuelInfo;
  setDuel: (d: DuelInfo | ((prev: DuelInfo) => DuelInfo)) => void;
  vending: boolean;
  credits: number | null;
  wardrobe: string[] | null; // owned cosmetic ids
  vendResult: import('./ui/VendingSheet').VendResultView | null;
  setVending: (v: boolean) => void;
  setCredits: (n: number) => void;
  setWardrobe: (ids: string[]) => void;
  setVendResult: (r: import('./ui/VendingSheet').VendResultView | null) => void;
  setProfile: (p: { sessionId: string; handle: string } | null) => void;
  setCall: (c: CallInfo) => void;
  setRoom: (r: RoomInfo | null) => void;
  setMe: (m: Me | null) => void;
  setBrowsing: (v: boolean) => void;
  setEdit: (e: EditMode) => void;
  setUndoCount: (n: number) => void;
  setAvatar: (patch: Partial<AvatarConfig>) => void;
  setCustomizing: (v: boolean) => void;
  setStatus: (s: ConnStatus) => void;
  setSessionId: (id: string | null) => void;
  setPlayerCount: (n: number) => void;
  setActions: (a: GameActions | null) => void;
  flash: (msg: string) => void;
  /** ring buffer of the last CHAT_LOG_CAP chat/roll lines, oldest first */
  chatLog: ChatLine[];
  pushChat: (entry: Omit<ChatLine, 'key'>) => void;
  /** true while the chat input has focus: shows full scrollable history */
  chatHistoryOpen: boolean;
  setChatHistoryOpen: (v: boolean) => void;
  /** true while the camera has left follow mode (user panned/zoomed) */
  cameraFree: boolean;
  setCameraFree: (v: boolean) => void;
  /** placement id shown in the item info window */
  selectedItem: string | null;
  /** live copy of that placement, refreshed only when it changes */
  selectedPlacement: Placement | null;
  setSelectedItem: (p: Placement | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set) => ({
  status: 'connecting',
  sessionId: null,
  playerCount: 0,
  toast: null,
  actions: null,
  avatar: loadAvatar(),
  customizing: false,
  edit: { on: false },
  undoCount: 0,
  room: null,
  me: null,
  browsing: false,
  shopping: false,
  styling: false,
  setStyling: (styling) => set({ styling }),
  coins: null,
  inventory: {},
  instances: [],
  setInstances: (instances) => set({ instances }),
  setShopping: (shopping) => set({ shopping }),
  setCoins: (coins) => set({ coins, credits: coins }),
  setInventory: (inventory) => set({ inventory }),
  addInventory: (def, delta) =>
    set((s) => {
      const inventory = { ...s.inventory };
      inventory[def] = Math.max(0, (inventory[def] ?? 0) + delta);
      if (!inventory[def]) delete inventory[def];
      return { inventory };
    }),
  profile: null,
  muted: [],
  blocked: [],
  toggleMute: (sessionId) =>
    set((s) => ({ muted: s.muted.includes(sessionId) ? s.muted.filter((m) => m !== sessionId) : [...s.muted, sessionId] })),
  markBlocked: (sessionId) => set((s) => (s.blocked.includes(sessionId) ? s : { blocked: [...s.blocked, sessionId] })),
  call: IDLE_CALL,
  voiceMic: false,
  setVoiceMic: (voiceMic) => set({ voiceMic }),
  duel: IDLE_DUEL,
  setDuel: (d) => set((s) => ({ duel: typeof d === 'function' ? d(s.duel) : d })),
  vending: false,
  credits: null,
  wardrobe: null,
  vendResult: null,
  setVending: (vending) => set({ vending }),
  // credits and coins are one wallet on the server; keep both views in sync
  setCredits: (credits) => set({ credits, coins: credits }),
  setWardrobe: (wardrobe) =>
    set((s) => {
      // a look restored from storage may name items this account never pulled
      const stripped = SLOTS.reduce<Record<string, unknown>>(
        (acc: Record<string, unknown>, slot: Slot) => {
          if (!isStarter(s.avatar[slot]) && !wardrobe.includes(s.avatar[slot])) {
            acc[slot] = isOptionalSlot(slot) ? 'none' : undefined;
          }
          return acc;
        },
        { ...s.avatar },
      );
      const avatar = normalizeAvatar(stripped);
      if (serializeAvatar(avatar) !== serializeAvatar(s.avatar)) {
        saveAvatar(avatar);
        s.actions?.setAvatar(avatar);
        return { wardrobe, avatar };
      }
      return { wardrobe };
    }),
  setVendResult: (vendResult) => set({ vendResult }),
  setProfile: (profile) => set({ profile }),
  setCall: (call) => set({ call }),
  setRoom: (room) => set({ room }),
  setMe: (me) => set({ me }),
  setBrowsing: (browsing) => set({ browsing }),
  setEdit: (edit) => set({ edit }),
  setUndoCount: (undoCount) => set({ undoCount }),
  setAvatar: (patch) =>
    set((s) => {
      // mirror the server rule: an item you have not pulled cannot be worn, so
      // keep the local look in step instead of silently diverging from the room
      const wanted = normalizeAvatar({ ...s.avatar, ...patch });
      const avatar = s.wardrobe
        ? normalizeAvatar(
            SLOTS.reduce<Record<string, unknown>>(
              (acc: Record<string, unknown>, slot: Slot) => {
                if (!isStarter(wanted[slot]) && !s.wardrobe!.includes(wanted[slot])) {
                  acc[slot] = s.avatar[slot];
                  acc[`${slot}Colour`] = s.avatar[`${slot}Colour` as keyof AvatarConfig];
                }
                return acc;
              },
              { ...wanted },
            ),
          )
        : wanted;
      saveAvatar(avatar);
      s.actions?.setAvatar(avatar);
      return { avatar };
    }),
  setCustomizing: (customizing) => set({ customizing }),
  setStatus: (status) => set({ status }),
  setSessionId: (sessionId) => set({ sessionId }),
  setPlayerCount: (playerCount) => set({ playerCount }),
  setActions: (actions) => set({ actions }),
  flash: (toast) => {
    set({ toast });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 1500);
  },
  chatLog: [],
  pushChat: (entry) =>
    set((s) => {
      const line: ChatLine = { ...entry, key: ++chatKeySeq };
      const chatLog = [...s.chatLog, line];
      if (chatLog.length > CHAT_LOG_CAP) chatLog.splice(0, chatLog.length - CHAT_LOG_CAP);
      return { chatLog };
    }),
  chatHistoryOpen: false,
  setChatHistoryOpen: (chatHistoryOpen) => set({ chatHistoryOpen }),
  cameraFree: false,
  setCameraFree: (cameraFree) => set({ cameraFree }),
  selectedItem: null,
  selectedPlacement: null,
  setSelectedItem: (p) => set({ selectedItem: p?.id ?? null, selectedPlacement: p }),
}));
