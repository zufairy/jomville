/**
 * End-to-end check of proximity-voice signaling against a running server:
 * the mic flag syncs, signaling is relayed only while a mic is open and the
 * pair is close, and a block cuts the link both ways.
 *
 *   node client/scripts/smoke-voice.mjs [roomSlug]
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2567';
const WS = API.replace(/^http/, 'ws');
const SLUG = process.argv[2] ?? 'mainlobby';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function me(token) {
  const r = await fetch(`${API}/api/me`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return r.json();
}

const tokenA = 'voiceSmokeA' + '0'.repeat(25);
const tokenB = 'voiceSmokeB' + '1'.repeat(25);
await me(tokenA);
await me(tokenB);

const client = new Client(WS);
const roomA = await client.joinOrCreate('room', { slug: SLUG, token: tokenA });
const roomB = await client.joinOrCreate('room', { slug: SLUG, token: tokenB });
await wait(600);

// make sure no block from an earlier run is left over
roomA.send('unblock', { id: roomB.sessionId });
await wait(400);

const toB = [];
const toA = [];
const dropsA = [];
const dropsB = [];
roomB.onMessage('vrtc', (m) => toB.push(m));
roomA.onMessage('vrtc', (m) => toA.push(m));
roomA.onMessage('voice_drop', (m) => dropsA.push(m.id));
roomB.onMessage('voice_drop', (m) => dropsB.push(m.id));
for (const r of [roomA, roomB]) r.onMessage('sys', () => {});

const pos = (room, id) => {
  const p = room.state.players.get(id);
  return p ? { x: p.x, y: p.y, voice: p.voice } : null;
};
console.log('spawn A', pos(roomA, roomA.sessionId), 'B', pos(roomA, roomB.sessionId));

// 1. no mic open anywhere: an offer is refused and bounced back as bye
roomA.send('vrtc', { to: roomB.sessionId, data: { sdp: { type: 'offer', sdp: 'x' } } });
await wait(400);
const refusedClosed = toB.length === 0 && toA.some((m) => m.from === roomB.sessionId && m.data?.bye);

// 2. A opens the mic: the flag syncs to B and signaling reaches B
roomA.send('voice', { on: true });
await wait(400);
const flagSynced = roomB.state.players.get(roomA.sessionId)?.voice === true;
roomA.send('vrtc', { to: roomB.sessionId, data: { ice: { candidate: 'c1' } } });
await wait(400);
const relayed = toB.some((m) => m.from === roomA.sessionId && m.data?.ice?.candidate === 'c1');

// 3. a block drops the link on both sides and stops relaying
roomA.send('block', { id: roomB.sessionId });
await wait(900);
const before = toB.length;
roomA.send('vrtc', { to: roomB.sessionId, data: { ice: { candidate: 'c2' } } });
await wait(400);
const droppedBoth = dropsA.includes(roomB.sessionId) && dropsB.includes(roomA.sessionId);
const stoppedAfterBlock = toB.length === before;

roomA.send('unblock', { id: roomB.sessionId });
roomA.send('voice', { on: false });
await wait(400);

const checks = { refusedClosed, flagSynced, relayed, droppedBoth, stoppedAfterBlock };
console.log(checks);
const ok = Object.values(checks).every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');

await roomA.leave();
await roomB.leave();
process.exit(ok ? 0 : 1);
