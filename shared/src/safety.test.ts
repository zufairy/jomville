import { describe, expect, it } from 'vitest';
import { REPORT_REASONS, URGENT_REASONS, isReportReason } from './safety';

describe('safety', () => {
  it('report reasons are unique and labelled in plain words', () => {
    const ids = REPORT_REASONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REPORT_REASONS) expect(r.label.length).toBeGreaterThan(4);
  });
  it('validates reasons from the wire', () => {
    expect(isReportReason('grooming')).toBe(true);
    expect(isReportReason('banana')).toBe(false);
    expect(isReportReason(null)).toBe(false);
  });
  it('every urgent reason is a real reason', () => {
    for (const u of URGENT_REASONS) expect(isReportReason(u)).toBe(true);
  });
});
