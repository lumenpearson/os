/** The Lumen mark: a rounded square with a shield drawn as one stroke. */
export function Wordmark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Lumen OS"
    >
      <rect width="64" height="64" rx="14" fill="currentColor" opacity="0.12" />
      <rect
        x="0.5"
        y="0.5"
        width="63"
        height="63"
        rx="13.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
      />
      <path
        d="M32 15 47 20.5v14c0 9.5-6.2 15.8-15 19.5-8.8-3.7-15-10-15-19.5v-14Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A small mark for the menubar and the Start button: a shield, drawn as one
 * stroke at the same weight as everything else in the bar.
 *
 * The geometry is the mark's own rather than an icon from the set: it sits
 * beside lucide glyphs at 16px and has to hold the same optical weight as
 * they do, which a shield scaled from elsewhere does not.
 */
export function Mark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <path
        d="M32 10 51 17v18c0 12-8 20-19 25-11-5-19-13-19-25V17Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
