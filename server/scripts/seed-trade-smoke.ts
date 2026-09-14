/**
 * Seeds the trade smoke users. Run while no server holds the same PGLITE_DIR:
 *   PGLITE_DIR=/tmp/dovey-trade-smoke-db pnpm --filter @dovey/server exec tsx scripts/seed-trade-smoke.ts
 * A ends up with ≥ 2 unplaced LTD Golden Thrones, ≥ 3 chairs and spare coins; B with ≥ 500 coins.
 */
import { DEFAULT_AVATAR } from '@dovey/shared';
import { openDb } from '../src/db';
import { Repo } from '../src/repo';

const TOKEN_A = 'tradeSmokeA' + '0'.repeat(25);
const TOKEN_B = 'tradeSmokeB' + '1'.repeat(25);

const db = await openDb();
const repo = new Repo(db);
await repo.ensureLtdStock();
const a = (await repo.userByToken(TOKEN_A)) ?? (await repo.createUser(TOKEN_A, DEFAULT_AVATAR));
const b = (await repo.userByToken(TOKEN_B)) ?? (await repo.createUser(TOKEN_B, DEFAULT_AVATAR));

const inv = await repo.inventory(a.id);
const thrones = inv.instances.filter((i) => i.def === 'throne_gold' && !i.placed).length;
await repo.creditCoins(a.id, 50_000 * Math.max(0, 2 - thrones) + 1000);
for (let i = thrones; i < 2; i++) {
  const r = await repo.buyInstance(a.id, 'throne_gold');
  if (!r.ok) throw new Error(`could not buy a throne: ${r.reason}`);
}
const chairs = inv.items.chair ?? 0;
if (chairs < 3) await repo.addItem(a.id, 'chair', 3 - chairs);
if ((await repo.coins(b.id)) < 500) await repo.creditCoins(b.id, 1000);

console.log(`[seed] A=${a.handle} (${a.id}) B=${b.handle} (${b.id}) ready`);
await db.close();
