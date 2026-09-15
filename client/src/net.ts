import { Client, Room, getStateCallbacks } from 'colyseus.js';
import { AvatarConfig, Placement, RoomStyle, parseStyle } from '@dovey/shared';
import { useAppStore } from './store';
import { deviceToken } from './identity';
import { useLove } from './love';
import { useRoster } from './roster';
import { onTableEnd, onTableState, onTableStatus } from './tableGames';
import { onFriendInvite, onFriendInviteSent, onFriendPresence, onFriendRequest, onFriendUpdate } from './friends';
import { onFriendCallEnd, onFriendCallFail, onFriendCallHold, onFriendCallIncoming, onFriendCallRejoin, onFriendCallStart, onFriendSignal } from './friendCall';
import { onAdultRequired } from './adultGate';
import { fetchInventory } from './api';
import { onTradeDone, onTradeIncoming, onTradeState, onTradeSys, onTradeWaiting, tradeSysText } from './trade';
import { CrewInfo, useKitchen } from './kitchen/store';
import { playChat } from './roomSounds';

export interface RemotePlayer {
  handle: string;
  userId: string;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  avatar: string;
  voice: boolean;
}

export interface DuelRoundMsg {
  winner: 'a' | 'b' | 'draw';
  picks: [number, number];
  score: [number, number];
  done: boolean;
  /** coins each side put in */
  stake: number;
  /** what the winner takes: 2 × stake */
  pot: number;
}

export interface NetEvents {
  /** the connection dropped; forget everything from the old session before rejoining */
  onReset: () => void;
  /** a (re)join finished; sessionId is valid */
  onJoined: (sessionId: string) => void;
  /** the first full state of this join (players and furniture) has been applied */
  onSynced: () => void;
  onAdd: (id: string, p: RemotePlayer) => void;
  onChange: (id: string, p: RemotePlayer) => void;
  onRemove: (id: string) => void;
  /** `roll` marks a server-issued dice/wheel result (drawn distinct from typed chat) */
  onChat: (id: string, text: string, roll?: boolean) => void;
  onEmote: (id: string, i: number) => void;
  /** someone tapped themselves to use their gear */
  onGearUse: (id: string) => void;
  onFurnitureAdd: (p: Placement) => void;
  onFurnitureChange: (p: Placement) => void;
  onFurnitureRemove: (id: string) => void;
  onCallIncoming: (from: string, handle: string, video: boolean) => void;
  onCallStart: (peer: string, video: boolean, initiator: boolean) => void;
  onCallEnd: (reason: string) => void;
  onRtc: (from: string, data: unknown) => void;
  onCallState: (a: string, b: string, on: boolean) => void;
  onVoiceSignal: (from: string, data: unknown) => void;
  onVoiceDrop: (id: string) => void;
  /** room size/theme are known once the first state patch lands */
  onRoomShape: (size: number, theme: string, mask: string[] | null) => void;
  onCoins: (coins: number, earned: number) => void;
  onRoomStyle: (style: RoomStyle) => void;
  onVendResult: (r: unknown) => void;
  onDuelIncoming: (from: string, handle: string, stake: number) => void;
  onDuelStart: (peer: string, handle: string, you: 'a' | 'b', stake: number) => void;
  onDuelRound: (r: DuelRoundMsg) => void;
  /** `pot` = coins credited to you because of this ending (0 when none) */
  onDuelEnd: (reason: string, pot: number) => void;
  onMazeWin: (id: string, handle: string, reward: number) => void;
}

interface FurnitureState {
  def: string;
  x: number;
  y: number;
  rot: number;
  on: boolean;
  state: string;
  itemId: string;
  serial: number;
}

const toPlacement = (id: string, f: FurnitureState): Placement => ({
  id,
  def: f.def,
  x: f.x,
  y: f.y,
  rot: f.rot as 0 | 1 | 2 | 3,
  on: f.on,
  ...(f.state ? { state: f.state } : {}),
  ...(f.itemId ? { itemId: f.itemId } : {}),
  ...(f.serial ? { serial: f.serial } : {}),
});

/** backoff between rejoin attempts: 1s, 2s, 4s ... capped */
const RETRY_MAX_MS = 10_000;

export function endpoint(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // dev: Vite on :5173 talks to the game server on :2567. Production: the server hosts the
  // client, so the socket is same-origin (wss behind Railway's HTTPS).
  return import.meta.env.DEV ? `${proto}://${location.hostname}:2567` : `${proto}://${location.host}`;
}

