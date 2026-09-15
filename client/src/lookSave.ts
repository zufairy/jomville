/**
 * Look saves the server hasn't acked yet. A room switch is a full page load and the next
 * join reads the saved look, so navigation waits (briefly) for outstanding saves first.
 */
export const LOOK_SAVE_WAIT_MS = 1500;

let pending = 0;
let waiters: Array<() => void> = [];

function settle() {
  const w = waiters;
  waiters = [];
  w.forEach((f) => f());
}

/** a look was just sent to the server */
export function markLookSaving() {
  pending++;
}

/** the server acked a save; true once nothing is outstanding */
export function lookSaved(): boolean {
  if (pending > 0) pending--;
  if (pending === 0) settle();
  return pending === 0;
}

/** forget outstanding saves, e.g. a new connection will never ack the old socket's sends */
export function resetLookSave() {
  pending = 0;
  settle();
}

/** resolves once every outstanding save is acked, or after the timeout (then gives up on them) */
export function waitForLookSave(ms = LOOK_SAVE_WAIT_MS): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resetLookSave, ms);
    waiters.push(() => {
      clearTimeout(t);
      resolve();
    });
  });
}
