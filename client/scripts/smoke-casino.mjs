/**
 * Casino smoke against a running server: A walks to booth 1 and rolls a
 * Dicemaster; B sees rolling -> the same face and the roll bubble; a far player
 * cannot roll; the dealer closes the die; LTD stock endpoint answers.
 *
 *   node client/scripts/smoke-casino.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2567';
const WS = API.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function me(token) {
  const r = await fetch(`${API}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  return r.json();
}

const checks = [];
const check = (label, ok) => {
  checks.push(!!ok);
  console.log(ok ? '  ok  ' : '  FAIL', label);
};

const tokenA = 'casinoSmokeA' + '0'.repeat(24);
const tokenB = 'casinoSmokeB' + '1'.repeat(24);
await me(tokenA);
await me(tokenB);

const stock = await (await fetch(`${API}/api/shop/stock`)).json();
check('ltd stock lists dragon_egg cap 50', stock.dragon_egg?.cap === 50);

const client = new Client(WS);
const A = await client.joinOrCreate('room', { slug: 'casino', token: tokenA });
const B = await client.joinOrCreate('room', { slug: 'casino', token: tokenB });
const chats = [];
for (const room of [A, B]) for (const t of ['emote', 'coins', 'sys', 'love', 'call_state', 'inventory_refresh', 'inventory_delta']) room.onMessage(t, () => {});
for (const room of [A, B]) room.onMessage('chat', () => {});
A.onMessage('roll', () => {});
B.onMessage('roll', (m) => chats.push(m));
await wait(800);

let dieId = null;
A.state.furniture.forEach((f, id) => {
  if (f.def === 'dicemaster' && f.x === 3 && f.y === 5) dieId = id;
});
check('casino has booth dicemaster at 3,5', !!dieId);

A.send('move', { x: 4, y: 6 });
B.send('move', { x: 10, y: 18 });
await wait(4000);

A.send('furn_use', { id: dieId });
await wait(300);
check('B sees rolling state', B.state.furniture.get(dieId)?.state === '-1');
await wait(1600);
const face = B.state.furniture.get(dieId)?.state;
check(`B sees a face 1-6 (got ${face})`, /^[1-6]$/.test(face ?? ''));
check('A and B agree', A.state.furniture.get(dieId)?.state === face);
check('B got the roll bubble', chats.some((c) => c.id === A.sessionId && c.text === `🎲 rolled ${face}`));

B.send('furn_use', { id: dieId });
await wait(400);
check('far player cannot roll', B.state.furniture.get(dieId)?.state === face);

A.send('furn_close', { id: dieId });
await wait(900);
check('dealer closes the die', B.state.furniture.get(dieId)?.state === '0');

await A.leave();
await B.leave();
const failed = checks.filter((c) => !c).length;
console.log(failed ? `${failed} check(s) failed` : 'all casino checks passed');
process.exit(failed ? 1 : 0);
