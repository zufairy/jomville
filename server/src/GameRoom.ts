import { AuthContext, Client, Room, ServerError, matchMaker } from 'colyseus';
import {
  SLOTS,
  BLOCK_RATE,
  CHAT_RATE,
  REPORT_NOTE_MAX,
  REPORT_RATE,
  isReportReason,
  EMOTES,
  EMOTE_RATE,
  MAX_FURNITURE_PER_ROOM,
  MAX_FURNITURE_SYSTEM_ROOM,
  COINS_PER_MINUTE,
  RoomMask,
  distanceTo,
  furnitureDef,
  tilesOf,
  MAX_PLAYERS,
  PLACEMENT_ID,
  Placement,
  buildGrid,
  ROOM_SIZE,
  RateLimiter,
  TICK_MS,
  VOICE_DISCONNECT,
  VOICE_RTC_RATE,
  censor,
  tileDistance,
  makeGrid,
  normalizeAvatar,
  parseAvatar,
  GEAR_USE_RATE,
  sanitizeChat,
  isSystemRollText,
  serializeAvatar,
  validatePlacement,
  CLOSED,
  INTERACTIONS,
  inReach,
  isInstanceDef,
} from '@dovey/shared';
import { randomInt } from 'node:crypto';
import { beginRoll, closeChance, finishRoll, restoredState } from './chance';
import { Furniture, Player, WorldState } from './schema';
import { MovementSim } from './movement';
import { Repo, User } from './repo';
import { CallBook } from './calls';
import { DUEL_REWARD, DuelBook, Pick } from './duel';
import { GAME_TABLE_KIND, TABLE_BOT_REWARD, TABLE_GAME_KINDS, TABLE_REWARD, TableGameKind, tableChairs } from '@dovey/shared';
import { Match, TableBook, TableEvent, isBot } from './tableGames';
import { BotCrew, PERSONAS, scatterSpawns } from './bots';
import { LOBBY_MAZE_PRIZE, MAIN_LOBBY, MAZE_COOLDOWN_MS, MAZE_REWARD } from '@dovey/shared';
import { LOVE_ROOM, LOVE_SEATS, LoveSide, LoveSnapshot, laneSpot, normalizeVibe } from '@dovey/shared';
import { LoveEvent, LoveMeter } from './loveMeter';
import { KITCHEN_WORLD } from '@dovey/shared';
import { KitchenLobby } from './kitchen/lobby';
import { ROUND_KEY } from './kitchen/rounds';
import { canEquip, vend } from './vending';
import { BlockBook } from './blocks';
import { humanCount, registry } from './registry';

export interface JoinOptions {
  slug?: string;
  token?: string;
  avatar?: unknown;
}

const SAVE_DEBOUNCE_MS = 1000;

interface MoveMsg {
  x: number;
  y: number;
}

export class GameRoom extends Room<WorldState> {
  static repo: Repo; // injected once at boot
  maxClients = MAX_PLAYERS;
  state = new WorldState();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private size = ROOM_SIZE;
  private furnitureCap = MAX_FURNITURE_PER_ROOM;
  private mask: RoomMask = null;
  private useLimit = new RateLimiter(20, 5000);
  private chanceLimit = new RateLimiter(1, 700);
  private grid = makeGrid(ROOM_SIZE, ROOM_SIZE);
  private sim = new MovementSim(this.grid);
  private chatLimit = new RateLimiter(CHAT_RATE.count, CHAT_RATE.windowMs);
  private reportLimit = new RateLimiter(REPORT_RATE.count, REPORT_RATE.windowMs);
  private blockLimit = new RateLimiter(BLOCK_RATE.count, BLOCK_RATE.windowMs);
  private blocks = new BlockBook();
  private emoteLimit = new RateLimiter(EMOTE_RATE.count, EMOTE_RATE.windowMs);
  private avatarLimit = new RateLimiter(10, 5000);
  private editLimit = new RateLimiter(30, 3000);
  private calls = new CallBook();
  private voiceLimit = new RateLimiter(VOICE_RTC_RATE.count, VOICE_RTC_RATE.windowMs);
  private gearUseLimit = new RateLimiter(GEAR_USE_RATE.count, GEAR_USE_RATE.windowMs);
  private duels = new DuelBook();
  /** board games at the Game Den tables (and quick match / house bot anywhere) */
  private tables = new TableBook();
  private tableLimit = new RateLimiter(40, 5000);
  /** lobby locals (AI-driven roaming players); null everywhere else */
  private bots: BotCrew | null = null;
  /** userId -> last maze payout */
  private mazeAt = new Map<string, number>();
  private duelLimit = new RateLimiter(20, 5000);
  private love: LoveMeter | null = null;
  /** lane tile each queued person was last sent to, so re-syncs don't re-path them */
  private loveSpots = new Map<string, string>();
  private loveRecent: LoveSnapshot['recent'] = [];
  /** crew rugs in the Kitchen world; null everywhere else */
  private kitchen: KitchenLobby | null = null;

