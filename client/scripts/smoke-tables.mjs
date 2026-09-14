/**
 * End-to-end check of Game Den table games against a running server:
 * quick match to a win and a rematch, leaving notifies the opponent, the house
 * bot answers moves, and sitting at both chairs of a table starts a match.
 *
 *   node client/scripts/smoke-tables.mjs [roomSlug]
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2567';
const WS = API.replace(/^http/, 'ws');
const SLUG = process.argv[2] ?? 'gameden';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function me(token) {
  const r = await fetch(`${API}/api/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  return r.json();
}

const tokenA = 'tablesSmokeA' + '0'.repeat(24);
const tokenB = 'tablesSmokeB' + '1'.repeat(24);
const ua = await me(tokenA);
const ub = await me(tokenB);
console.log('users:', ua.handle, ub.handle);

const client = new Client(WS);
const A = await client.joinOrCreate('room', { slug: SLUG, token: tokenA });
const B = await client.joinOrCreate('room', { slug: SLUG, token: tokenB });
await wait(700);

const last = { A: null, B: null };
const status = { A: [], B: [] };
const ends = { A: [], B: [] };
for (const [name, room] of [
  ['A', A],
  ['B', B],
]) {
  room.onMessage('tg_state', (m) => (last[name] = m));
  room.onMessage('tg_status', (m) => status[name].push(m.phase));
  room.onMessage('tg_end', (m) => ends[name].push(m.reason));
  for (const t of ['chat', 'emote', 'coins', 'sys', 'love', 'duel_over', 'call_state']) room.onMessage(t, () => {});
}

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

// ---- 1. quick match connect four: each stacks their own column until someone lines up four
A.send('tg_queue', { kind: 'c4' });
await wait(300);
check('A waits in the queue', status.A.includes('queue'));
B.send('tg_queue', { kind: 'c4' });
check('both get the same match', await until(() => last.A && last.B && last.A.id === last.B.id));
check('seats differ', last.A && last.B && last.A.you !== last.B.you);
for (let i = 0; i < 20 && last.A && !last.A.over; i++) {
  const s = last.A.state;
  const aMoves = s.turn === last.A.you;
  const before = s.moves;
  (aMoves ? A : B).send('tg_move', { move: aMoves ? 0 : 1 });
  await until(() => last.A.state.moves > before || last.A.over, 3000);
}
check('connect four finished with a winning line', last.A?.over && last.A.state.winner !== 'draw' && last.A.state.line.length >= 4);

// ---- 2. rematch needs both; round 2 starts
A.send('tg_rematch');
B.send('tg_rematch');
check('rematch starts round 2', await until(() => last.A?.round === 2 && !last.A.over && last.B?.round === 2));

// ---- 3. leaving tells the other player
A.send('tg_leave');
check('B hears that A left', await until(() => ends.B.includes('left')));

// ---- 4. the house bot plays tic-tac-toe back
last.A = null;
A.send('tg_bot', { kind: 'ttt' });
check('bot match starts', await until(() => last.A && last.A.bot && last.A.kind === 'ttt'));
for (let i = 0; i < 12 && last.A && !last.A.over; i++) {
  if (!(await until(() => last.A.over || last.A.state.turn === last.A.you, 4000))) break;
  if (last.A.over) break;
  const cell = last.A.state.board.findIndex((v) => v === -1);
  const before = last.A.state.moves;
  A.send('tg_move', { move: cell });
  await until(() => last.A.state.moves > before, 3000);
}
check('bot game reached the end', last.A?.over);
A.send('tg_leave');
await wait(500);

// ---- 5. sit in both chairs of the connect four table at (5,6)
last.A = null;
last.B = null;
A.send('move', { x: 4, y: 6 });
B.send('move', { x: 6, y: 6 });
check('sitting at a table starts a match', await until(() => last.A && last.B && last.A.table && last.A.id === last.B.id, 15000));
check('table match is connect four', last.A?.kind === 'c4');

A.send('tg_leave');
await wait(300);
await A.leave();
await B.leave();
const ok = checks.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
