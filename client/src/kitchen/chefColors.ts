/** Name-tag colours, one per crew slot. */
export const CHEF_COLORS = ['#ff8a5b', '#5b9dff', '#58c98b', '#f5c542', '#c77dff', '#ff5d8f'] as const;

/**
 * A chef's colour keyed by its place in the round roster (join order, which
 * never loses entries), so colours don't shift when someone leaves the
 * snapshot. Ids missing from the roster fall back to a stable hash.
 */
export function chefColor(id: string, roster: readonly string[]): string {
  const i = roster.indexOf(id);
  if (i >= 0) return CHEF_COLORS[i % CHEF_COLORS.length];
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (Math.imul(h, 31) + id.charCodeAt(k)) | 0;
  return CHEF_COLORS[Math.abs(h) % CHEF_COLORS.length];
}

export const hexToNumber = (hex: string) => parseInt(hex.slice(1), 16);
