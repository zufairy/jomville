import { CLOSED, FurnitureDef, Placement, ROLLING } from '@dovey/shared';

/** live status line for chance furni ("closed", "rolling…", "showing 5"); null for everything else */
export function chanceStatus(def: FurnitureDef, state: string | undefined): string | null {
  if (!def.interaction) return null;
  const s = state || CLOSED;
  if (s === CLOSED) return 'closed';
  if (s === ROLLING) return def.interaction === 'wheel' ? 'spinning…' : 'rolling…';
  return def.interaction === 'wheel' ? `landed on ${s}` : `showing ${s}`;
}

/** "Serial #12 · LTD 100", "Serial #3", "LTD 50" or null */
export function serialLine(def: FurnitureDef, p: Placement): string | null {
  const parts: string[] = [];
  if (p.serial) parts.push(`Serial #${p.serial}`);
  if (def.ltd) parts.push(`LTD ${def.ltd}`);
  return parts.length ? parts.join(' · ') : null;
}
