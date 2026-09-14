import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { RateLimiter, SYSTEM_ROOMS, furnitureDef, isInstanceDef } from '@dovey/shared';
import { Repo } from './repo';
import { registry } from './registry';
import { presence } from './social';
import { wardrobe } from './vending';
import { DAILY_CREDITS } from '@dovey/shared';
import { iceServersFromEnv } from './ice';
import { friendCalls } from './social-calls';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const oauth = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const tokenOf = (body: unknown): string => {
  const t = (body as { token?: unknown })?.token;
  return typeof t === 'string' && t.length >= 16 && t.length <= 128 ? t : '';
};

/**
 * Small HTTP API next to the Colyseus endpoint.
 *   GET /api/me?token=          -> { handle, home }   (creates the user on first sight)
 *   GET /api/rooms?sort=busy|new|top -> [{ slug, name, owner, category, live, visitors24h }]
 *   GET /api/rooms/random?not=  -> { slug } random *populated* public room, else random public
 */
export function buildApi(repo: Repo) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  const meJson = async (user: { id: string; handle: string; avatar: unknown; onboarded: boolean; linked: boolean }) => ({
    handle: user.handle,
    home: await repo.homeRoom(user.id),
    lobby: SYSTEM_ROOMS[0].slug,
    avatar: user.avatar,
    onboarded: user.onboarded,
    linked: user.linked,
    googleEnabled: !!oauth,
  });

  app.post('/api/me', async (req, res) => {
    const token = tokenOf(req.body);
    if (!token) return res.status(400).json({ error: 'bad token' });
    let user = await repo.userByToken(token);
    if (!user) user = await repo.createUser(token, req.body?.avatar);
    res.json(await meJson(user));
  });

  /** Onboarding: set handle and/or mark onboarded. */
  app.patch('/api/me', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    if (typeof req.body?.handle === 'string') {
      const h = req.body.handle.trim().toLowerCase();
      if (!(await repo.setHandle(user.id, h))) return res.status(409).json({ error: 'handle taken or invalid' });
    }
    if (req.body?.onboarded === true) await repo.setOnboarded(user.id);
    res.json(await meJson((await repo.userById(user.id))!));
  });

  // ---- friends
  const userOf = async (body: unknown) => {
    const t = tokenOf(body);
    return t ? repo.userByToken(t) : null;
  };
  const idOf = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : '');

  // 20 writes/min per user across request/respond/cancel/remove
  const friendWriteLimit = new RateLimiter(20, 60_000);
  // at most one "friend_request" push notify per (from, to) pair per 10 min; the request is still stored either way
  const friendRequestNotifyLimit = new RateLimiter(1, 10 * 60_000);
  // 60 list reads/min per user
  const friendListLimit = new RateLimiter(60, 60_000);

  app.post('/api/friends', async (req, res) => {
    const u = await userOf(req.body);
    if (!u) return res.status(401).json({ error: 'unknown' });
    if (!friendListLimit.allow(u.id)) return res.status(429).json({ error: 'rate_limited' });
    const [friends, pending] = await Promise.all([repo.friendsOf(u.id), repo.pendingOf(u.id)]);
    res.json({
      friends: friends.map((f) => ({ ...f, online: presence.isOnline(f.id), room: presence.where(f.id) })),
      incoming: pending.incoming,
      outgoing: pending.outgoing,
    });
  });

  app.post('/api/friends/request', async (req, res) => {
    const u = await userOf(req.body);
    if (!u) return res.status(401).json({ error: 'unknown' });
    if (!friendWriteLimit.allow(u.id)) return res.status(429).json({ result: 'rate_limited' });
    const to = idOf(req.body?.toUserId);
    if (!to) return res.status(400).json({ error: 'bad request' });
    const result = await repo.requestFriend(u.id, to);
    if (result === 'sent' && friendRequestNotifyLimit.allow(`${u.id}:${to}`)) {
      presence.notify(to, 'friend_request', { from: { id: u.id, handle: u.handle } });
    }
    if (result === 'accepted') {
      presence.notify(to, 'friend_update', {});
      presence.notify(u.id, 'friend_update', {});
    }
    res.json({ result });
  });

  app.post('/api/friends/respond', async (req, res) => {
    const u = await userOf(req.body);
    if (!u) return res.status(401).json({ error: 'unknown' });
    if (!friendWriteLimit.allow(u.id)) return res.status(429).json({ result: 'rate_limited' });
    const from = idOf(req.body?.fromUserId);
    if (!from || typeof req.body?.accept !== 'boolean') return res.status(400).json({ error: 'bad request' });
    const result = await repo.respondFriend(u.id, from, req.body.accept);
    if (result === 'accepted' || result === 'declined') presence.notify(from, 'friend_update', {});
    res.json({ result });
  });

  app.post('/api/friends/cancel', async (req, res) => {
    const u = await userOf(req.body);
    if (!u) return res.status(401).json({ error: 'unknown' });
    if (!friendWriteLimit.allow(u.id)) return res.status(429).json({ result: 'rate_limited' });
    const to = idOf(req.body?.toUserId);
    if (!to) return res.status(400).json({ error: 'bad request' });
    if (await repo.cancelFriendRequest(u.id, to)) presence.notify(to, 'friend_update', {});
    res.json({ result: 'ok' });
  });

  app.post('/api/friends/remove', async (req, res) => {
    const u = await userOf(req.body);
    if (!u) return res.status(401).json({ error: 'unknown' });
    if (!friendWriteLimit.allow(u.id)) return res.status(429).json({ result: 'rate_limited' });
    const other = idOf(req.body?.userId);
    if (!other) return res.status(400).json({ error: 'bad request' });
    if (await repo.removeFriend(u.id, other)) presence.notify(other, 'friend_update', {});
    friendCalls.endBetween(u.id, other);
    res.json({ result: 'ok' });
  });

  /** Sign in with Google: verify the ID token server-side, link to this device's user. */
  app.post('/api/auth/google', async (req, res) => {
    if (!oauth) return res.status(503).json({ error: 'google sign-in not configured' });
    const token = tokenOf(req.body);
    const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
    if (!token || !credential) return res.status(400).json({ error: 'bad request' });
    let payload;
    try {
      const ticket = await oauth.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'invalid google token' });
    }
    if (!payload?.sub) return res.status(401).json({ error: 'invalid google token' });
    let device = await repo.userByToken(token);
    if (!device) device = await repo.createUser(token, req.body?.avatar);
    const user = await repo.linkGoogle(token, device, { sub: payload.sub, email: payload.email, name: payload.name });
    res.json(await meJson(user));
  });

  /** Coins + owned (unplaced) furniture. */
  app.post('/api/inventory', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    res.json(await repo.inventory(user.id));
  });

  app.post('/api/shop/buy', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    const def = typeof req.body?.def === 'string' ? req.body.def : '';
    const d = furnitureDef(def);
    if (d && isInstanceDef(d)) {
      const r = await repo.buyInstance(user.id, def);
      if (!r.ok) return res.status(400).json({ error: r.reason });
      return res.json(await repo.inventory(user.id));
    }
    const qty = Number(req.body?.qty ?? 1);
    const r = await repo.buy(user.id, def, qty);
    if (!r.ok) return res.status(400).json({ error: r.reason });
    res.json(await repo.inventory(user.id));
  });

  /** LTD stock for the shop: { def: { sold, cap } } */
  app.get('/api/shop/stock', async (_req, res) => {
    res.set('cache-control', 'no-cache');
    res.json(await repo.ltdStock());
  });

  /** Owned cosmetic ids + credits. */
  app.post('/api/wardrobe', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    res.json({ owned: await wardrobe(repo, user.id), credits: await repo.coins(user.id) });
  });

  /** Daily credits, once per 20h. */
  app.post('/api/daily', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    res.json(await repo.claimDaily(user.id, DAILY_CREDITS));
  });

  /** ICE servers for calls: STUN, plus TURN when configured. Signed-in devices only (TURN costs money). */
  app.post('/api/ice', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    res.set('cache-control', 'no-store');
    res.json({ iceServers: iceServersFromEnv() });
  });

  /** One-time 18+ confirmation, needed before calling someone who is not a friend. */
  app.post('/api/me/adult', async (req, res) => {
    const token = tokenOf(req.body);
    const user = token ? await repo.userByToken(token) : null;
    if (!user) return res.status(401).json({ error: 'unknown' });
    await repo.confirmAdult(user.id);
    res.json({ adultConfirmed: true });
  });

  /**
   * Moderation queue. Gated by MOD_TOKEN; without it the endpoint is off, so a
   * deployment that forgets to set one cannot leak reports.
   */
  const MOD_TOKEN = process.env.MOD_TOKEN ?? '';
  const isMod = (req: { headers: Record<string, unknown> }) =>
    !!MOD_TOKEN && req.headers['x-mod-token'] === MOD_TOKEN;

  app.get('/api/mod/reports', async (req, res) => {
    if (!isMod(req as never)) return res.status(404).json({ error: 'not found' });
    res.json(await repo.openReports());
  });

  /** A user's last 50 trades (both sides, offers with serials), for judging scam reports. */
  app.get('/api/mod/trades', async (req, res) => {
    if (!isMod(req as never)) return res.status(404).json({ error: 'not found' });
    const user = typeof req.query.user === 'string' ? req.query.user : '';
    if (!user) return res.status(400).json({ error: 'bad user' });
    res.json(await repo.tradesFor(user, 50));
  });

  app.post('/api/mod/reports/:id', async (req, res) => {
    if (!isMod(req as never)) return res.status(404).json({ error: 'not found' });
    const id = Number(req.params.id);
    const status = req.body?.status === 'actioned' ? 'actioned' : 'dismissed';
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    await repo.resolveReport(id, status);
    res.json({ ok: true });
  });

  app.get('/api/rooms', async (req, res) => {
    const sort = req.query.sort === 'new' ? 'new' : req.query.sort === 'top' ? 'top' : 'busy';
    // kind=personal: only houses players own, none of the app's system rooms
    const personal = req.query.kind === 'personal';
    const system = new Map(SYSTEM_ROOMS.map((s) => [s.slug, s]));
    const rows = await repo.listPublic(sort === 'new' ? 'new' : 'top', personal ? 200 : 60);
    const withLive = rows
      .filter((r) => !personal || !system.has(r.slug))
      .map((r) => ({ ...r, live: registry.get(r.slug), system: system.has(r.slug), featured: !!system.get(r.slug)?.featured }));
    if (sort === 'busy') withLive.sort((a, b) => b.live - a.live || b.visitors24h - a.visitors24h);
    if (personal) return res.json(withLive.slice(0, 60));
    // system rooms (lobby, harbor) are always the first doors, in their canonical order
    const pinned = SYSTEM_ROOMS.map((sr) => withLive.find((r) => r.slug === sr.slug)).filter((r): r is NonNullable<typeof r> => !!r);
    pinned.sort((a, b) => Number(b.featured) - Number(a.featured)); // featured rooms lead the list
    const rest = withLive.filter((r) => !pinned.includes(r));
    withLive.splice(0, withLive.length, ...pinned, ...rest);
    res.json(withLive.slice(0, 40));
  });

  /** Floor, theme and furniture of a public room, for the room browser's card thumbnails. */
  app.get('/api/rooms/:slug/preview', async (req, res) => {
    const row = await repo.room(req.params.slug);
    if (!row || !row.is_public) return res.status(404).json({ error: 'not found' });
    res.set('cache-control', 'public, max-age=30');
    res.json({ size: row.size, theme: row.theme, mask: row.mask, style: row.style, layout: row.layout });
  });

  app.get('/api/rooms/random', async (req, res) => {
    const not = typeof req.query.not === 'string' ? req.query.not : '';
    const publicRooms = await repo.listPublic('top', 200);
    const isPublic = new Set(publicRooms.map((r) => r.slug));
    const populated = registry.populated().filter((r) => r.slug !== not && isPublic.has(r.slug));
    if (populated.length) {
      // weight toward busier rooms but keep some spread
      const pick = populated[Math.floor(Math.random() * Math.min(populated.length, 5))];
      return res.json({ slug: pick.slug, live: pick.count });
    }
    const others = publicRooms.filter((r) => r.slug !== not);
    if (!others.length) return res.status(404).json({ error: 'no rooms' });
    const r = others[Math.floor(Math.random() * others.length)];
    res.json({ slug: r.slug, live: 0 });
  });

  return app;
}
