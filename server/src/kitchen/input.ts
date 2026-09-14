import type { kitchen } from '@dovey/shared';

const stick = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Untrusted `k_in` payload to a KitchenInput; null drops the message. */
export function sanitizeInput(m: unknown): kitchen.KitchenInput | null {
  if (!m || typeof m !== 'object') return null;
  const r = m as Record<string, unknown>;
  if (typeof r.seq !== 'number' || !Number.isInteger(r.seq) || r.seq <= 0) return null;
  return { seq: r.seq, mx: stick(r.mx), my: stick(r.my), grab: r.grab === true, use: r.use === true, dash: r.dash === true };
}
