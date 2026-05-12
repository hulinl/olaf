/**
 * Subtle topographic-line decoration for the landing hero.
 * Drawn in muted ink with low opacity — visible but never competing.
 */
export function TopographyBg() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-ink-900/[0.04] dark:text-ink-900/[0.05]"
      viewBox="0 0 1200 600"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id="topo"
          x="0"
          y="0"
          width="800"
          height="400"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M -50 200 Q 100 140 250 180 T 550 160 T 850 200"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M -50 250 Q 120 200 280 230 T 580 220 T 880 250"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M -50 300 Q 140 260 310 280 T 610 280 T 910 300"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M -50 350 Q 160 320 340 330 T 640 340 T 940 350"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </pattern>
        <radialGradient id="topo-fade" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="topo-mask">
          <rect width="100%" height="100%" fill="url(#topo-fade)" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="url(#topo)"
        mask="url(#topo-mask)"
      />
    </svg>
  );
}