/** the joined world connection, for UI outside the game (kitchen lobby) */
let active: Net | null = null;

export function sendToWorld(type: string, data?: unknown) {
  active?.send(type, data);
}

export class Net {
  private room: Room | null = null;
  private events: NetEvents | null = null;
  private slug = '';
  /** set by leave(): no more rejoins until resume() */
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Join the room and stay joined: a dropped socket (server restart, network
   * blip, laptop sleep) rejoins with backoff instead of leaving a dead page.
   */
  async connect(events: NetEvents, avatar: AvatarConfig, slug: string): Promise<void> {
    this.events = events;
    this.slug = slug;
    this.closed = false;
    useAppStore.getState().setStatus('connecting');
    try {
      await this.join(avatar);
    } catch (e) {
      console.error('[net] connect failed', e);
      this.retry(0);
    }
  }

  /** Rejoin after leave(), e.g. a page restored from the back/forward cache. */
  resume() {
    if (!this.events || !this.closed) return;
    this.closed = false;
    useRoster.getState().clear();
    this.events.onReset();
    this.retry(0);
  }

  private retry(attempt: number) {
    if (this.closed || this.retryTimer) return;
    useAppStore.getState().setStatus('reconnecting');
    const ms = Math.min(1000 * 2 ** attempt, RETRY_MAX_MS);
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.closed) return;
      try {
        await this.join(useAppStore.getState().avatar);
      } catch (e) {
        if (import.meta.env.DEV) console.debug('[net] rejoin failed', e);
        this.retry(attempt + 1);
      }
    }, ms);
  }

  private async join(avatar: AvatarConfig) {
    const events = this.events!;
    const store = useAppStore.getState();
    const client = new Client(endpoint());
    const room = await client.joinOrCreate('room', { slug: this.slug, avatar, token: deviceToken() });
    if (this.closed) {
      room.leave();
      return;
    }
    this.room = room;
    active = this;
    const $ = getStateCallbacks(room);

    const syncRoom = () => {
      const st = room.state as {
        slug: string;
        name: string;
        category: string;
        size: number;
        theme: string;
        mask: string;
        style: string;
        ownerId: string;
        ownerHandle: string;
      };
      const me = room.state.players.get(room.sessionId) as RemotePlayer | undefined;
      store.setRoom({
        slug: st.slug,
        name: st.name,
        category: st.category,
        size: st.size,
        theme: st.theme,
        mask: st.mask ? st.mask.split('|') : null,
        style: parseStyle(st.style),
        ownerHandle: st.ownerHandle,
        isOwner: !!me && me.userId === st.ownerId,
      });
    };
    const syncShape = () => {
      const st = room.state as { size: number; theme: string; mask: string };
      if (st.size > 0) events.onRoomShape(st.size, st.theme, st.mask ? st.mask.split('|') : null);
      syncRoom();
    };
    $(room.state).listen('size', syncShape);
    $(room.state).listen('theme', syncShape);
    $(room.state).listen('mask', syncShape);
    $(room.state).listen('style', () => {
      events.onRoomStyle(parseStyle((room.state as { style: string }).style));
      syncRoom();
    });
    $(room.state).listen('name', syncRoom);
    $(room.state).listen('category', syncRoom);
    $(room.state).listen('ownerHandle', syncRoom);

    $(room.state).players.onAdd((p: RemotePlayer, id: string) => {
      events.onAdd(id, p);
      useRoster.getState().upsert(id, { handle: p.handle, userId: p.userId, avatar: p.avatar });
      if (id === room.sessionId) syncRoom();
      $(p).onChange(() => {
        events.onChange(id, p);
        useRoster.getState().upsert(id, { handle: p.handle, userId: p.userId, avatar: p.avatar });
      });
      store.setPlayerCount(room.state.players.size);
    });
    $(room.state).players.onRemove((_p: RemotePlayer, id: string) => {
      events.onRemove(id);
      useRoster.getState().remove(id);
      store.setPlayerCount(room.state.players.size);
    });

    $(room.state).furniture.onAdd((f: FurnitureState, id: string) => {
      events.onFurnitureAdd(toPlacement(id, f));
      $(f).onChange(() => events.onFurnitureChange(toPlacement(id, f)));
    });
    $(room.state).furniture.onRemove((_f: FurnitureState, id: string) => events.onFurnitureRemove(id));

    room.onMessage('vend_result', (r: unknown) => events.onVendResult(r));
    room.onMessage('duel_incoming', (m: { from: string; handle: string; stake?: number }) => events.onDuelIncoming(m.from, m.handle, m.stake ?? 0));
    room.onMessage('duel_ringing', () => {});
    room.onMessage('duel_wait', () => {});
    room.onMessage('duel_start', (m: { peer: string; handle: string; you: 'a' | 'b'; stake?: number }) => events.onDuelStart(m.peer, m.handle, m.you, m.stake ?? 0));
    room.onMessage('duel_round', (m: DuelRoundMsg) => events.onDuelRound({ ...m, stake: m.stake ?? 0, pot: m.pot ?? 0 }));
    room.onMessage('duel_end', (m: { reason: string; pot?: number }) => events.onDuelEnd(m.reason, m.pot ?? 0));
    room.onMessage('duel_over', () => {});
    room.onMessage('maze_win', (m: { id: string; handle: string; reward: number }) => events.onMazeWin(m.id, m.handle, m.reward));
    room.onMessage('love', (m: import('@dovey/shared').LoveSnapshot) => useLove.getState().set(m));
    room.onMessage('call_incoming', (m: { from: string; handle: string; video: boolean }) => events.onCallIncoming(m.from, m.handle, m.video));
    room.onMessage('call_ringing', () => {});
    room.onMessage('call_start', (m: { peer: string; video: boolean; initiator: boolean }) => events.onCallStart(m.peer, m.video, m.initiator));
    room.onMessage('call_end', (m: { reason: string }) => events.onCallEnd(m.reason));
    room.onMessage('rtc', (m: { from: string; data: unknown }) => events.onRtc(m.from, m.data));
    room.onMessage('call_state', (m: { a: string; b: string; on: boolean }) => events.onCallState(m.a, m.b, m.on));
    room.onMessage('vrtc', (m: { from: string; data: unknown }) => events.onVoiceSignal(m.from, m.data));
    room.onMessage('voice_drop', (m: { id: string }) => events.onVoiceDrop(m.id));
    room.onMessage('tg_state', onTableState);
    room.onMessage('tg_status', onTableStatus);
    room.onMessage('tg_end', onTableEnd);
    room.onMessage('friend_request', onFriendRequest);
    room.onMessage('friend_update', onFriendUpdate);
    room.onMessage('friend_presence', onFriendPresence);
    room.onMessage('friend_invite', onFriendInvite);
    room.onMessage('friend_invite_sent', onFriendInviteSent);
    // friend calls (cross-room)
    room.onMessage('fcall_incoming', onFriendCallIncoming);
    room.onMessage('fcall_ringing', () => {});
    room.onMessage('fcall_start', onFriendCallStart);
    room.onMessage('fcall_end', onFriendCallEnd);
    room.onMessage('fcall_hold', onFriendCallHold);
    room.onMessage('fcall_rejoin', onFriendCallRejoin);
    room.onMessage('fcall_fail', onFriendCallFail);
    room.onMessage('fsig', onFriendSignal);
    room.onMessage('k_crew', (m: { crew: CrewInfo | null }) => useKitchen.getState().setCrew(m.crew));
    room.onMessage('k_go', (m: { roomId: string }) => useKitchen.getState().go(m.roomId));
    room.onMessage('t_incoming', onTradeIncoming);
    room.onMessage('t_waiting', onTradeWaiting);
    room.onMessage('t_state', onTradeState);
    room.onMessage('t_done', onTradeDone);

    room.onMessage('coins', (m: { coins: number; earned: number }) => events.onCoins(m.coins, m.earned));
    room.onMessage('inventory_delta', (m: { def: string; delta: number }) => store.addInventory(m.def, m.delta));
    const refreshInventory = () => {
      void fetchInventory().then((inv) => {
        if (!inv) return;
        store.setCoins(inv.coins);
        store.setInventory(inv.items);
        store.setInstances(inv.instances);
      });
    };
    room.onMessage('inventory_refresh', refreshInventory);
    room.onMessage('chat', (m: { id: string; text: string }) => {
      events.onChat(m.id, m.text);
      playChat(m.id, room.sessionId);
    });
    room.onMessage('roll', (m: { id: string; text: string }) => events.onChat(m.id, m.text, true));
    room.onMessage('emote', (m: { id: string; i: number }) => events.onEmote(m.id, m.i));
    room.onMessage('gear_use', (m: { id: string }) => events.onGearUse(m.id));
    room.onMessage('sys', (m: { code: string }) => {
      if (m.code === 'adult_required') return onAdultRequired();
      const msgs: Record<string, string> = {
        rate_limited: 'slow down',
        overlap: 'something is in the way',
        out_of_bounds: 'out of the room',
        room_full: 'room is full of stuff',
        not_owner: 'only the owner can build here',
        blocked: 'blocked. they cannot see or call you',
        unblocked: 'unblocked',
        reported: 'thanks. a moderator will look at this',
        blocked_pair: 'you cannot call someone you blocked',
        busy_peer: 'they are already on a call',
        busy_self: 'you are already on a call',
        no_such_player: 'they left',
        no_invite: 'call expired',
        peer_gone: 'they left',
        not_owned: 'you need to buy that first',
        too_far: 'walk closer to use it',
        busy: 'you are already in a duel',
        no_duel: 'no duel going on',
        not_in_crew: 'stand on a crew rug first',
        already_cooking: 'your crew is already cooking',
        bad_code: 'no crew with that code',
        kitchen_failed: 'the kitchen could not open, try again',
        love_full: 'that line is full, try again soon',
        love_busy: 'you are already on the loveseat',
        sold_out: 'sold out. only trades now',
        bot_no_stake: 'locals only duel for fun, no stakes',
        not_enough_coins: 'not enough coins',
        trade_busy: 'they are already trading',
        too_new: 'trading unlocks after 24 hours and 30 minutes of play',
        trade_off: 'trading is turned off in this room',
        no_trade: 'no trade going on',
        bad_offer: 'that offer is not allowed',
        insufficient_coins: 'you do not have that many coins',
        insufficient_items: 'you do not have that many',
        too_early: 'wait for the countdown',
        not_accepted: 'both of you need to accept first',
        trade_locked: 'the trade is already going through',
        not_friends: 'you can only invite friends',
        friend_offline: 'they went offline',
      };
      // "play again" racing a crewmate's start: their k_go is on its way, not an error
      if (m.code === 'already_cooking' && useKitchen.getState().again) return;
      store.flash(tradeSysText(m.code) ?? msgs[m.code] ?? 'nope');
      onTradeSys(m.code);
      // a rejected claim/placement can leave an optimistic instance-hide stranded in the tray
      const rollback = new Set(['not_owned', 'bad_request', 'overlap', 'out_of_bounds', 'room_full', 'bad_rot', 'bad_coords', 'unknown_def', 'rate_limited', 'not_owner']);
      if (rollback.has(m.code)) refreshInventory();
    });

    room.onLeave((code) => {
      if (this.room !== room) return;
      this.room = null;
      if (this.closed) return;
      if (import.meta.env.DEV) console.debug('[net] dropped', code);
      useRoster.getState().clear();
      events.onReset();
      this.retry(0);
    });
    // the initial furniture batch is in once the first full state has been decoded (onAdd already
    // fired for every item); a state that somehow landed before this line counts as synced
    if ((room.state as { players?: { size: number } }).players?.size) events.onSynced();
    else room.onStateChange.once(() => events.onSynced());
    store.setStatus('connected');
    store.setSessionId(room.sessionId);
    events.onJoined(room.sessionId);
  }

  leave() {
    if (active === this) active = null;
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const r = this.room;
    this.room = null;
    r?.leave();
  }

  sendPlace(p: Placement) {
    this.room?.send('furn_place', p);
  }

  sendMoveFurniture(p: Placement) {
    this.room?.send('furn_move', p);
  }

  sendRemove(id: string) {
    this.room?.send('furn_remove', { id });
  }

  sendUse(id: string) {
    this.room?.send('furn_use', { id });
  }

  sendClose(id: string) {
    this.room?.send('furn_close', { id });
  }

  send(type: string, data?: unknown) {
    this.room?.send(type, data);
  }

  sendBlock(sessionId: string, on: boolean) {
    this.room?.send(on ? 'block' : 'unblock', { id: sessionId });
  }

  sendReport(sessionId: string, reason: string, note?: string) {
    this.room?.send('report', { id: sessionId, reason, note });
  }

  sendRoomMeta(patch: { name?: string; category?: string; style?: Partial<RoomStyle> }) {
    this.room?.send('room_meta', patch);
  }

  sendAvatar(config: AvatarConfig) {
    this.room?.send('avatar', { config });
  }

  sendChat(text: string) {
    this.room?.send('chat', { text });
  }

  sendEmote(i: number) {
    this.room?.send('emote', { i });
  }

  sendMove(x: number, y: number) {
    if (import.meta.env.DEV) console.debug('[net] move', x, y);
    this.room?.send('move', { x, y });
  }

  get sessionId() {
    return this.room?.sessionId ?? null;
  }
}
