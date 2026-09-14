import { ReactNode, useMemo } from 'react';
import { parseAvatar } from '@dovey/shared';
import { useAppStore } from '../store';
import { useRoster } from '../roster';
import { AvatarPreview } from './AvatarPreview';

export interface VsPlayer {
  sessionId: string;
  name: string;
  bot?: boolean;
  active?: boolean;
  score?: number | null;
  badge?: ReactNode;
}

/** A player's portrait card for game popups: avatar head, name, turn glow and score. */
export function PlayerVsCard({ player }: { player: VsPlayer }) {
  const mySession = useAppStore((s) => s.sessionId);
  const myAvatar = useAppStore((s) => s.avatar);
  const entry = useRoster((s) => (player.sessionId ? s.players[player.sessionId] : undefined));
  const parsedAvatar = useMemo(() => (entry ? parseAvatar(entry.avatar) : null), [entry?.avatar]);
  const cfg = player.bot ? null : player.sessionId && player.sessionId === mySession ? myAvatar : parsedAvatar;

  return (
    <div className={`vs-card ${player.active ? 'vs-card--active' : ''}`}>
      <div className="vs-card__ring">
        {cfg ? (
          <AvatarPreview cfg={cfg} focus="head" scale={3} animate={false} className="vs-card__img" />
        ) : (
          <span className="vs-card__fallback" aria-hidden>
            {player.bot ? '🤖' : '❔'}
          </span>
        )}
      </div>
      <div className="vs-card__name">{player.name}</div>
      {player.badge}
      {player.score !== undefined && player.score !== null && <div className="vs-card__score">{player.score}</div>}
    </div>
  );
}

export function PlayersVs({ left, right, divider = 'VS' }: { left: VsPlayer; right: VsPlayer; divider?: ReactNode }) {
  return (
    <div className="vs">
      <PlayerVsCard player={left} />
      <div className="vs__divider" aria-hidden>
        {divider}
      </div>
      <PlayerVsCard player={right} />
    </div>
  );
}
