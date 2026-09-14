/**
 * End-to-end check of the co-op kitchen against a running server:
 * four players stand on a crew rug, start a round, join the kitchen room,
 * snapshots flow at ~20/s, one bot cooks and serves the oldest order, the round ends.
 *
 *   KITCHEN_ROUND_SECONDS=60 PORT=2567 pnpm start      (another shell)
 *   node client/scripts/smoke-kitchen.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2567';
const WS = API.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (label, ok) => {
  checks.push(!!ok);
  console.log(ok ? '  ok  ' : '  FAIL', label);
};
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(50);
  }
  return false;
}
async function me(token) {
  const r = await fetch(`${API}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  return r.json();
}

// Diner layout (shared/src/kitchen/levels.ts) to find station indices by tile
const ROWS = ['#TLOMCCWWCPRX#', 'B............S', 'C.1........2.C', 'C...CCCCCC...C', 'B............S', 'C...CCCCCC...C', 'C.3........4.C', 'C............C', '##CCCCCCCCCC##'];
const stationIndex = new Map();
ROWS.forEach((row, y) => [...row].forEach((ch, x) => /[CTLOMBSPWXR]/.test(ch) && stationIndex.set(`${x},${y}`, stationIndex.size)));
const CRATE_X = { tomato: 1, lettuce: 2, onion: 3, mushroom: 4 };

const client = new Client(WS);
const tokens = [0, 1, 2, 3].map((i) => `kitchenSmoke${i}`.padEnd(32, String(i)));
for (const t of tokens) await me(t);
const worlds = await Promise.all(tokens.map((token) => client.joinOrCreate('room', { slug: 'kitchen', token })));
const crew = [null, null, null, null];
let roomId = null;
worlds.forEach((w, i) => {
  w.onMessage('k_crew', (m) => (crew[i] = m.crew));
  w.onMessage('k_go', (m) => (roomId = m.roomId));
  for (const t of ['chat', 'emote', 'coins', 'sys', 'love', 'tg_state', 'tg_status', 'tg_end', 'call_state', 'duel_over', 'maze_win']) w.onMessage(t, () => {});
});
await wait(600);
const PAD = [
  [2, 3],
  [3, 3],
  [2, 4],
  [3, 4],
];
worlds.forEach((w, i) => w.send('move', { x: PAD[i][0], y: PAD[i][1] }));
check('four players form one crew on the first rug', await until(() => crew.every((c) => c?.members.length === 4), 15000));

worlds[0].send('k_start');
check('start sends everyone to the same kitchen room', await until(() => !!roomId));

const kitchens = await Promise.all(tokens.map((token) => client.joinById(roomId, { token })));
const st = kitchens.map(() => ({ you: null, snaps: 0, chefs: [], stations: [], orders: [], score: 0, events: [], result: null }));
kitchens.forEach((k, i) => {
  k.onMessage('k_hello', (m) => (st[i].you = m.you));
  k.onMessage('k_snap', (s) => {
    const v = st[i];
    v.snaps++;
    v.chefs = s.chefs;
    v.score = s.score;
    for (const x of s.stations ?? []) v.stations[x.i] = x;
    if (s.orders) v.orders = s.orders;
  });
  k.onMessage('k_event', (e) => st[i].events.push(e));
  k.onMessage('k_result', (r) => (st[i].result = r));
  for (const t of ['k_roster', 'k_away', 'k_pong']) k.onMessage(t, () => {});
});
check('every player gets a hello', await until(() => st.every((s) => s.you)));
const before = st[0].snaps;
await wait(2000);
const rate = (st[0].snaps - before) / 2;
check(`snapshots flow at ~20/s (got ${rate})`, rate >= 14 && rate <= 26);

// ---- bot A cooks
const A = kitchens[0];
const a = st[0];
let seq = 0;
const mine = () => a.chefs.find((c) => c.id === a.you);
const send = (inp) => A.send('k_in', { seq: ++seq, mx: 0, my: 0, grab: false, use: false, dash: false, ...inp });
async function goTo(x, y) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    const c = mine();
    if (c) {
      const dx = x - c.x;
      const dy = y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.12) break;
      const k = Math.min(1, d * 3) / d;
      send({ mx: dx * k, my: dy * k });
    }
    await wait(33);
  }
  send({});
  await wait(120);
}
async function face(mx, my) {
  for (let i = 0; i < 4; i++) {
    send({ mx, my });
    await wait(33);
  }
  send({});
  await wait(150);
}
async function grab() {
  send({ grab: true });
  await wait(250);
}
async function chop() {
  const end = Date.now() + 2400;
  while (Date.now() < end) {
    send({ use: true });
    await wait(33);
  }
  send({});
  await wait(150);
}
/** crate -> board -> chopped in hand */
async function prep(ing) {
  await goTo(CRATE_X[ing] + 0.5, 1.5);
  await face(0, -1);
  await grab();
  await goTo(1.5, 1.5);
  await face(-1, 0);
  await grab();
  await chop();
  await grab();
}
async function cook(dish) {
  if (dish.startsWith('soup_')) {
    const ing = dish.slice(5);
    for (let i = 0; i < 3; i++) {
      await prep(ing);
      await goTo(12.5, 1.5);
      await face(1, 0);
      await grab();
    }
    const stove = stationIndex.get('13,1');
    await until(() => {
      const p = a.stations[stove]?.item;
      return p && p.contents.length === 3 && p.cook >= 9;
    }, 15000);
    await goTo(10.5, 1.5);
    await face(0, -1);
    await grab(); // plate
    await goTo(12.5, 1.5);
    await face(1, 0);
    await grab(); // pour
  } else {
    await prep('lettuce');
    await goTo(9.5, 1.5);
    await face(0, -1);
    await grab(); // lettuce on counter (9,0)
    if (dish === 'salad_tomato') {
      await prep('tomato');
      await goTo(6.5, 1.5);
      await face(0, -1);
      await grab(); // tomato on counter (6,0)
    }
    await goTo(10.5, 1.5);
    await face(0, -1);
    await grab(); // plate
    await goTo(9.5, 1.5);
    await face(0, -1);
    await grab(); // scoop lettuce
    if (dish === 'salad_tomato') {
      await goTo(6.5, 1.5);
      await face(0, -1);
      await grab();
    }
  }
  await goTo(7.5, 1.5);
  await face(0, -1);
  await grab(); // serve
}

check('an order arrives', await until(() => a.orders.length > 0, 10000));
const dish = a.orders[0]?.dish;
console.log('  cooking', dish);
await cook(dish);
check('serving scores points', await until(() => a.score > 0, 4000));
check('everyone saw the served event', st.every((s) => s.events.some((e) => e.type === 'served')));

check('the round ends with a result for everyone', await until(() => st.every((s) => s.result), 90000));
console.log('  result', st[0].result);

for (const k of kitchens) await k.leave();
for (const w of worlds) await w.leave();
const pass = checks.every(Boolean);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
