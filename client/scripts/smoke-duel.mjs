/**
 * End-to-end check of staked rock-paper-scissors duels against a running server:
 *  1. A challenges B for 50, both stakes are escrowed, A wins 2-0: A nets +50, B nets -50
 *  2. a staked forfeit hands the pot to whoever stayed
 *  3. a stake B cannot cover is cancelled (insufficient) and nobody is charged
 *  4. a broke inviter is refused, a bad stake is refused
 *  5. a lobby local refuses a staked duel
 *
 *   rm -rf "$TMPDIR/dovey-duel-pg"
 *   PORT=2596 PGLITE_DIR="$TMPDIR/dovey-duel-pg" pnpm start        (another shell)
 *   DOVEY_API=http://localhost:2596 node client/scripts/smoke-duel.mjs
 */
import { Client } from 'colyseus.js';

const API = process.env.DOVEY_API ?? 'http://localhost:2596';
const WS = API.replace(/^http/, 'ws');
const SLUG = process.argv[2] ?? 'gameden';
const TRICKLE = 5; // COINS_PER_MINUTE: the once-a-minute coins message
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
    await wait(60);
  }
  return false;
}
async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const coinsOf = async (token) => (await post('/api/inventory', { token })).json.coins;

// fresh accounts every run, so reruns against the same database start at the default balance
const run = Date.now().toString(36);
const tokenA = `duelSmokeA${run}`.padEnd(32, 'a');
const tokenB = `duelSmokeB${run}`.padEnd(32, 'b');
const ua = (await post('/api/me', { token: tokenA })).json;
const ub = (await post('/api/me', { token: tokenB })).json;
console.log('users:', ua?.handle, ub?.handle);

const client = new Client(WS);
const A = await client.joinOrCreate('room', { slug: SLUG, token: tokenA });
const B = await client.joinOrCreate('room', { slug: SLUG, token: tokenB });
await wait(700);

const newLog = () => ({ incoming: [], start: [], rounds: [], ends: [], sys: [], trickle: 0 });
const log = { A: newLog(), B: newLog() };
const QUIET = ['chat', 'emote', 'love', 'duel_over', 'duel_ringing', 'duel_wait', 'call_state', 'tg_state', 'tg_status', 'tg_end', 'roll', 'gear_use', 'maze_win', 'inventory_refresh', 'inventory_delta'];
for (const [name, room] of [
  ['A', A],
  ['B', B],
]) {
  const L = log[name];
  room.onMessage('duel_incoming', (m) => L.incoming.push(m));
  room.onMessage('duel_start', (m) => L.start.push(m));
  room.onMessage('duel_round', (m) => L.rounds.push(m));
  room.onMessage('duel_end', (m) => L.ends.push(m));
  room.onMessage('sys', (m) => L.sys.push(m.code));
  room.onMessage('coins', (m) => {
    if (m.earned === TRICKLE) L.trickle += TRICKLE;
  });
  for (const t of QUIET) room.onMessage(t, () => {});
}

/** wallet snapshot that ignores the minute trickle */
const snap = async (name, token) => ({ coins: await coinsOf(token), trickle: log[name].trickle });
const netSince = async (name, token, s) => (await coinsOf(token)) - s.coins - (log[name].trickle - s.trickle);

// ---- 1. staked duel to a win
let sA = await snap('A', tokenA);
let sB = await snap('B', tokenB);
A.send('duel_invite', { to: B.sessionId, stake: 50 });
check('B is challenged for 50', await until(() => log.B.incoming.some((m) => m.from === A.sessionId && m.stake === 50)));
B.send('duel_accept');
check('both duels start', await until(() => log.A.start.length === 1 && log.B.start.length === 1));
check('duel_start carries the stake', log.A.start[0]?.stake === 50 && log.B.start[0]?.stake === 50);
check('both stakes left the wallets', (await netSince('A', tokenA, sA)) === -50 && (await netSince('B', tokenB, sB)) === -50);
for (let round = 0; round < 6 && !log.A.rounds.some((r) => r.done); round++) {
  const before = log.A.rounds.length;
  A.send('duel_pick', { pick: 0 }); // rock
  B.send('duel_pick', { pick: 2 }); // scissors
  await until(() => log.A.rounds.length > before && log.B.rounds.length > before);
}
const final = log.A.rounds.at(-1);
check('A wins 2-0', final?.done === true && final.winner === 'a' && final.score[0] === 2 && final.score[1] === 0);
check('duel_round carries stake and pot', final?.stake === 50 && final?.pot === 100);
await wait(600); // payout is written after the round message
const netA1 = await netSince('A', tokenA, sA);
const netB1 = await netSince('B', tokenB, sB);
check(`winner nets +50 (got ${netA1})`, netA1 === 50);
check(`loser nets -50 (got ${netB1})`, netB1 === -50);

