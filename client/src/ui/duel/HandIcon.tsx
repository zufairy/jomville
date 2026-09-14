import { useId } from 'react';

export type HandPick = 0 | 1 | 2;
export const HAND_NAMES = ['rock', 'paper', 'scissors'] as const;

const OUTLINE = '#4a2412';
const CUFF = '#8b5cf6';
const CUFF_EDGE = '#e8c26a';

/**
 * Vector rock / paper / scissors hands, drawn upright (fingers up) so the arena
 * can rotate them toward the centre. Gradient ids are per instance.
 */
export function HandIcon({ pick, cracked = false, className, decorative = false }: { pick: HandPick; cracked?: boolean; className?: string; decorative?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const skin = `dhd-skin-${uid}`;
  const shine = `dhd-shine-${uid}`;
  const part = { fill: `url(#${skin})`, stroke: OUTLINE, strokeWidth: 4, strokeLinejoin: 'round' as const };

  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      // inside a labelled button (or next to text) the art is decorative; standalone it names the hand
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': HAND_NAMES[pick] })}
      data-pick={HAND_NAMES[pick]}
    >
      <defs>
        <linearGradient id={skin} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffe3c7" />
          <stop offset="0.55" stopColor="#f6b98a" />
          <stop offset="1" stopColor="#d98a5c" />
        </linearGradient>
        <radialGradient id={shine} cx="0.35" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {pick === 0 && (
        <g>
          {[26, 43, 60, 77].map((x) => (
            <rect key={x} x={x} y={30} width={17} height={30} rx={8.5} {...part} />
          ))}
          <rect x={24} y={42} width={72} height={58} rx={22} {...part} />
          <path d="M38 58 v10 M55 58 v10 M72 58 v10" stroke={OUTLINE} strokeWidth={3} strokeLinecap="round" opacity={0.45} />
          <rect x={18} y={64} width={54} height={19} rx={9.5} {...part} />
          <ellipse cx={52} cy={60} rx={26} ry={16} fill={`url(#${shine})`} />
        </g>
      )}

      {pick === 1 && (
        <g>
          <rect x={30} y={20} width={15} height={48} rx={7.5} {...part} />
          <rect x={46} y={10} width={15} height={58} rx={7.5} {...part} />
          <rect x={62} y={14} width={15} height={54} rx={7.5} {...part} />
          <rect x={78} y={28} width={14} height={42} rx={7} {...part} />
          <rect x={4} y={58} width={44} height={16} rx={8} transform="rotate(-38 26 66)" {...part} />
          <rect x={28} y={52} width={66} height={50} rx={21} {...part} />
          <ellipse cx={56} cy={70} rx={24} ry={16} fill={`url(#${shine})`} />
        </g>
      )}

      {pick === 2 && (
        <g>
          <rect x={30} y={6} width={15} height={62} rx={7.5} transform="rotate(-15 37 64)" {...part} />
          <rect x={48} y={4} width={15} height={64} rx={7.5} transform="rotate(12 55 64)" {...part} />
          <rect x={62} y={46} width={16} height={24} rx={8} {...part} />
          <rect x={77} y={50} width={15} height={22} rx={7.5} {...part} />
          <rect x={26} y={56} width={68} height={46} rx={21} {...part} />
          <rect x={20} y={70} width={48} height={17} rx={8.5} {...part} />
          <ellipse cx={54} cy={72} rx={24} ry={14} fill={`url(#${shine})`} />
        </g>
      )}

      <rect x={34} y={98} width={52} height={20} rx={6} fill={CUFF} stroke={OUTLINE} strokeWidth={4} />
      <rect x={34} y={98} width={52} height={6} rx={3} fill={CUFF_EDGE} opacity={0.9} />

      {cracked && (
        <g className="dhd-crack" fill="none" stroke="#1b0d06" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M60 22 L52 44 L64 56 L50 76 L60 96" />
          <path d="M52 44 L38 50" />
          <path d="M64 56 L80 60 L86 74" />
          <path d="M50 76 L36 84" />
        </g>
      )}
    </svg>
  );
}
