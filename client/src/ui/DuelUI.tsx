import { useAppStore } from '../store';
import { DuelArena } from './duel/DuelArena';

/** Rock-paper-scissors duel popup. The arena draws every phase; nothing shows while idle. */
export function DuelUI() {
  const phase = useAppStore((s) => s.duel.phase);
  return phase === 'idle' ? null : <DuelArena />;
}
