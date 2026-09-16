type LogoProps = {
  /** height of the mark in px; the wordmark scales with it */
  size?: number;
  /** 'full' = mark + wordmark, 'mark' = smiley only */
  variant?: 'full' | 'mark';
  className?: string;
};

/** The Leypark chrome wordmark. Uses the uploaded brand asset. */
export function LeyparkMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  return <img className={`lk-mark lk-mark--image ${className}`} src="/leypark-logo.png" width={Math.round(size * 5.2)} height={size} alt="" aria-hidden="true" draggable={false} />;
}

/** Leypark lockup. Full = chrome wordmark; mark = compact cropped wordmark. */
export function LeyparkLogo({ size = 34, variant = 'full', className = '' }: LogoProps) {
  return (
    <span className={`lk-logo lk-logo--${variant} ${className}`} style={{ ['--lk-logo-size' as string]: `${size}px` }}>
      <img className="lk-logo__image" src="/leypark-logo.png" alt="Leypark" draggable={false} />
    </span>
  );
}
