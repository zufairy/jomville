/**
 * The local mover reaches a tile before the server's walk does, and the server
 * checks reach against its own position. A walk-up use therefore waits until the
 * server has us standing on the same tile (or a short grace period passes).
 */
export const ARRIVAL_WAIT_MS = 1500;

export interface Spot {
  x: number;
  y: number;
}

export function arrivalReady(local: Spot, server: (Spot & { moving?: boolean }) | null | undefined, waitedMs: number): boolean {
  if (!server || waitedMs >= ARRIVAL_WAIT_MS) return true;
  return !server.moving && Math.round(server.x) === Math.round(local.x) && Math.round(server.y) === Math.round(local.y);
}
