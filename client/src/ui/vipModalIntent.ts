/** What a close gesture on the VIP game popup should do. Pure so it is testable without a DOM. */
export type ExitIntent = 'close' | 'confirm' | 'cancel-confirm' | 'none';

export function exitIntent(o: { live: boolean; confirming: boolean; key?: string; source: 'x' | 'exit' | 'key' | 'backdrop' }): ExitIntent {
  if (o.source === 'key' && o.key !== 'Escape') return 'none';
  if (o.confirming && (o.source === 'key' || o.source === 'backdrop')) return 'cancel-confirm';
  if (o.source === 'backdrop') return 'none';
  if (o.live && !o.confirming) return 'confirm';
  return 'close';
}
