/**
 * Player safety primitives. Blocking and reporting are server-enforced;
 * muting is a local-only preference that needs no round trip.
 */
export const REPORT_REASONS = [
  { id: 'harassment', label: 'being mean or harassing' },
  { id: 'sexual', label: 'sexual or adult content' },
  { id: 'grooming', label: 'asking my age, or trying to meet up' },
  { id: 'hate', label: 'hate or slurs' },
  { id: 'scam', label: 'scamming or begging' },
  { id: 'spam', label: 'spam or flooding' },
  { id: 'other', label: 'something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export function isReportReason(v: unknown): v is ReportReason {
  return typeof v === 'string' && REPORT_REASONS.some((r) => r.id === v);
}

/** Reports and blocks are cheap to spam, so they are rate limited like chat. */
export const REPORT_RATE = { count: 5, windowMs: 60_000 };
export const BLOCK_RATE = { count: 20, windowMs: 60_000 };
export const REPORT_NOTE_MAX = 200;

/** Reasons a moderator should see first. */
export const URGENT_REASONS: ReportReason[] = ['grooming', 'sexual', 'hate'];
