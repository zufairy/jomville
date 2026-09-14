import { CLOSED, INTERACTIONS, InteractionKind, ROLLING } from '@dovey/shared';

/** Chance furni (dice, wheel) state transitions. The room owns timers and RNG. */
export function beginRoll(f: { state: string }): boolean {
  if (f.state === ROLLING) return false;
  f.state = ROLLING;
  return true;
}

export function finishRoll(f: { state: string }, kind: InteractionKind, rand: (n: number) => number): number | null {
  if (f.state !== ROLLING) return null;
  f.state = INTERACTIONS[kind].roll(rand);
  return Number(f.state);
}

export function closeChance(f: { state: string }): boolean {
  if (f.state === ROLLING) return false;
  f.state = CLOSED;
  return true;
}

export function restoredState(state: string | undefined): string {
  return !state || state === ROLLING ? CLOSED : state;
}
