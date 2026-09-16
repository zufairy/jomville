import { Client, Room, ServerError } from 'colyseus';
import { RateLimiter, kitchen, normalizeAvatar, serializeAvatar } from '@dovey/shared';
import type { Repo, User } from '../repo';
import { sanitizeInput } from './input';
import { KitchenRewards, grantPerUser } from './rewards';
import { rounds, isRoundKey } from './rounds';

export interface KitchenCreate {
  level: string;
  seed: number;
  userIds: string[];
  roundTime?: number;
  key: string;
}

const INPUT_BUFFER = 4;
const RESULTS_LINGER_MS = 60_000;
const NOBODY_CAME_MS = 30_000;

/**
 * One cooking round. Server-authoritative 30Hz simulation; clients send inputs
 * and get delta snapshots 20/s (full every 2s). Only the crew's users may join.
 */
export class KitchenRoom extends Room {
  static repo: Repo;
  static rewards = new KitchenRewards();
  maxClients = kitchen.CREW_MAX;
  private sim!: kitchen.KitchenState;
  private allowed = new Set<string>();
  private handles = new Map<string, string>();
  /** user id -> serialized avatar, sent on join only (never in k_snap) */
  private looks = new Map<string, string>();
  private queues = new Map<string, kitchen.KitchenInput[]>();
  private last = new Map<string, kitchen.KitchenInput>();
  private limit = new RateLimiter(40, 1000);
  private sentRev = 0;
  private ended = false;
  private results = new Map<string, { score: number; stars: number; served: number; failed: number; earned: number }>();

  async onCreate(o: KitchenCreate) {
    if (!isRoundKey(o?.key)) throw new ServerError(403, 'kitchen rooms are created by the lobby');
    if (!kitchen.levelDef(String(o?.level))) throw new ServerError(400, 'bad level');
    this.allowed = new Set(Array.isArray(o.userIds) ? o.userIds.map(String) : []);
    const roundTime = typeof o.roundTime === 'number' && o.roundTime >= 10 && o.roundTime <= 600 ? o.roundTime : kitchen.ROUND_TIME;
    this.sim = kitchen.createKitchen(o.level, Number(o.seed) | 0, [], roundTime);
    await this.setPrivate(true);
    this.onMessage('k_in', (client, m: unknown) => this.onInput(client, m));
    this.onMessage('k_ping', (client, m: { t?: unknown }) => client.send('k_pong', { t: m?.t }));
    this.setSimulationInterval(() => this.tick(), 1000 / kitchen.K_TICK_HZ);
    this.clock.setInterval(() => this.sendSnap(false), 1000 / kitchen.K_SNAP_HZ);
    this.clock.setInterval(() => this.sendSnap(true), 2000);
    this.clock.setTimeout(() => {
      if (!this.clients.length) void this.disconnect();
    }, NOBODY_CAME_MS);
  }

  async onAuth(_client: Client, options: { token?: unknown }): Promise<User> {
    const user = await KitchenRoom.repo.userByToken(options?.token);
    if (!user || !user.linked || !user.onboarded || !this.allowed.has(user.id)) throw new ServerError(403, 'not in this crew');
    return user;
  }

  onJoin(client: Client, _options: unknown, user: User) {
    this.handles.set(user.id, user.handle);
    // the stored look (owned cosmetics only, checked when it was saved), normalized again here;
    // clients can't rely on the world roster: crewmates may come from another room
    this.looks.set(user.id, serializeAvatar(normalizeAvatar(user.avatar)));
    kitchen.addChef(this.sim, user.id);
    if (!this.queues.has(user.id)) this.queues.set(user.id, []);
    const names = Object.fromEntries(this.handles);
    const looks = Object.fromEntries(this.looks);
    client.send('k_hello', { you: user.id, level: this.sim.level, names, looks });
    this.broadcast('k_roster', { names, looks }, { except: client });
    client.send('k_snap', kitchen.makeSnap(this.sim, 0, true));
  }

