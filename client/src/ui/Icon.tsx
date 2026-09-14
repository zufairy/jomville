/**
 * One hand-drawn icon set for the HUD: 24px grid, round caps, 2.5 stroke,
 * so every button reads as part of the same toy box.
 */
export type IconName =
  | 'mic'
  | 'micOff'
  | 'shirt'
  | 'bag'
  | 'hammer'
  | 'share'
  | 'map'
  | 'dice'
  | 'tree'
  | 'home'
  | 'pencil';

const PATHS: Record<IconName, JSX.Element> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  micOff: (
    <>
      <path d="M15 9.5V6a3 3 0 0 0-5.6-1.5M9 9v2a3 3 0 0 0 4.9 2.3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10.8 4.9M18.5 11a6.4 6.4 0 0 1-.4 2.2M12 17.5V21M8.5 21h7M3.5 3.5l17 17" />
    </>
  ),
  shirt: <path d="M8.5 3.5 3 6.5l2 4.5 2.5-1V20.5h9V10l2.5 1 2-4.5-5.5-3a3.5 3.5 0 0 1-7 0Z" />,
  bag: (
    <>
      <path d="M4.5 8h15l-1 12.5h-13Z" />
      <path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5" />
    </>
  ),
  hammer: (
    <>
      <path d="m13.5 10.5-8.8 8.8a1.8 1.8 0 0 0 2.5 2.5l8.8-8.8" />
      <path d="m11 8 5.5-5.5 5 5-5.5 5.5-1.5-1.5-1.5 1.5-3-3 1.5-1.5Z" />
    </>
  ),
  share: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
    </>
  ),
  map: (
    <>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="0.6" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="0.6" fill="currentColor" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="0.6" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="0.6" fill="currentColor" />
    </>
  ),
  tree: (
    <>
      <path d="M12 2.5 5.5 11h3L4 17h16l-4.5-6h3Z" />
      <path d="M12 17v4.5" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11 12 3.5l8.5 7.5" />
      <path d="M5.5 9.5v11h13v-11M10 20.5V15h4v5.5" />
    </>
  ),
  pencil: <path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />,
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Gold coin, filled, for the currency chip. */
export function CoinIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="#f2b632" stroke="#3b2a2a" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="#fff3c4" strokeWidth="2" />
    </svg>
  );
}
