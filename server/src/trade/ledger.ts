import type { TradeFailCode } from '@dovey/shared';
import type { Db } from '../db';

/**
 * Guarded writes for one side of a trade. Each must run on a transaction's
 * `tx`; a guard that matches zero rows throws TradeAbort, which rolls the whole
 * trade back.
 */
export class TradeAbort extends Error {
  constructor(readonly code: TradeFailCode) {
    super(code);
    this.name = 'TradeAbort';
  }
}

/** Guarded debit. Both sides are debited before either is credited, so nobody pays with incoming coins. */
export async function takeCoins(tx: Db, from: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const r = await tx.query('update users set coins = coins - $2::int where id = $1 and coins >= $2::int returning coins', [from, amount]);
  if (!r.length) throw new TradeAbort('insufficient_coins');
}

export async function giveCoins(tx: Db, to: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await tx.query('update users set coins = coins + $2::int where id = $1', [to, amount]);
}

/** Guarded stack decrement; like coins, all takes happen before any gives. */
export async function takeStack(tx: Db, from: string, def: string, qty: number): Promise<void> {
  const r = await tx.query('update inventory set qty = qty - $3::int where user_id = $1 and def = $2 and qty >= $3::int returning qty', [from, def, qty]);
  if (!r.length) throw new TradeAbort('insufficient_items');
}

export async function giveStack(tx: Db, to: string, def: string, qty: number): Promise<void> {
  await tx.query(
    `insert into inventory (user_id, def, qty) values ($1, $2, $3)
     on conflict (user_id, def) do update set qty = inventory.qty + excluded.qty`,
    [to, def, qty],
  );
}

/** Zero rows = placed in a room, already traded away, or never owned. */
export async function transferInstance(tx: Db, itemId: string, from: string, to: string): Promise<{ def: string; serial: number | null }> {
  const r = await tx.query<{ def: string; serial: number | null }>(
    'update items set owner_id = $3 where id = $1 and owner_id = $2 and placed_room is null returning def, serial',
    [itemId, from, to],
  );
  if (!r.length) throw new TradeAbort('not_owned');
  return r[0];
}
