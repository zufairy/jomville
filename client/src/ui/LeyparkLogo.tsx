/** Leypark lockup: the wau bulan mark plus the gold wordmark. Styles live in landing.css. */
export function LeyparkLogo({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`lk-logo ${className}`}>
      <img src="/leypark-mark.svg" alt="" width={size} height={size} />
      <span className="lk-logo__word">Leypark</span>
    </span>
  );
}