  async onCreate(options: JoinOptions) {
    const repo = GameRoom.repo;
    const row = await repo.room(String(options?.slug ?? ''));
    if (!row) throw new ServerError(404, 'no such room');
    this.state.slug = row.id;
    this.state.name = row.name;
    this.state.category = row.category;
    this.state.size = row.size;
    this.state.theme = row.theme;
    this.state.style = JSON.stringify(row.style);
    this.state.mask = row.mask ? row.mask.join('|') : '';
    this.state.ownerId = row.owner_id;
    this.size = row.size;
    this.mask = row.mask;
    if (repo.isSystemRoom(row.id)) this.furnitureCap = MAX_FURNITURE_SYSTEM_ROOM;
    const owner = await repo.userById(row.owner_id);
    this.state.ownerHandle = owner?.handle ?? '';
    // instances only load where the items table agrees they stand (a crash inside the
    // save debounce can leave a ghost copy in the layout while the item is elsewhere)
    const placed = row.layout.some((p) => p.itemId) ? await repo.placedItems(row.id) : new Map<string, string>();
    let dropped = false;
    for (const p of row.layout) {
      if (p.itemId && placed.get(p.itemId) !== p.def) {
        dropped = true;
        continue;
      }
      const f = new Furniture();
      f.def = p.def;
      f.x = p.x;
      f.y = p.y;
      f.rot = p.rot;
      f.on = p.on ?? true;
      if (furnitureDef(p.def)?.interaction) f.state = restoredState(p.state);
      f.itemId = p.itemId ?? '';
      f.serial = p.serial ?? 0;
      this.state.furniture.set(p.id, f);
    }
    this.rebuildGrid();
    if (dropped) this.markDirty();
    if (row.id === LOVE_ROOM.slug) this.setupLove();
    if (row.id === MAIN_LOBBY.slug) this.spawnBots();
    if (row.id === KITCHEN_WORLD.slug) this.setupKitchen();

    // ---- usable items: lamps toggle; chance furni (dice, wheel) roll server-side
    this.onMessage('furn_use', (client, msg: { id?: unknown }) => {
      const me = this.state.players.get(client.sessionId);
      if (!me) return;
      const id = typeof msg?.id === 'string' ? msg.id : '';
      const f = this.state.furniture.get(id);
      const d = f && furnitureDef(f.def);
      if (!f || !d || !d.use) return;
      const p: Placement = { id, def: f.def, x: f.x, y: f.y, rot: f.rot as 0 | 1 | 2 | 3 };
      const tx = Math.round(me.x);
      const ty = Math.round(me.y);
      const kind = d.interaction;
      if (!kind) {
        if (!this.useLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
        if (distanceTo(tx, ty, p) > 2) return this.reject(client, 'too_far');
        f.on = !f.on;
        this.markDirty();
        return;
      }
      if (!this.chanceLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      if (!inReach(kind, tx, ty, p)) return this.reject(client, 'too_far');
      if (!beginRoll(f)) return; // already rolling: ignore, like Habbo
      const roller = client.sessionId;
      const userId = (client.auth as User).id;
      this.clock.setTimeout(() => {
        if (this.state.furniture.get(id) !== f) return; // picked up mid-roll
        const n = finishRoll(f, kind, (max) => randomInt(max));
        if (n === null) return;
        this.markDirty();
        void GameRoom.repo.recordRoll(this.state.slug, id, userId, kind, n).catch((e) => console.error('[casino]', e));
        const tag = f.serial ? ` · #${f.serial}` : '';
        const text = kind === 'wheel' ? `🎡 spun ${n}${tag}` : kind === 'dice100' ? `🎲 rolled ${n} on the holodice${tag}` : `🎲 rolled ${n}${tag}`;
        // a dedicated message, so a typed look-alike in chat can never pass for a real roll
        if (this.state.players.has(roller)) this.sayTo(roller, text, 'roll');
      }, INTERACTIONS[kind].rollMs);
    });

    this.onMessage('furn_close', (client, msg: { id?: unknown }) => {
      const me = this.state.players.get(client.sessionId);
      const id = typeof msg?.id === 'string' ? msg.id : '';
      const f = this.state.furniture.get(id);
      const kind = f && furnitureDef(f.def)?.interaction;
      if (!me || !f || !kind) return;
      if (!this.chanceLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const p: Placement = { id, def: f.def, x: f.x, y: f.y, rot: f.rot as 0 | 1 | 2 | 3 };
      if (!inReach(kind, Math.round(me.x), Math.round(me.y), p)) return this.reject(client, 'too_far');
      if (closeChance(f)) this.markDirty();
    });

    // ---- coins: everyone online earns a trickle
    // (setSimulationInterval is single-slot and owned by movement; extra timers use the room clock)
    this.clock.setInterval(() => {
      for (const c of this.clients) {
        const u = c.auth as User | undefined;
        if (!u) continue;
        void GameRoom.repo.creditCoins(u.id, COINS_PER_MINUTE).then((coins) => c.send('coins', { coins, earned: COINS_PER_MINUTE }));
      }
    }, 60_000);
    this.setPatchRate(TICK_MS);

    this.onMessage('room_meta', async (client, msg: { name?: unknown; category?: unknown; style?: unknown }) => {
      if (!this.isOwner(client)) return this.reject(client, 'not_owner');
      if (!this.editLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const ok = await repo.updateRoom(this.state.slug, { name: msg?.name, category: msg?.category, style: msg?.style });
      if (!ok) return this.reject(client, 'bad_request');
      const row = await repo.room(this.state.slug);
      if (row) {
        this.state.name = row.name;
        this.state.category = row.category;
        this.state.style = JSON.stringify(row.style);
      }
    });

    this.onMessage('move', (client, msg: MoveMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (!Number.isInteger(msg?.x) || !Number.isInteger(msg?.y)) return;
      // walking out of a love lane gives up your place
      if (this.love?.sideOf(client.sessionId) != null) this.loveLeave(client.sessionId);
      const ok = this.sim.requestMove(client.sessionId, p, { x: msg.x, y: msg.y });
      if (process.env.DOVEY_DEBUG) console.log('[move]', client.sessionId, msg, 'from', p.x, p.y, ok);
    });

    this.onMessage('chat', (client, msg: { text?: unknown }) => {
      if (!this.state.players.has(client.sessionId)) return;
      const text = sanitizeChat(msg?.text);
      if (!text) return;
      if (isSystemRollText(text)) return this.reject(client, 'bad_request');
      if (!this.chatLimit.allow(client.sessionId)) {
        client.send('sys', { code: 'rate_limited' });
        return;
      }
      this.sayTo(client.sessionId, censor(text));
      const me = this.state.players.get(client.sessionId)!;
      this.bots?.onHumanChat({ id: client.sessionId, handle: me.handle, x: Math.round(me.x), y: Math.round(me.y) }, censor(text));
    });

    this.onMessage('emote', (client, msg: { i?: unknown }) => {
      if (!this.state.players.has(client.sessionId)) return;
      const i = msg?.i;
      if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= EMOTES.length) return;
      if (!this.emoteLimit.allow(client.sessionId)) return;
      this.broadcast('emote', { id: client.sessionId, i });
    });

    // ---- gear use: tapping yourself plays your worn gear's special move for the whole room
    this.onMessage('gear_use', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const look = parseAvatar(p.avatar);
      if ([look.face, look.helm, look.aura, look.back].every((g) => g === 'none')) return;
      if (!this.gearUseLimit.allow(client.sessionId)) return;
      this.broadcast('gear_use', { id: client.sessionId });
    });

    this.onMessage('avatar', (client, msg: { config?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (!this.avatarLimit.allow(client.sessionId)) return;
      const cfg = normalizeAvatar(msg?.config);
      const u = client.auth as User | undefined;
      if (!u) return;
      void (async () => {
        // premium cosmetics must be owned; strip anything that isn't back to the starter default
        for (const slot of SLOTS) {
          if (!(await canEquip(GameRoom.repo, u.id, cfg[slot]))) cfg[slot] = normalizeAvatar({})[slot];
        }
        p.avatar = serializeAvatar(cfg);
        await GameRoom.repo.setAvatar(u.id, cfg);
      })();
    });

    // ---- safety: block, unblock, report. Blocking hides both ways and blocks calls.
    this.onMessage('block', async (client, msg: { id?: unknown }) => {
      const me = client.auth as User | undefined;
      const target = this.blocks.userOf(msg?.id);
      if (!me || !target || target === me.id) return;
      if (!this.blockLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      await GameRoom.repo.block(me.id, target);
      this.blocks.add(me.id, target);
      client.send('sys', { code: 'blocked' });
      // cut any live proximity-voice link between the two, both ways
      const other = String(msg.id);
      client.send('voice_drop', { id: other });
      this.clients.find((c) => c.sessionId === other)?.send('voice_drop', { id: client.sessionId });
    });

    this.onMessage('unblock', async (client, msg: { id?: unknown }) => {
      const me = client.auth as User | undefined;
      const target = this.blocks.userOf(msg?.id);
      if (!me || !target) return;
      if (!this.blockLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      await GameRoom.repo.unblock(me.id, target);
      this.blocks.remove(me.id, target);
      client.send('sys', { code: 'unblocked' });
    });

    this.onMessage('report', async (client, msg: { id?: unknown; reason?: unknown; note?: unknown }) => {
      const me = client.auth as User | undefined;
      const target = this.blocks.userOf(msg?.id);
      if (!me || !target) return this.reject(client, 'no_such_player');
      if (!isReportReason(msg?.reason)) return this.reject(client, 'bad_request');
      if (!this.reportLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const note = typeof msg?.note === 'string' ? msg.note.slice(0, REPORT_NOTE_MAX).trim() || null : null;
      await GameRoom.repo.report(me.id, target, this.state.slug, msg.reason, note);
      client.send('sys', { code: 'reported' });
    });

    // ---- calls: consent-gated 1-to-1 voice/video between two people in this room.
    // The server never sees media; it relays SDP/ICE only after both accepted.
    this.onMessage('call_invite', (client, msg: { to?: unknown; video?: unknown }) => {
      const to = typeof msg?.to === 'string' ? msg.to : '';
      const target = this.clients.find((c) => c.sessionId === to);
      if (!target || !this.state.players.has(to)) return this.reject(client, 'no_such_player');
      if (this.blocks.isHidden(client.sessionId, to)) return this.reject(client, 'blocked_pair');
      const err = this.calls.invite(client.sessionId, to, Boolean(msg?.video));
      if (process.env.DOVEY_DEBUG) console.log('[call] invite', client.sessionId, '->', to, err ?? 'ok');
      if (err) return this.reject(client, err);
      const me = this.state.players.get(client.sessionId)!;
      target.send('call_incoming', { from: client.sessionId, handle: me.handle, video: Boolean(msg?.video) });
      client.send('call_ringing', { to });
    });

    this.onMessage('call_accept', (client) => {
      const r = this.calls.accept(client.sessionId);
      if (process.env.DOVEY_DEBUG) console.log('[call] accept', client.sessionId, r ? 'ok' : 'no_invite');
      if (!r) return this.reject(client, 'no_invite');
      const caller = this.clients.find((c) => c.sessionId === r.caller);
      if (!caller) {
        this.calls.clear(client.sessionId);
        return this.reject(client, 'peer_gone');
      }
      caller.send('call_start', { peer: client.sessionId, video: r.video, initiator: true });
      client.send('call_start', { peer: r.caller, video: r.video, initiator: false });
      this.broadcast('call_state', { a: r.caller, b: client.sessionId, on: true });
    });

    const endCall = (client: Client, reason: string) => {
      // hanging up a Love Meter call walks out of the match
      if (this.love?.inPair(client.sessionId)) return this.loveLeave(client.sessionId);
      if (process.env.DOVEY_DEBUG) console.log('[call] end', client.sessionId, reason);
      const wasActive = this.calls.get(client.sessionId).kind === 'active';
      const peer = this.calls.clear(client.sessionId);
      if (!peer) return;
      this.clients.find((c) => c.sessionId === peer)?.send('call_end', { reason });
      if (wasActive) this.broadcast('call_state', { a: client.sessionId, b: peer, on: false });
    };
    this.onMessage('call_decline', (client) => endCall(client, 'declined'));
    this.onMessage('call_end', (client) => endCall(client, 'ended'));

    this.onMessage('rtc', (client, msg: { to?: unknown; data?: unknown }) => {
      const to = typeof msg?.to === 'string' ? msg.to : '';
      if (!this.calls.canRelay(client.sessionId, to)) return;
      this.clients.find((c) => c.sessionId === to)?.send('rtc', { from: client.sessionId, data: msg.data });
    });

    // ---- proximity voice: an open mic heard by people nearby. Audio is P2P; the server
    // relays signaling only between two people who can see each other, are close, and
    // at least one of whom has their mic open.
    this.onMessage('voice', (client, msg: { on?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.voice = msg?.on === true;
    });

    this.onMessage('vrtc', (client, msg: { to?: unknown; data?: unknown }) => {
      const to = typeof msg?.to === 'string' ? msg.to : '';
      const me = this.state.players.get(client.sessionId);
      const them = this.state.players.get(to);
      if (!me || !them || to === client.sessionId) return;
      if (!this.voiceLimit.allow(client.sessionId)) return;
      const target = this.clients.find((c) => c.sessionId === to);
      const bye = (msg.data as { bye?: unknown } | undefined)?.bye === true;
      const allowed =
        !!target &&
        !this.blocks.isHidden(client.sessionId, to) &&
        (bye || ((me.voice || them.voice) && tileDistance(me.x, me.y, them.x, them.y) <= VOICE_DISCONNECT + 2));
      // bounce a refusal so the sender closes its half-open link instead of waiting
      if (!allowed) return bye ? undefined : client.send('vrtc', { from: to, data: { bye: true } });
      target.send('vrtc', { from: client.sessionId, data: msg.data });
    });

    this.clock.setInterval(() => {
      for (const [caller, callee] of this.calls.sweep()) {
        this.clients.find((c) => c.sessionId === caller)?.send('call_end', { reason: 'no_answer' });
        this.clients.find((c) => c.sessionId === callee)?.send('call_end', { reason: 'expired' });
      }
      for (const { duel, result } of this.duels.sweep()) this.sendRound(duel.a, duel.b, result);
    }, 5000);

    // ---- duels: rock-paper-scissors, best of three, winner earns coins
    const sendTo = (id: string, type: string, data: unknown) => this.clients.find((c) => c.sessionId === id)?.send(type, data);
    this.onMessage('duel_invite', (client, msg: { to?: unknown }) => {
      const to = typeof msg?.to === 'string' ? msg.to : '';
      const me = this.state.players.get(client.sessionId);
      if (!me || !this.state.players.has(to)) return this.reject(client, 'no_such_player');
      if (!this.duelLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const err = this.duels.invite(client.sessionId, to);
      if (err) return this.reject(client, err);
      if (this.bots?.has(to)) {
        // locals never say no to a duel
        this.clock.setTimeout(() => {
          const d = this.duels.accept(to);
          if (!d) return;
          client.send('duel_start', { peer: to, handle: this.state.players.get(to)?.handle ?? '', you: 'a' });
          this.botPick(to);
        }, 1500);
        client.send('duel_ringing', { to });
        return;
      }
      sendTo(to, 'duel_incoming', { from: client.sessionId, handle: me.handle });
      client.send('duel_ringing', { to });
    });
    this.onMessage('duel_accept', (client) => {
      const d = this.duels.accept(client.sessionId);
      if (!d) return this.reject(client, 'no_invite');
      const pa = this.state.players.get(d.a);
      const pb = this.state.players.get(d.b);
      sendTo(d.a, 'duel_start', { peer: d.b, handle: pb?.handle ?? '', you: 'a' });
      sendTo(d.b, 'duel_start', { peer: d.a, handle: pa?.handle ?? '', you: 'b' });
      this.broadcast('emote', { id: d.a, i: 0 });
    });
    this.onMessage('duel_decline', (client) => {
      const from = this.duels.decline(client.sessionId);
      if (from) sendTo(from, 'duel_end', { reason: 'declined' });
    });
    this.onMessage('duel_pick', (client, msg: { pick?: unknown }) => {
      const p = Number(msg?.pick);
      if (![0, 1, 2].includes(p)) return;
      const d = this.duels.get(client.sessionId);
      if (!d) return this.reject(client, 'no_duel');
      const r = this.duels.pick(client.sessionId, p as Pick);
      if (r === 'waiting') return sendTo(client.sessionId, 'duel_wait', {});
      if (r) this.sendRound(d.a, d.b, r);
    });
    this.onMessage('duel_end', (client) => {
      const peer = this.duels.end(client.sessionId);
      if (peer) sendTo(peer, 'duel_end', { reason: 'left' });
    });

    // ---- table games: sit opposite someone at a game table, quick match, or play the house bot
    this.state.furniture.forEach((f) => {
      if (GAME_TABLE_KIND[f.def]) f.on = false;
    });
    const tableKind = (v: unknown): TableGameKind | null => ((TABLE_GAME_KINDS as readonly string[]).includes(String(v)) ? (v as TableGameKind) : null);
    this.onMessage('tg_queue', (client, msg: { kind?: unknown }) => {
      const kind = tableKind(msg?.kind);
      if (!kind || !this.tableLimit.allow(client.sessionId)) return;
      this.dispatchTables(this.tables.queue(client.sessionId, kind));
    });
    this.onMessage('tg_bot', (client, msg: { kind?: unknown }) => {
      const kind = tableKind(msg?.kind);
      if (!kind || !this.tableLimit.allow(client.sessionId)) return;
      this.dispatchTables(this.tables.playBot(client.sessionId, kind));
    });
    this.onMessage('tg_cancel', (client) => this.dispatchTables(this.tables.cancel(client.sessionId)));
    this.onMessage('tg_move', (client, msg: { move?: unknown }) => {
      if (!this.tableLimit.allow(client.sessionId)) return;
      this.dispatchTables(this.tables.move(client.sessionId, Number(msg?.move)));
    });
    this.onMessage('tg_rematch', (client) => this.dispatchTables(this.tables.rematch(client.sessionId)));
    this.onMessage('tg_leave', (client) => this.dispatchTables(this.tables.leave(client.sessionId)));
    this.clock.setInterval(() => {
      this.syncTables();
      this.dispatchTables(this.tables.tick());
    }, 400);

    // ---- maze prize: standing on the lobby's star pad pays out, once per cooldown
    if (row.id === MAIN_LOBBY.slug) {
      this.clock.setInterval(() => {
        const now = Date.now();
        for (const c of this.clients) {
          const p = this.state.players.get(c.sessionId);
          const u = c.auth as User | undefined;
          if (!p || !u || p.moving) continue;
          if (Math.round(p.x) !== LOBBY_MAZE_PRIZE.x || Math.round(p.y) !== LOBBY_MAZE_PRIZE.y) continue;
          const last = this.mazeAt.get(u.id) ?? 0;
          if (now - last < MAZE_COOLDOWN_MS) continue;
          this.mazeAt.set(u.id, now);
          void GameRoom.repo.creditCoins(u.id, MAZE_REWARD).then((coins) => {
            c.send('coins', { coins, earned: MAZE_REWARD });
            this.broadcast('maze_win', { id: c.sessionId, handle: p.handle, reward: MAZE_REWARD });
          });
        }
      }, 1000);
    }

    // ---- vending machine: one pull per message, server rolls, credits are authoritative.
    this.onMessage('vend', async (client) => {
      const u = client.auth as User | undefined;
      if (!u) return;
      if (!this.editLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const owner = this.state.ownerId && !this.state.ownerId.startsWith('sys') ? this.state.ownerId : null;
      const r = await vend(GameRoom.repo, u.id, owner);
      if (!r.ok) return client.send('vend_result', r);
      client.send('vend_result', r);
      const p = this.state.players.get(client.sessionId);
      if (p && (r.rarity === 'epic' || r.rarity === 'legendary')) {
        this.broadcast('chat', { id: client.sessionId, text: `pulled ${r.name}! ✨` });
      }
    });

    // ---- room editing. TODO(accounts): restrict to room owner once rooms are owned.
    this.onMessage('furn_place', async (client, msg: Partial<Placement>) => {
      if (!this.canEdit(client)) return;
      if (this.state.furniture.size >= this.furnitureCap) return this.reject(client, 'room_full');
      const p = this.asPlacement(msg);
      if (!p || this.state.furniture.has(p.id)) return this.reject(client, 'bad_request');
      const err = validatePlacement(p, this.size, this.placements(), this.mask);
      if (err) return this.reject(client, err);
      const u = client.auth as User;
      const d = furnitureDef(p.def)!;
      const f = new Furniture();
      if (isInstanceDef(d)) {
        const itemId = typeof msg.itemId === 'string' ? msg.itemId : '';
        const slug = this.state.slug;
        const claim = itemId ? await GameRoom.repo.claimPlacement(itemId, u.id, p.def, slug) : null;
        if (!claim) return this.reject(client, 'not_owned');
        if (this.state.furniture.has(p.id)) {
          await GameRoom.repo.releasePlacement(itemId, slug);
          return this.reject(client, 'bad_request');
        }
        f.itemId = itemId;
        f.serial = claim.serial ?? 0;
        if (d.interaction) f.state = CLOSED;
        client.send('inventory_refresh', {});
      } else {
        // the item leaves the owner's inventory while it stands in the room
        if (!(await GameRoom.repo.addItem(u.id, p.def, -1))) return this.reject(client, 'not_owned');
        if (this.state.furniture.has(p.id)) {
          await GameRoom.repo.addItem(u.id, p.def, 1);
          return this.reject(client, 'bad_request');
        }
        client.send('inventory_delta', { def: p.def, delta: -1 });
      }
      f.def = p.def;
      f.x = p.x;
      f.y = p.y;
      f.rot = p.rot;
      this.state.furniture.set(p.id, f);
      this.rebuildGrid();
      this.markDirty();
    });

    this.onMessage('furn_move', (client, msg: Partial<Placement>) => {
      if (!this.canEdit(client)) return;
      const p = this.asPlacement(msg);
      const f = p && this.state.furniture.get(p.id);
      if (!p || !f) return this.reject(client, 'bad_request');
      const next: Placement = { ...p, def: f.def };
      const err = validatePlacement(next, this.size, this.placements(), this.mask);
      if (err) return this.reject(client, err);
      f.x = next.x;
      f.y = next.y;
      f.rot = next.rot;
      this.rebuildGrid();
      this.markDirty();
    });

    this.onMessage('furn_remove', (client, msg: { id?: unknown }) => {
      if (!this.canEdit(client)) return;
      const id = typeof msg?.id === 'string' ? msg.id : '';
      const f = this.state.furniture.get(id);
      if (!f) return;
      this.state.furniture.delete(id);
      this.rebuildGrid();
      this.markDirty();
      if (f.itemId) {
        // instances go back to whoever owns the item, not whoever edits the room
        void GameRoom.repo
          .releasePlacement(f.itemId, this.state.slug)
          .then((ownerId) => {
            if (!ownerId) return;
            for (const c of this.clients) if ((c.auth as User | undefined)?.id === ownerId) c.send('inventory_refresh', {});
          })
          .catch((e) => console.error('[casino]', e));
        return;
      }
      const u = client.auth as User;
      void GameRoom.repo.addItem(u.id, f.def, 1);
      client.send('inventory_delta', { def: f.def, delta: 1 });
    });

    this.setSimulationInterval(() => {
      this.state.players.forEach((p, id) => this.sim.step(id, p));
    }, TICK_MS);
  }

  /** Resolve the anonymous device token to a user, creating one (plus a home room) on first sight. */
  async onAuth(_client: Client, options: JoinOptions, ctx: AuthContext): Promise<User> {
    const repo = GameRoom.repo;
    const token = typeof options?.token === 'string' ? options.token : '';
    let user = await repo.userByToken(token);
    if (!user) {
      if (token.length < 16 || token.length > 128) throw new ServerError(400, 'bad token');
      user = await repo.createUser(token, normalizeAvatar(options?.avatar));
    }
    if (process.env.DOVEY_DEBUG) console.log('[auth]', user.handle, ctx.ip);
    return user;
  }

  onJoin(client: Client, options: JoinOptions | undefined, user: User) {
    const p = new Player();
    p.handle = user.handle;
    p.userId = user.id;
    // client-side choice wins if provided (customizer), else stored look
    p.avatar = serializeAvatar(options?.avatar ? normalizeAvatar(options.avatar) : user.avatar);
    void GameRoom.repo.recordVisit(this.state.slug, user.id);
    const spawn = this.freeSpawnTile();
    p.x = spawn.x;
    p.y = spawn.y;
    this.state.players.set(client.sessionId, p);
    this.blocks.join(client.sessionId, user.id);
    void this.reloadBlocks(client.sessionId, user.id);
    if (this.love) client.send('love', this.loveSnapshot());
    this.publishLive();
    void GameRoom.repo.coins(user.id).then((coins) => client.send('coins', { coins, earned: 0 }));
    this.bots?.onHumanJoin({ id: client.sessionId, handle: p.handle, x: p.x, y: p.y });
    if (process.env.DOVEY_DEBUG) console.log('[join]', this.state.slug, user.handle, 'now', this.state.players.size);
  }

  private async reloadBlocks(sessionId: string, userId: string) {
    this.blocks.reload(sessionId, await GameRoom.repo.blockPairs(userId));
  }

  /** Deliver a chat (or roll result) line to everyone who has not blocked the speaker. */
  private sayTo(fromSession: string, text: string, type: 'chat' | 'roll' = 'chat') {
    for (const c of this.clients) {
      if (this.blocks.isHidden(fromSession, c.sessionId)) continue;
      c.send(type, { id: fromSession, text });
    }
  }

  private isOwner(client: Client): boolean {
    const u = client.auth as User | undefined;
    return !!u && u.id === this.state.ownerId;
  }

  private canEdit(client: Client): boolean {
    if (!this.state.players.has(client.sessionId)) return false;
    if (!this.isOwner(client)) {
      this.reject(client, 'not_owner');
      return false;
    }
    if (!this.editLimit.allow(client.sessionId)) {
      this.reject(client, 'rate_limited');
      return false;
    }
    return true;
  }

  private reject(client: Client, code: string) {
    client.send('sys', { code });
  }

  private asPlacement(msg: Partial<Placement> | undefined): Placement | null {
    if (!msg || typeof msg.id !== 'string' || !PLACEMENT_ID.test(msg.id)) return null;
    const rot = Number(msg.rot ?? 0);
    if (![0, 1, 2, 3].includes(rot)) return null;
    return {
      id: msg.id,
      def: typeof msg.def === 'string' ? msg.def : '',
      x: Number(msg.x),
      y: Number(msg.y),
      rot: rot as 0 | 1 | 2 | 3,
    };
  }

  private placements(): Placement[] {
    const out: Placement[] = [];
    this.state.furniture.forEach((f, id) => {
      const p: Placement = { id, def: f.def, x: f.x, y: f.y, rot: f.rot as 0 | 1 | 2 | 3, on: f.on };
      if (f.state) p.state = f.state;
      if (f.itemId) p.itemId = f.itemId;
      if (f.serial) p.serial = f.serial;
      out.push(p);
    });
    return out;
  }

  private rebuildGrid() {
    this.grid = buildGrid(this.size, this.placements(), this.mask);
    this.sim.setGrid(this.grid);
  }

  /** Debounced layout persistence; also flushed on dispose. */
  private markDirty() {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  private async flush() {
    if (!this.dirty) return;
    this.dirty = false;
    await GameRoom.repo.saveLayout(this.state.slug, this.placements());
  }

  async onDispose() {
    this.kitchen?.dispose();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    await this.flush();
    registry.set(this.state.slug, 0);
  }

  /** public live count: real people only, the park's AI locals are not visitors */
  private publishLive() {
    registry.set(this.state.slug, humanCount(this.state.players.keys(), (id) => !!this.bots?.has(id)));
  }

  /** Nearest unoccupied tile to the room centre (Manhattan order, so neighbours before diagonals). */
  private freeSpawnTile() {
    const c = Math.floor(this.size / 2);
    const taken = new Set<string>();
    this.state.players.forEach((q) => taken.add(`${Math.round(q.x)},${Math.round(q.y)}`));
    const tiles: Array<{ x: number; y: number; d: number }> = [];
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) tiles.push({ x, y, d: Math.abs(x - c) + Math.abs(y - c) });
    tiles.sort((a, b) => a.d - b.d);
    // don't drop people onto a seat
    const seats = new Set<string>();
    for (const p of this.placements()) {
      if (!furnitureDef(p.def)?.sit) continue;
      for (const [x, y] of tilesOf(p) ?? []) seats.add(`${x},${y}`);
    }
    const free = (t: { x: number; y: number }) => !taken.has(`${t.x},${t.y}`) && this.grid.walkable[t.y][t.x];
    return tiles.find((t) => free(t) && !seats.has(`${t.x},${t.y}`)) ?? tiles.find(free) ?? { x: c, y: c };
  }

  // ---- Love Meter: two queue lanes, auto-match of the heads, 30s video call, room-wide reveal
  private setupLove() {
    const love = (this.love = new LoveMeter());
    this.onMessage('love_join', (client, msg: { side?: unknown }) => {
      const u = client.auth as User | undefined;
      if (!u || !this.state.players.has(client.sessionId)) return;
      const side = msg?.side === 0 || msg?.side === 1 ? (msg.side as LoveSide) : null;
      if (side === null) return this.reject(client, 'bad_request');
      if (!this.editLimit.allow(client.sessionId)) return this.reject(client, 'rate_limited');
      const err = love.join(client.sessionId, u.id, side);
      if (err) return this.reject(client, err);
      this.loveSync();
    });
    this.onMessage('love_leave', (client) => this.loveLeave(client.sessionId));
    this.onMessage('love_vibe', (client, msg: unknown) => {
      const v = normalizeVibe(msg);
      if (v) love.vibe(client.sessionId, v);
    });
    // setSimulationInterval is single-slot (movement owns it); the clock is ticked by it
    this.clock.setInterval(() => {
      const events = love.tick(Date.now(), (id) => this.state.players.has(id) && this.calls.get(id).kind === 'idle');
      for (const e of events) this.onLoveEvent(e);
      if (events.length) this.loveSync();
    }, 250);
  }

  private clientOf(id: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === id);
  }

  private handleOf(id: string): string {
    return this.state.players.get(id)?.handle ?? '?';
  }

  private loveLeave(id: string) {
    const love = this.love;
    if (!love) return;
    const queued = love.sideOf(id) !== null;
    this.loveSpots.delete(id);
    const ev = love.leave(id);
    if (ev) this.onLoveEvent(ev);
    if (ev || queued) this.loveSync();
  }

  private onLoveEvent(e: LoveEvent) {
    const love = this.love!;
    if (e.kind === 'match') {
      [e.a, e.b].forEach((id, i) => {
        this.loveSpots.delete(id);
        const p = this.state.players.get(id);
        if (p) this.sim.requestMove(id, p, LOVE_SEATS[i]);
      });
      // media connects during the 5s countdown so the 30s are all talk
      if (this.calls.pair(e.a, e.b, true)) {
        this.clientOf(e.a)?.send('call_start', { peer: e.b, video: true, initiator: true });
        this.clientOf(e.b)?.send('call_start', { peer: e.a, video: true, initiator: false });
        this.broadcast('call_state', { a: e.a, b: e.b, on: true });
      }
    } else if (e.kind === 'reveal') {
      this.endLoveCall(e.a, e.b, 'love_done', 'love_done');
      this.loveRecent = [{ ah: this.handleOf(e.a), bh: this.handleOf(e.b), score: e.score }, ...this.loveRecent].slice(0, 5);
    } else if (e.kind === 'abort') {
      const stayer = e.left === e.a ? e.b : e.a;
      this.endLoveCall(e.left, stayer, 'ended', 'love_left');
      if (this.state.players.has(stayer)) love.requeueFront(stayer, stayer === e.a ? 0 : 1);
    }
  }

  /** End the pair's call if it is still up; `a` hears reasonA, `b` hears reasonB. */
  private endLoveCall(a: string, b: string, reasonA: string, reasonB: string) {
    const s = this.calls.get(a);
    if (s.kind === 'idle' || s.peer !== b) return;
    this.calls.clear(a);
    this.clientOf(a)?.send('call_end', { reason: reasonA });
    this.clientOf(b)?.send('call_end', { reason: reasonB });
    if (s.kind === 'active') this.broadcast('call_state', { a, b, on: false });
  }

  /** Walk queued people to their lane slot (the belt "pulls" everyone forward) and tell the room. */
  private loveSync() {
    const love = this.love;
    if (!love) return;
    love.lanes.forEach((lane, side) =>
      lane.forEach((id, i) => {
        const spot = laneSpot(side as LoveSide, i);
        const key = `${spot.x},${spot.y}`;
        if (this.loveSpots.get(id) === key) return;
        const p = this.state.players.get(id);
        if (p && this.sim.requestMove(id, p, spot)) this.loveSpots.set(id, key);
      }),
    );
    this.broadcast('love', this.loveSnapshot());
  }

  private loveSnapshot(): LoveSnapshot {
    const love = this.love!;
    const p = love.pair;
    return {
      lanes: [[...love.lanes[0]], [...love.lanes[1]]],
      pair: p && {
        a: p.a,
        b: p.b,
        ah: this.handleOf(p.a),
        bh: this.handleOf(p.b),
        phase: p.phase,
        left: Math.max(0, p.until - Date.now()),
        score: p.score,
      },
      recent: this.loveRecent,
    };
  }

  /** Push a resolved round to both sides; pays the winner when the duel is over. */
  private sendRound(a: string, b: string, r: { winner: 'a' | 'b' | 'draw'; picks: [number, number]; score: [number, number]; done: boolean }) {
    const payload = { winner: r.winner, picks: r.picks, score: r.score, done: r.done };
    for (const id of [a, b]) this.clients.find((c) => c.sessionId === id)?.send('duel_round', payload);
    if (!r.done) {
      for (const id of [a, b]) if (this.bots?.has(id)) this.botPick(id);
      return;
    }
    const bot = [a, b].find((id) => this.bots?.has(id));
    if (bot) {
      const botWon = bot === a ? r.score[0] > r.score[1] : r.score[1] > r.score[0];
      this.clock.setTimeout(() => this.broadcast('chat', { id: bot, text: botWon ? 'gg ez 😎' : 'gg, rematch later!' }), 1200);
    }
    const winner = r.score[0] > r.score[1] ? a : r.score[1] > r.score[0] ? b : null;
    const wc = winner ? this.clients.find((c) => c.sessionId === winner) : undefined;
    const u = wc?.auth as User | undefined;
    if (wc && u) void GameRoom.repo.creditCoins(u.id, DUEL_REWARD).then((coins) => wc.send('coins', { coins, earned: DUEL_REWARD }));
    this.broadcast('duel_over', { a, b, winner });
  }

  /** Kitchen world: stand on a crew rug, press start, cook in a private kitchen room. */
  private setupKitchen() {
    const limit = new RateLimiter(10, 5000);
    this.kitchen = new KitchenLobby(
      {
        players: () =>
          this.clients.flatMap((c) => {
            const p = this.state.players.get(c.sessionId);
            return p ? [{ sessionId: c.sessionId, userId: p.userId, handle: p.handle, x: p.x, y: p.y, moving: p.moving }] : [];
          }),
        send: (id, type, data) => this.clients.find((c) => c.sessionId === id)?.send(type, data),
        walkTo: (id, x, y) => {
          const p = this.state.players.get(id);
          if (p) this.sim.requestMove(id, p, { x, y });
        },
      },
      async (o) => (await matchMaker.createRoom('kitchen', { ...o, key: ROUND_KEY })).roomId,
    );
    this.onMessage('k_start', (client) => {
      if (limit.allow(client.sessionId)) void this.kitchen?.start(client.sessionId);
    });
    this.onMessage('k_code', (client, msg: { code?: unknown }) => {
      if (limit.allow(client.sessionId)) this.kitchen?.join(client.sessionId, msg?.code);
    });
    this.clock.setInterval(() => this.kitchen?.tick(), 250);
  }

  /** Who sits in each game table's chairs, so the book can start a match or clear a wait. */
  private syncTables() {
    const placements = this.placements();
    const events: TableEvent[] = [];
    for (const t of placements) {
      const kind = GAME_TABLE_KIND[t.def];
      if (!kind) continue;
      const seated: string[] = [];
      for (const chair of tableChairs(t, placements)) {
        for (const c of this.clients) {
          const p = this.state.players.get(c.sessionId);
          if (p && !p.moving && Math.round(p.x) === chair.x && Math.round(p.y) === chair.y) seated.push(c.sessionId);
        }
      }
      events.push(...this.tables.syncTable(t.id, kind, seated));
    }
    if (events.length) this.dispatchTables(events);
  }

  /** Turn table-game events into messages, coins and table lights. */
  private dispatchTables(events: TableEvent[]) {
    if (!events.length) return;
    const sendTo = (id: string, type: string, data: unknown) => this.clients.find((c) => c.sessionId === id)?.send(type, data);
    for (const e of events) {
      if (e.type === 'status') sendTo(e.to, 'tg_status', { phase: e.phase, kind: e.kind });
      else if (e.type === 'end') sendTo(e.to, 'tg_end', { reason: e.reason });
      else if (e.type === 'state') this.sendTableState(e.match);
      else this.payTable(e.match, e.winner);
    }
    const live = this.tables.liveTables();
    this.state.furniture.forEach((f, id) => {
      if (GAME_TABLE_KIND[f.def] && f.on !== live.has(id)) f.on = live.has(id);
    });
  }

  private sendTableState(m: Match) {
    const names = m.players.map((id) => (isBot(id) ? 'Leypark Bot' : this.handleOf(id)));
    const seats = m.players.map((id) => (isBot(id) ? '' : id));
    const now = Date.now();
    m.players.forEach((id, seat) => {
      if (isBot(id)) return;
      this.clients
        .find((c) => c.sessionId === id)
        ?.send('tg_state', {
          id: m.id,
          kind: m.kind,
          you: seat,
          names,
          seats,
          state: m.state,
          turnLeft: Math.max(0, m.deadline - now),
          rematch: m.rematch,
          bot: m.players.some(isBot),
          round: m.round,
          over: m.over,
          table: m.table,
        });
    });
  }

  /** Winner earns coins (less against the bot) and everyone sees a cheer over their head. */
  private payTable(m: Match, winner: string | null) {
    if (!winner || isBot(winner)) return;
    const reward = m.players.some(isBot) ? TABLE_BOT_REWARD : TABLE_REWARD;
    const c = this.clients.find((x) => x.sessionId === winner);
    const u = c?.auth as User | undefined;
    if (c && u) void GameRoom.repo.creditCoins(u.id, reward).then((coins) => c.send('coins', { coins, earned: reward }));
    this.broadcast('emote', { id: winner, i: 0 });
  }

  /** Spawn the lobby locals as players and start their brain. */
  private spawnBots() {
    const crew = new BotCrew({
      grid: () => this.grid,
      seats: () => {
        const out: Array<{ x: number; y: number }> = [];
        for (const p of this.placements()) {
          if (!furnitureDef(p.def)?.sit) continue;
          for (const [x, y] of tilesOf(p) ?? []) out.push({ x, y });
        }
        return out;
      },
      humans: () =>
        this.clients
          .filter((c) => this.state.players.has(c.sessionId))
          .map((c) => {
            const p = this.state.players.get(c.sessionId)!;
            return { id: c.sessionId, handle: p.handle, x: Math.round(p.x), y: Math.round(p.y) };
          }),
      mover: (id) => this.state.players.get(id),
      requestMove: (id, t) => {
        const p = this.state.players.get(id);
        return !!p && this.sim.requestMove(id, p, t);
      },
      say: (id, text) => this.broadcast('chat', { id, text: censor(sanitizeChat(text) ?? text) }),
      emote: (id, i) => this.broadcast('emote', { id, i }),
    });
    this.bots = crew;
    // start the locals already spread around the park, like regulars who were here before you,
    // instead of all appearing on the arrival tile and walking out
    const avoid = new Set<string>();
    for (const pl of this.placements()) {
      if (!furnitureDef(pl.def)?.sit) continue;
      for (const [x, y] of tilesOf(pl) ?? []) avoid.add(`${x},${y}`);
    }
    this.state.players.forEach((q) => avoid.add(`${Math.round(q.x)},${Math.round(q.y)}`));
    const c = Math.floor(this.size / 2);
    const starts = scatterSpawns(this.grid, PERSONAS.length, { center: { x: c, y: c }, clearRadius: 4, avoid, minGap: 5 });
    PERSONAS.forEach((persona, i) => {
      const info = BotCrew.spawnInfo(persona);
      const p = new Player();
      p.handle = info.handle;
      p.userId = persona.id;
      p.avatar = info.avatar;
      const spawn = starts[i] ?? this.freeSpawnTile();
      p.x = spawn.x;
      p.y = spawn.y;
      this.state.players.set(persona.id, p);
    });
    this.clock.setInterval(() => crew.tick(), 1000);
  }

  /** a bot throws its hand after a human-ish pause */
  private botPick(id: string) {
    this.clock.setTimeout(() => {
      const d = this.duels.get(id);
      if (!d || !this.bots) return;
      const r = this.duels.pick(id, this.bots.duelPick());
      if (r && r !== 'waiting') this.sendRound(d.a, d.b, r);
    }, 1500 + Math.random() * 2500);
  }

  onLeave(client: Client) {
    this.kitchen?.leave(client.sessionId);
    this.loveLeave(client.sessionId);
    const duelPeer = this.duels.end(client.sessionId);
    if (duelPeer) this.clients.find((c) => c.sessionId === duelPeer)?.send('duel_end', { reason: 'left' });
    this.dispatchTables(this.tables.leave(client.sessionId));
    this.tableLimit.forget(client.sessionId);
    this.love?.forget(client.sessionId);
    const wasActive = this.calls.get(client.sessionId).kind === 'active';
    const peer = this.calls.clear(client.sessionId);
    if (peer) {
      this.clients.find((c) => c.sessionId === peer)?.send('call_end', { reason: 'left' });
      if (wasActive) this.broadcast('call_state', { a: client.sessionId, b: peer, on: false });
    }
    this.sim.remove(client.sessionId);
    this.blocks.leave(client.sessionId);
    this.reportLimit.forget(client.sessionId);
    this.blockLimit.forget(client.sessionId);
    this.chatLimit.forget(client.sessionId);
    this.emoteLimit.forget(client.sessionId);
    this.avatarLimit.forget(client.sessionId);
    this.voiceLimit.forget(client.sessionId);
    this.gearUseLimit.forget(client.sessionId);
    this.useLimit.forget(client.sessionId);
    this.chanceLimit.forget(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.publishLive();
    if (process.env.DOVEY_DEBUG) console.log('[leave]', this.state.slug, 'now', this.state.players.size);
  }
}
