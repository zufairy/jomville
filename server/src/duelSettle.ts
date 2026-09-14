/**
 * Duel payouts move escrowed coins, so a failed write must never vanish into a
 * console.error. Try twice; if both fail, log the full input as one JSON line
 * (`[duel-settle-failed] {...}`) so it can be replayed by hand.
 */
export async function settleOrLog<I, R>(settle: (input: I) => Promise<R>, input: I, log: (line: string) => void = console.error): Promise<R | null> {
  try {
    return await settle(input);
  } catch {
    try {
      return await settle(input);
    } catch (e) {
      log(`[duel-settle-failed] ${JSON.stringify({ input, error: e instanceof Error ? e.message : String(e) })}`);
      return null;
    }
  }
}
