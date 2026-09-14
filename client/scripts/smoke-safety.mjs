/**
 * End-to-end check of the safety path against a running server:
 * block hides chat both ways, reports reach the moderation queue, and a
 * blocked pair cannot ring each other.
 *
 *   MOD_TOKEN=devmod node client/scripts/smoke-safety.mjs [roomSlug]
 *
 * Needs the server running with the same MOD_TOKEN.
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2567';
const WS = API.replace(/^http/, 'ws');
const MOD_TOKEN = process.env.MOD_TOKEN ?? 'devmod';
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

const tokenA = 'safetySmokeA' + '0'.repeat(24);
const tokenB = 'safetySmokeB' + '1'.repeat(24);
const a = await me(tokenA);
const b = await me(tokenB);
console.log('users:', a.handle, b.handle);

const client = new Client(WS);
const roomA = await client.joinOrCreate('room', { slug: SLUG, token: tokenA });
const roomB = await client.joinOrCreate('room', { slug: SLUG, token: tokenB });
await wait(600);

const heardByA = [];
const sysA = [];
roomA.onMessage('chat', (m) => heardByA.push(m.text));
roomA.onMessage('sys', (m) => sysA.push(m.code));

roomB.send('chat', { text: 'before block' });
await wait(600);

roomA.send('block', { id: roomB.sessionId });
await wait(900);

roomB.send('chat', { text: 'after block' });
await wait(700);

roomA.send('report', { id: roomB.sessionId, reason: 'grooming', note: 'asked my age' });
await wait(700);

// a blocked pair must not be able to ring each other
roomA.send('call_invite', { to: roomB.sessionId, video: false });
await wait(600);

console.log('heardByA:', heardByA);
console.log('sysA:', sysA);

const reports = await fetch(`${API}/api/mod/reports`, { headers: { 'x-mod-token': MOD_TOKEN } }).then((r) => r.json());
console.log('reports:', reports.map((r) => `${r.reporter}->${r.target} ${r.reason} "${r.context}"`));

const ok =
  heardByA.includes('before block') &&
  !heardByA.includes('after block') &&
  sysA.includes('blocked') &&
  sysA.includes('reported') &&
  sysA.includes('blocked_pair') &&
  reports.some((r) => r.reason === 'grooming');
console.log(ok ? 'PASS' : 'FAIL');

await roomA.leave();
await roomB.leave();
process.exit(ok ? 0 : 1);
