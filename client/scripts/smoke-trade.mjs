/**
 * Trading smoke against a running server seeded by server/scripts/seed-trade-smoke.ts.
 * 1. A gives 2 chairs + an LTD throne + 300 coins, B gives 100 coins; rules on the way
 *    (confirm before accept, confirm during countdown, offer change resets accepts);
 *    both confirm; balances, stacks and throne ownership (same serial) match.
 * 2. A second trade where A places the offered throne mid-trade fails with not_owned
 *    and nothing moves.
 * 3. A declined invite tells the inviter.
 *
 *   DOVEY_API=http://localhost:2597 node client/scripts/smoke-trade.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2597';
const WS = API.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) =>
  (await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

const tokenA = 'tradeSmokeA' + '0'.repeat(25);
const tokenB = 'tradeSmokeB' + '1'.repeat(25);

const checks = [];
const check = (label, ok) => {
  checks.push(!!ok);
  console.log(ok ? '  ok  ' : '  FAIL', label);
};
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(80);
  }
  return false;
}
function freeTile(room) {
  const taken = new Set();
  room.state.furniture.forEach((f) => taken.add(`${f.x},${f.y}`));
  room.state.players.forEach((p) => taken.add(`${Math.round(p.x)},${Math.round(p.y)}`));
  for (let y = 1; y < room.state.size - 1; y++) for (let x = 1; x < room.state.size - 1; x++) if (!taken.has(`${x},${y}`)) return { x, y };
  return null;
}

const ua = await post('/api/me', { token: tokenA });
await post('/api/me', { token: tokenB });
const inv0A = await post('/api/inventory', { token: tokenA });
const inv0B = await post('/api/inventory', { token: tokenB });
const thrones = inv0A.instances.filter((i) => i.def === 'throne_gold' && !i.placed);
check('seed: A holds 2 unplaced LTD thrones and 3 chairs', thrones.length >= 2 && (inv0A.items.chair ?? 0) >= 3);
if (!checks.every(Boolean)) {
  console.log('FAIL: run server/scripts/seed-trade-smoke.ts with the same PGLITE_DIR first');
  process.exit(1);
}
const [throne1, throne2] = thrones;

const client = new Client(WS);
const A = await client.joinOrCreate('room', { slug: ua.home, token: tokenA });
const B = await client.joinOrCreate('room', { slug: ua.home, token: tokenB });
const log = {};
for (const [name, room] of [
  ['A', A],
  ['B', B],
]) {
  const l = (log[name] = { state: null, done: [], sys: [], incoming: [], waiting: [], coins: [] });
  room.onMessage('t_state', (m) => (l.state = m));
  room.onMessage('t_done', (m) => l.done.push(m));
  room.onMessage('t_incoming', (m) => l.incoming.push(m));
  room.onMessage('t_waiting', (m) => l.waiting.push(m));
  room.onMessage('sys', (m) => l.sys.push(m.code));
  room.onMessage('coins', (m) => l.coins.push(m));
  room.onMessage('*', () => {});
}
await wait(800);

// ---- 1. invite, offers, rules, successful trade
let invitedAt = Date.now();
A.send('t_invite', { id: B.sessionId });
check('B gets the invite with A handle', await until(() => log.B.incoming.some((m) => m.from === A.sessionId && m.handle === ua.handle)));
check('A is told it is waiting', log.A.waiting.some((m) => m.to === B.sessionId));
B.send('t_respond', { ok: true });
check('both trade windows open', await until(() => log.A.state && log.B.state));

A.send('t_offer', { slots: [{ def: 'chair', qty: 2 }, { itemId: throne1.id }], coins: 300 });
check(
  `B sees the Golden Throne #${throne1.serial}`,
  await until(() => log.B.state?.them.slots[1]?.serial === throne1.serial && log.B.state.them.slots[1].name === 'Golden Throne'),
);
B.send('t_offer', { slots: [], coins: 100 });
check('A sees 100 coins from B', await until(() => log.A.state?.them.coins === 100));

B.send('t_confirm');
check('confirm before accepting is refused', await until(() => log.B.sys.includes('not_accepted')));
A.send('t_accept');
B.send('t_accept');
check('both accepted starts the countdown', await until(() => log.A.state?.acceptedYou && log.A.state.acceptedThem && log.A.state.confirmAt > 0));
A.send('t_confirm');
check('confirm during the countdown is refused', await until(() => log.A.sys.includes('too_early')));
B.send('t_offer', { slots: [], coins: 100 });
check('an offer change clears both accepts', await until(() => log.A.state && !log.A.state.acceptedYou && !log.A.state.acceptedThem && log.A.state.confirmAt === null));
A.send('t_accept');
B.send('t_accept');
await until(() => log.B.state?.acceptedYou && log.B.state.acceptedThem);
await wait(3200);
A.send('t_confirm');
B.send('t_confirm');
check('both get t_done ok', await until(() => log.A.done.some((d) => d.ok) && log.B.done.some((d) => d.ok)));
check('A gets its new balance pushed', await until(() => log.A.coins.at(-1)?.coins === inv0A.coins - 200));

const inv1A = await post('/api/inventory', { token: tokenA });
const inv1B = await post('/api/inventory', { token: tokenB });
check('A coins: -300 +100', inv1A.coins === inv0A.coins - 200);
check('B coins: +300 -100', inv1B.coins === inv0B.coins + 200);
check('2 chairs moved A -> B', (inv1A.items.chair ?? 0) === inv0A.items.chair - 2 && (inv1B.items.chair ?? 0) === (inv0B.items.chair ?? 0) + 2);
check(
  'the throne is B’s now with the same serial, unplaced',
  inv1B.instances.some((i) => i.id === throne1.id && i.serial === throne1.serial && !i.placed) && !inv1A.instances.some((i) => i.id === throne1.id),
);

// ---- 2. A places the offered throne mid-trade: the trade fails and nothing moves
await wait(Math.max(0, 5200 - (Date.now() - invitedAt)));
invitedAt = Date.now();
log.A.state = null;
log.B.state = null;
A.send('t_invite', { id: B.sessionId });
await until(() => log.B.incoming.length >= 2);
B.send('t_respond', { ok: true });
check('second trade opens', await until(() => log.A.state && log.B.state));
A.send('t_offer', { slots: [{ itemId: throne2.id }], coins: 0 });
B.send('t_offer', { slots: [], coins: 50 });
await until(() => log.B.state?.them.slots[0]?.itemId === throne2.id && log.A.state?.them.coins === 50);
A.send('t_accept');
B.send('t_accept');
await until(() => log.A.state?.acceptedYou && log.A.state.acceptedThem);
const tile = freeTile(A);
const placeId = `ts${Date.now().toString(36)}`;
A.send('furn_place', { id: placeId, def: 'throne_gold', x: tile.x, y: tile.y, rot: 0, itemId: throne2.id });
check('A placed the offered throne mid-trade', await until(() => A.state.furniture.get(placeId)?.itemId === throne2.id));
await wait(3200);
const doneA = log.A.done.length;
const doneB = log.B.done.length;
A.send('t_confirm');
B.send('t_confirm');
check(
  'the trade fails with not_owned on both sides',
  await until(() => log.A.done.slice(doneA).some((d) => !d.ok && d.code === 'not_owned') && log.B.done.slice(doneB).some((d) => !d.ok && d.code === 'not_owned')),
);
const inv2A = await post('/api/inventory', { token: tokenA });
const inv2B = await post('/api/inventory', { token: tokenB });
check('B keeps its coins', inv2B.coins === inv1B.coins);
check('A keeps its coins', inv2A.coins === inv1A.coins);
check('throne 2 is still A’s and placed', inv2A.instances.some((i) => i.id === throne2.id && i.placed === ua.home));
A.send('furn_remove', { id: placeId });
check('throne 2 picked back up for the next run', await until(() => !A.state.furniture.has(placeId)));

// ---- 3. a declined invite tells the inviter
await wait(Math.max(0, 5200 - (Date.now() - invitedAt)));
A.send('t_invite', { id: B.sessionId });
await until(() => log.B.incoming.length >= 3);
B.send('t_respond', { ok: false });
check('A hears the decline', await until(() => log.A.done.some((d) => !d.ok && d.code === 'declined')));

await wait(300);
await A.leave();
await B.leave();
const ok = checks.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
