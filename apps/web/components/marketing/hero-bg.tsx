/**
 * Layered marketing hero background — sunrise over a contoured ridge.
 *
 * Layers (bottom → top in z-order):
 *   1) Amber radial glow (the diffuse light wash)
 *   2) Sun disc rising behind the ridge (small amber circle, soft edge)
 *   3) Topographic contours (slow horizontal drift)
 *   4) Mountain ridge silhouettes — two layers for parallax depth
 *
 * All animations are CSS-driven (no JS). prefers-reduced-motion disables
 * them at the stylesheet level.
 *
 * Note: dropped the floating amber dots — on a topographic map a dot
 * marks a peak, so scattering them over contour lines reads as a
 * cartographic error to anyone who reads maps. The sun disc takes
 * over the warm-point role.
 */
export function HeroBg() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* 1) Diffuse amber wash — slow breathe pulse */}
      <div
        className="sunrise-glow absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(245, 158, 11, 0.22) 0%, rgba(245, 158, 11, 0.08) 38%, transparent 68%)",
        }}
      />

      {/* 2) Sun disc — small amber orb rising just behind the ridge.
          Positioned bottom-right so it reads as morning sun over the
          mountains rather than centered/midday. */}
      <div
        className="sunrise-glow absolute bottom-20 right-[18%] h-40 w-40 rounded-full sm:bottom-24 sm:right-[22%] sm:h-52 sm:w-52"
        style={{
          background:
            "radial-gradient(circle at center, rgba(245, 158, 11, 0.85) 0%, rgba(245, 158, 11, 0.45) 40%, rgba(245, 158, 11, 0) 75%)",
          animationDelay: "1.2s",
        }}
      />

      {/* 3) Topo contours — slow horizontal drift */}
      <svg
        className="topo-drift absolute inset-y-0 -left-12 right-0 h-full w-[calc(100%+96px)] text-ink-900/[0.10]"
        viewBox="0 0 1200 600"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="topo-fade-2" cx="50%" cy="55%" r="75%">
            <stop offset="0%" stopColor="white" stopOpacity="0.1" />
            <stop offset="55%" stopColor="white" stopOpacity="0.35" />
            <stop offset="100%" stopColor="white" stopOpacity="1" />
          </radialGradient>
          <mask id="topo-mask-2">
            <rect width="100%" height="100%" fill="url(#topo-fade-2)" />
          </mask>
        </defs>
        <g
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          mask="url(#topo-mask-2)"
        >
          <path d="M 80 380 C 180 200 420 130 640 150 C 880 170 1060 280 1130 410 C 1180 500 1080 555 880 555 C 540 555 220 530 110 480 C 50 450 50 415 80 380 Z" />
          <path d="M 180 380 C 260 230 460 175 650 195 C 850 210 1010 305 1065 410 C 1100 480 1020 520 850 520 C 560 520 290 500 200 460 C 160 440 155 410 180 380 Z" />
          <path d="M 280 380 C 340 270 490 230 660 245 C 820 260 950 335 990 410 C 1015 460 950 488 820 488 C 580 488 360 472 290 442 C 260 425 260 405 280 380 Z" />
          <path d="M 380 380 C 425 310 530 285 660 295 C 790 305 880 360 905 410 C 920 445 870 462 790 462 C 600 462 430 450 380 425 C 365 415 365 397 380 380 Z" />
          <path d="M 470 380 C 505 335 575 320 660 328 C 750 335 815 372 825 408 C 830 432 790 442 750 442 C 615 442 510 432 480 415 C 470 408 470 395 470 380 Z" />
          <path d="M 555 380 C 575 358 615 350 660 355 C 705 360 740 380 745 405 C 745 422 720 428 700 428 C 625 428 575 422 562 412 C 555 408 555 395 555 380 Z" />
        </g>
      </svg>

      {/* 4) Mountain ridges — back layer (lighter) + front layer
          (darker). Two ridges with different silhouettes give a
          parallax-ish depth without needing JS. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-40 w-full text-ink-900 sm:h-56"
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYEnd slice"
      >
        <defs>
          <linearGradient id="ridge-fade-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.32" />
          </linearGradient>
        </defs>
        {/* Back ridge — lighter, further away */}
        <path
          d="M 0 240 L 0 130 L 90 100 L 180 130 L 280 70 L 380 105 L 500 60 L 620 95 L 740 55 L 860 90 L 960 70 L 1080 110 L 1200 80 L 1200 240 Z"
          fill="url(#ridge-fade-bg)"
        />
        {/* Front ridge — darker, more defined */}
        <path
          d="M 0 240 L 0 180 L 80 160 L 200 185 L 320 145 L 460 170 L 580 140 L 700 165 L 820 145 L 940 170 L 1060 150 L 1200 175 L 1200 240 Z"
          fill="currentColor"
          opacity="0.45"
        />
      </svg>
    </div>
  );
}
