// Two (three) headless clients in different rooms exercise friend-call signaling end to end.
// Usage: server on 2597, then `node client/scripts/friend-call-smoke.mjs`
//
// Note: run the server in dev mode (`pnpm --filter @dovey/server dev`), not `pnpm start`
// (NODE_ENV=production) — production trade gates don't affect calls, but dev mode is the
// simplest way to sidestep any production-only startup behavior for a throwaway smoke DB.
import { randomBytes } from 'node:crypto';
import { Client } from 'colyseus.js';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:2597';
const WS = BASE.replace(/^http/, 'ws');
const token = () => randomBytes(16).toString('hex');

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** join a room and keep every message in an inbox so nothing is missed between awaits */
async function join(slug, tok) {
  const room = await new Client(WS).joinOrCreate('room', { slug, token: tok });
  const inbox = [];
  const waiters = [];
  room.onMessage('*', (type, message) => {
    const i = waiters.findIndex((w) => w.type === type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(message);
    else inbox.push({ type, message });
  });
  const next = (type, ms = 5000) => {
    const i = inbox.findIndex((e) => e.type === type);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0].message);
    return new Promise((resolve, reject) => {
      const w = { type, resolve };
      waiters.push(w);
      setTimeout(() => {
        const k = waiters.indexOf(w);
        if (k >= 0) {
          waiters.splice(k, 1);
          reject(new Error(`${slug}: timeout waiting for ${type}`));
        }
      }, ms);
    });
  };
  const userId = await new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const p = room.state?.players?.get?.(room.sessionId);
      if (p?.userId) return resolve(p.userId);
      if (Date.now() - started > 5000) return reject(new Error(`${slug}: no player state`));
      setTimeout(check, 50);
    };
    check();
  });
  return { room, next, userId, send: (t, d) => room.send(t, d) };
}

async function main() {
  const [ta, tb, tc] = [token(), token(), token()];
  for (const t of [ta, tb, tc]) assert((await post('/api/me', { token: t })).status === 200, 'create user');

  const a = await join('mainlobby', ta);
  let b = await join('gameden', tb);
  const c = await join('casino', tc);
  console.log('1. three clients in three rooms');

  assert((await post('/api/friends/request', { token: ta, toUserId: b.userId })).json?.result === 'sent', 'friend request');
  assert((await post('/api/friends/respond', { token: tb, fromUserId: a.userId, accept: true })).json?.result === 'accepted', 'friend accept');
  console.log('2. a and b are friends');

  c.send('fcall_invite', { toUserId: a.userId, video: false });
  // The repo's GameRoom sends invite/report errors over `fcall_fail`, not `sys` (the brief's
  // draft predates that change). Assert against `fcall_fail` here.
  const fail = await c.next('fcall_fail');
  assert(fail.action === 'invite' && fail.code === 'not_friends', 'non-friend is refused');
  console.log('3. non-friend invite refused');

  a.send('fcall_invite', { toUserId: b.userId, video: true });
  await a.next('fcall_ringing');
  const inc = await b.next('fcall_incoming');
  assert(inc.from.id === a.userId && inc.video === true, 'incoming payload');
  b.send('fcall_accept');
  assert((await a.next('fcall_start')).initiator === true, 'caller is initiator');
  assert((await b.next('fcall_start')).initiator === false, 'callee answers');
  a.send('fsig', { toUserId: b.userId, data: { sdp: { type: 'offer', sdp: 'smoke' } } });
  assert((await b.next('fsig')).from === a.userId, 'signal relayed across rooms');
  console.log('4. rang, accepted, relayed across rooms');

  await b.room.leave();
  assert((await a.next('fcall_hold')).peer === b.userId, 'hold while b changes room');
  b = await join('wonderdome', tb);
  b.send('fcall_resume');
  assert((await b.next('fcall_rejoin')).initiator === false, 'b rejoins');
  assert((await a.next('fcall_rejoin')).initiator === true, 'a renegotiates');
  b.send('fsig', { toUserId: a.userId, data: { sdp: { type: 'answer', sdp: 'smoke' } } });
  assert((await a.next('fsig')).from === b.userId, 'signal after room change');
  console.log('5. b changed room within the grace and the call resumed');

  a.send('fcall_end');
  assert((await b.next('fcall_end')).reason === 'ended', 'hang up reaches b');
  // the server notifies both sides of a hangup; drain a's own confirmation too, or it
  // lingers in a's inbox and gets mistaken for the sweep's `lost` message in step 7.
  assert((await a.next('fcall_end')).reason === 'ended', 'hang up echoes back to a');
  console.log('6. hang up');

  await new Promise((r) => setTimeout(r, 10_500)); // pair rate limit (10 s)
  a.send('fcall_invite', { toUserId: b.userId, video: false });
  await b.next('fcall_incoming');
  b.send('fcall_accept');
  await a.next('fcall_start');
  await b.room.leave();
  await a.next('fcall_hold');
  assert((await a.next('fcall_end', 15_000)).reason === 'lost', 'grace expiry ends the call');
  console.log('7. no rejoin within 10 s ends the call');

  await a.room.leave();
  await c.room.leave();
  console.log('friend-call smoke: OK');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('friend-call smoke: FAIL -', e.message);
    process.exit(1);
  },
);
