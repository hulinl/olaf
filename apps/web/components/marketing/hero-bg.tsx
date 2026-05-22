/**
 * Layered marketing hero background. Inspired by bifactory-web's
 * Hero, adapted to OLAF's Sunrise brand (mountain + sun + amber).
 *
 * Layers (bottom → top):
 *   1) Amber sunrise glow (radial, sits behind headline, slow pulse)
 *   2) Topographic contours (slow horizontal drift)
 *   3) Mountain silhouette ridge along bottom
 *   4) Floating dots — community / light specks (independent drifts)
 *
 * All animations are CSS-driven (no JS). `prefers-reduced-motion`
 * disables them at the global stylesheet level.
 */
export function HeroBg() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* 1) Sunrise glow — amber radial behind the centre of the hero */}
      <div
        className="sunrise-glow absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(245, 158, 11, 0.20) 0%, rgba(245, 158, 11, 0.08) 35%, transparent 65%)",
        }}
      />

      {/* 2) Topographic contour layer — slow horizontal drift */}
      <svg
        className="topo-drift absolute inset-y-0 -left-12 right-0 h-full w-[calc(100%+96px)] text-ink-900/[0.09]"
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

      {/* 3) Mountain ridge at bottom — static, frames the section */}
      <svg
        className="absolute inset-x-0 bottom-0 h-32 w-full text-ink-900/15 sm:h-44"
        viewBox="0 0 1200 200"
        preserveAspectRatio="xMidYEnd slice"
      >
        <defs>
          <linearGradient id="ridge-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path
          d="M 0 200 L 0 120 L 120 80 L 220 110 L 320 60 L 420 95 L 520 50 L 640 90 L 760 55 L 880 95 L 980 70 L 1080 110 L 1200 75 L 1200 200 Z"
          fill="url(#ridge-fade)"
        />
        <path
          d="M 0 200 L 0 160 L 100 130 L 240 155 L 360 125 L 500 145 L 620 115 L 740 140 L 880 120 L 1000 145 L 1120 130 L 1200 150 L 1200 200 Z"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>

      {/* 4) Floating dots — 5 specks with independent delays */}
      <FloatingDots />
    </div>
  );
}

function FloatingDots() {
  // Brand-amber dots that drift slowly. Coordinates kept off the
  // headline so the eye stays on text. Delays staggered so they
  // never sync.
  const dots = [
    { x: "12%", y: "22%", size: 8, delay: "0s" },
    { x: "18%", y: "68%", size: 5, delay: "3s" },
    { x: "78%", y: "30%", size: 6, delay: "1.5s" },
    { x: "88%", y: "72%", size: 7, delay: "5s" },
    { x: "52%", y: "12%", size: 4, delay: "7s" },
  ];
  return (
    <>
      {dots.map((d, i) => (
        <span
          key={i}
          className="float-dot absolute rounded-full bg-brand"
          style={{
            left: d.x,
            top: d.y,
            width: d.size,
            height: d.size,
            animationDelay: d.delay,
          }}
        />
      ))}
    </>
  );
}
