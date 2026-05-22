/**
 * Layered marketing hero background — sunrise over a continuous ridge.
 *
 * Layers (bottom → top in z-order):
 *   1) Amber radial glow (diffuse warm wash, slow breathe)
 *   2) Sun disc rising behind the ridge (small amber orb)
 *   3) Mountain ridge silhouettes — two layers for parallax depth.
 *      The SVG is intentionally wider than the viewport (preserveAspect
 *      slice + 1200×240 box stretched edge-to-edge) so the ridge runs
 *      OFF the screen on both sides — no awkward "sliced cliff" at the
 *      left/right edge.
 *
 * Earlier versions had topographic contour rings drifting in the
 * background and floating amber dots. Both were dropped: contours
 * looked cluttered under the headline, and dots-on-contours read as
 * peak markers on a topo map (semantically wrong). The sunrise +
 * ridge composition stands on its own.
 *
 * All animations are CSS-driven (no JS). prefers-reduced-motion
 * disables them at the stylesheet level.
 */
export function HeroBg() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* 1) Diffuse amber wash — pulse pattern keeps it alive */}
      <div
        className="sunrise-glow absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(245, 158, 11, 0.22) 0%, rgba(245, 158, 11, 0.08) 38%, transparent 68%)",
        }}
      />

      {/* 2) Sun disc — sits behind the ridge, slightly off-centre right
          so it reads as morning sun over a mountain ridge. */}
      <div
        className="sunrise-glow absolute bottom-24 right-[20%] h-44 w-44 rounded-full sm:bottom-28 sm:right-[24%] sm:h-56 sm:w-56"
        style={{
          background:
            "radial-gradient(circle at center, rgba(245, 158, 11, 0.85) 0%, rgba(245, 158, 11, 0.45) 40%, rgba(245, 158, 11, 0) 75%)",
          animationDelay: "1.2s",
        }}
      />

      {/* 3) Mountain ridges — two layers, both 150 % viewport width so
          they extend off-screen on both sides (no sliced cliff edges).
          The SVG is positioned `-left-[25%]` and `w-[150%]`. */}
      <svg
        className="absolute bottom-0 -left-[25%] h-44 w-[150%] text-ink-900 sm:h-60"
        viewBox="0 0 1800 240"
        preserveAspectRatio="xMidYEnd slice"
      >
        <defs>
          <linearGradient id="ridge-fade-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.32" />
          </linearGradient>
        </defs>
        {/* Back ridge — lighter, distant. Wide arc with multiple peaks
            that continues past both edges. */}
        <path
          d="M -50 240
             L -50 130
             L 100 95
             L 230 130
             L 360 70
             L 480 105
             L 620 60
             L 760 95
             L 900 55
             L 1040 90
             L 1180 70
             L 1320 110
             L 1450 75
             L 1600 105
             L 1750 80
             L 1850 110
             L 1850 240 Z"
          fill="url(#ridge-fade-bg)"
        />
        {/* Front ridge — darker, closer. Different peak rhythm so the
            two ridges look like layered terrain, not the same shape
            twice. */}
        <path
          d="M -50 240
             L -50 180
             L 60 160
             L 200 185
             L 340 150
             L 500 175
             L 640 145
             L 780 170
             L 920 150
             L 1060 175
             L 1200 155
             L 1360 180
             L 1520 155
             L 1680 180
             L 1850 160
             L 1850 240 Z"
          fill="currentColor"
          opacity="0.48"
        />
      </svg>
    </div>
  );
}
