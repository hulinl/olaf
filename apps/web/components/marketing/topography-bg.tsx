/**
 * Light topographic-contour decoration for the landing hero.
 * One soft summit, six nested non-crossing rings, no labels. Low opacity
 * so it whispers behind the headline.
 */
export function TopographyBg() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-ink-900/[0.10]"
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="topo-fade" cx="50%" cy="55%" r="75%">
          <stop offset="0%" stopColor="white" stopOpacity="0.1" />
          <stop offset="55%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </radialGradient>
        <mask id="topo-mask">
          <rect width="100%" height="100%" fill="url(#topo-fade)" />
        </mask>
      </defs>

      <g
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        mask="url(#topo-mask)"
      >
        {/* Six nested rings around a single summit at (600, 360). Each is
            strictly inside the previous one — proper map contour behaviour. */}
        <path d="M 80 380 C 180 200 420 130 640 150 C 880 170 1060 280 1130 410 C 1180 500 1080 555 880 555 C 540 555 220 530 110 480 C 50 450 50 415 80 380 Z" />
        <path d="M 180 380 C 260 230 460 175 650 195 C 850 210 1010 305 1065 410 C 1100 480 1020 520 850 520 C 560 520 290 500 200 460 C 160 440 155 410 180 380 Z" />
        <path d="M 280 380 C 340 270 490 230 660 245 C 820 260 950 335 990 410 C 1015 460 950 488 820 488 C 580 488 360 472 290 442 C 260 425 260 405 280 380 Z" />
        <path d="M 380 380 C 425 310 530 285 660 295 C 790 305 880 360 905 410 C 920 445 870 462 790 462 C 600 462 430 450 380 425 C 365 415 365 397 380 380 Z" />
        <path d="M 470 380 C 505 335 575 320 660 328 C 750 335 815 372 825 408 C 830 432 790 442 750 442 C 615 442 510 432 480 415 C 470 408 470 395 470 380 Z" />
        <path d="M 555 380 C 575 358 615 350 660 355 C 705 360 740 380 745 405 C 745 422 720 428 700 428 C 625 428 575 422 562 412 C 555 408 555 395 555 380 Z" />
      </g>
    </svg>
  );
}