  async onLeave(client: Client, consented: boolean) {
    const u = client.auth as User | undefined;
    this.limit.forget(client.sessionId);
    if (!u) return;
    this.last.delete(u.id); // freeze the chef instead of replaying its last stick
    this.queues.set(u.id, []);
    if (!consented && !this.ended) {
      this.broadcast('k_away', { id: u.id, away: true });
      try {
        const back = await this.allowReconnection(client, kitchen.RECONNECT_SECONDS);
        this.broadcast('k_away', { id: u.id, away: false });
        back.send('k_snap', kitchen.makeSnap(this.sim, 0, true));
        return;
      } catch {
        /* window expired */
      }
    } else if (!consented && this.ended) {
      try {
        const back = await this.allowReconnection(client, kitchen.RECONNECT_SECONDS);
        back.send('k_snap', kitchen.makeSnap(this.sim, 0, true));
        const result = this.results.get(u.id);
        if (result) back.send('k_result', result);
        return;
      } catch {
        /* window expired */
      }
    }
    if (this.clients.some((c) => (c.auth as User | undefined)?.id === u.id)) return; // another tab still in
    rounds.emit('left', this.roomId, u.id);
    kitchen.removeChef(this.sim, u.id);
    this.queues.delete(u.id);
    this.broadcast('k_away', { id: u.id, away: false });
  }

  onDispose() {
    rounds.emit('done', this.roomId);
  }

  private onInput(client: Client, m: unknown) {
    const u = client.auth as User | undefined;
    if (!u || !this.limit.allow(client.sessionId)) return;
    const inp = sanitizeInput(m);
    const q = this.queues.get(u.id);
    if (!inp || !q) return;
    q.push(inp);
    if (q.length > INPUT_BUFFER) {
      const dropped = q.shift()!;
      q[0].grab ||= dropped.grab;
      q[0].dash ||= dropped.dash;
    }
  }

  private tick() {
    if (this.ended) return;
    const inputs: Record<string, kitchen.KitchenInput> = {};
    for (const [id, q] of this.queues) {
      const next = q.shift();
      if (next) {
        inputs[id] = next;
        this.last.set(id, { ...next, grab: false, dash: false });
      } else {
        const prev = this.last.get(id);
        if (prev) inputs[id] = prev; // a late packet: keep walking, never repeat a press
      }
    }
    for (const e of kitchen.step(this.sim, inputs)) {
      if (e.type === 'end') void this.finish(e);
      else this.broadcast('k_event', e);
    }
  }

  private sendSnap(full: boolean) {
    if (!this.clients.length) return;
    const snap = kitchen.makeSnap(this.sim, this.sentRev, full);
    this.sentRev = this.sim.rev;
    this.broadcast('k_snap', snap);
  }

  private async finish(e: Extract<kitchen.KitchenEvent, { type: 'end' }>) {
    this.ended = true;
    // the crew can start a new round now; this room only lingers for the results screens
    rounds.emit('ended', this.roomId);
    this.sendSnap(true);
    const userIds = [...new Set(this.clients.map((c) => (c.auth as User | undefined)?.id).filter((id): id is string => !!id))];
    const earnedByUser = grantPerUser(KitchenRoom.rewards, userIds, e.stars);
    const credits: Array<Promise<unknown>> = [];
    for (const [userId, earned] of earnedByUser) {
      this.results.set(userId, { score: e.score, stars: e.stars, served: e.served, failed: e.failed, earned });
      if (earned) credits.push(Promise.resolve(KitchenRoom.repo.creditCoins(userId, earned)).catch((err) => console.error('[kitchen] coin credit failed', userId, err)));
    }
    // results go out after the coins land, so the client's wallet refetch sees the payout
    await Promise.all(credits);
    for (const c of this.clients) {
      const u = c.auth as User | undefined;
      if (!u) continue;
      const result = this.results.get(u.id);
      if (result) c.send('k_result', result);
    }
    this.clock.setTimeout(() => void this.disconnect(), RESULTS_LINGER_MS);
  }
}