// ---- 2. staked forfeit: B walks out, A takes the pot
sA = await snap('A', tokenA);
sB = await snap('B', tokenB);
A.send('duel_invite', { to: B.sessionId, stake: 25 });
check('B is challenged for 25', await until(() => log.B.incoming.some((m) => m.stake === 25)));
B.send('duel_accept');
check('forfeit duel starts', await until(() => log.A.start.length === 2 && log.B.start.length === 2));
B.send('duel_end');
check('A hears the forfeit with the pot', await until(() => log.A.ends.some((e) => e.reason === 'forfeit' && e.pot === 50)));
await wait(600);
const netA2 = await netSince('A', tokenA, sA);
const netB2 = await netSince('B', tokenB, sB);
check(`stayer nets +25 (got ${netA2})`, netA2 === 25);
check(`quitter nets -25 (got ${netB2})`, netB2 === -25);

// ---- 3. a stake B cannot cover: cancelled, nobody charged
await post('/api/shop/buy', { token: tokenB, def: 'hottub', qty: 1 });
for (let i = 0; i < 10 && (await coinsOf(tokenB)) >= 500; i++) await post('/api/shop/buy', { token: tokenB, def: 'chair', qty: 5 });
sA = await snap('A', tokenA);
sB = await snap('B', tokenB);
check(`B is below 500 (${sB.coins})`, sB.coins < 500);
const endsA = log.A.ends.length;
const endsB = log.B.ends.length;
A.send('duel_invite', { to: B.sessionId, stake: 500 });
check('B is challenged for 500', await until(() => log.B.incoming.some((m) => m.stake === 500)));
B.send('duel_accept'); // a client that ignores the disabled accept button
check(
  'both hear the duel was cancelled for coins',
  await until(() => log.A.ends.slice(endsA).some((e) => e.reason === 'insufficient') && log.B.ends.slice(endsB).some((e) => e.reason === 'insufficient')),
);
check('no duel started', log.A.start.length === 2 && log.B.start.length === 2);
await wait(300);
check('nobody was charged', (await netSince('A', tokenA, sA)) === 0 && (await netSince('B', tokenB, sB)) === 0);

// ---- 4. a broke inviter and a bad stake are refused
const sysB = log.B.sys.length;
B.send('duel_invite', { to: A.sessionId, stake: 500 });
check('a broke inviter gets not_enough_coins', await until(() => log.B.sys.slice(sysB).includes('not_enough_coins')));
const sysA = log.A.sys.length;
A.send('duel_invite', { to: B.sessionId, stake: 30 });
check('an unlisted stake gets bad_request', await until(() => log.A.sys.slice(sysA).includes('bad_request')));
check('neither refusal reached B as an invite', !log.B.incoming.some((m) => m.stake === 30));

await A.leave();
await B.leave();

// ---- 5. a lobby local refuses a staked duel
const L = await client.joinOrCreate('room', { slug: 'mainlobby', token: tokenA });
const lobbySys = [];
L.onMessage('sys', (m) => lobbySys.push(m.code));
L.onMessage('duel_incoming', () => {});
L.onMessage('duel_start', () => {});
L.onMessage('duel_end', () => {});
L.onMessage('duel_round', () => {});
L.onMessage('coins', () => {});
for (const t of QUIET) L.onMessage(t, () => {});
await wait(1200);
let botId = null;
L.state.players.forEach((p, id) => {
  if (!botId && String(p.userId).startsWith('bot:')) botId = id;
});
check('the lobby has a local', !!botId);
if (botId) {
  L.send('duel_invite', { to: botId, stake: 25 });
  check('a local refuses a staked duel', await until(() => lobbySys.includes('bot_no_stake')));
}
await L.leave();

const ok = checks.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
