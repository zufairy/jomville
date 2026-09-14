import { useId } from 'react';

type LogoProps = {
  /** height of the mark in px; the wordmark scales with it */
  size?: number;
  /** 'full' = mark + wordmark, 'mark' = smiley only */
  variant?: 'full' | 'mark';
  className?: string;
};

/** The Leypark smiley: coral-to-pink face, dot eyes, a warm smile that ends in a heart. */
export function LeyparkMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  // unique gradient id so several marks on one page never share (and lose) a def
  const id = `lp-face-${useId().replace(/:/g, '')}`;
  return (
    <svg className={`lk-mark ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff9a5a" />
          <stop offset="0.5" stopColor="#ff6b6b" />
          <stop offset="1" stopColor="#f0418c" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id})`} />
      <ellipse cx="24" cy="15" rx="13" ry="6.5" fill="#fff" opacity="0.16" />
      <ellipse cx="23" cy="26" rx="3.6" ry="4.8" fill="#2a0e2f" />
      <ellipse cx="41" cy="26" rx="3.6" ry="4.8" fill="#2a0e2f" />
      <path d="M18.5 37.5C22 45 27 48 32 48C37 48 41 45.5 43.5 41.5" fill="none" stroke="#2a0e2f" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M48.5 44.2C43.4 41 42.2 36.8 44.6 35.2C46.2 34.1 47.9 34.9 48.5 36.4C49.1 34.9 50.8 34.1 52.4 35.2C54.8 36.8 53.6 41 48.5 44.2Z" fill="#fff" />
    </svg>
  );
}

/** Leypark lockup: smiley mark plus the lowercase Nunito wordmark. Styles live in landing.css. */
export function LeyparkLogo({ size = 34, variant = 'full', className = '' }: LogoProps) {
  return (
    <span className={`lk-logo ${className}`} style={{ ['--lk-logo-size' as string]: `${size}px` }}>
      <LeyparkMark size={size} />
      {variant === 'full' && <span className="lk-logo__word">leypark</span>}
    </span>
  );
}
