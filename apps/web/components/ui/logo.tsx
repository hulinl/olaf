import { CSSProperties } from "react";

interface LogoProps {
  className?: string;
  size?: number;
  /** Show the wordmark beside the mark. Default true. */
  wordmark?: boolean;
  /**
   * How the amber sun is rendered.
   *  - "amber" (default): the sun is brand-amber (#ffc719) regardless of surrounding ink.
   *  - "current": the sun inherits the ring's currentColor — use this on amber surfaces
   *    where the dot would otherwise disappear (per brand manual §09).
   *  - "none": hide the sun entirely (rare — wordmark-equivalent in a monochrome row).
   */
  accent?: "amber" | "current" | "none";
  style?: CSSProperties;
}

/**
 * olaf mark — B · Sunrise.
 *
 * A two-peak horizon inside an open circle, with an amber sun cresting over
 * the higher peak. Built from one circle, one filled dot, and one polyline —
 * no gradients, no textures.
 *
 * Geometry locked to a 100×100 coordinate grid (see docs/brand/brand-manual.html
 * §03 for the spec). currentColor drives the ring + peaks so the mark adapts to
 * its container; the sun has its own colour because amber is the only accent
 * in the brand system.
 *
 * Wordmark stays lowercase "olaf" — never uppercase, never restyled.
 */
export function Logo({
  className = "",
  size = 28,
  wordmark = true,
  accent = "amber",
  style,
}: LogoProps) {
  const sunFill =
    accent === "amber"
      ? "var(--brand, #ffc719)"
      : accent === "current"
        ? "currentColor"
        : "none";

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      style={style}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r="44"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {accent !== "none" && (
          <circle cx="64" cy="34" r="6.5" fill={sunFill} />
        )}
        <polyline
          points="22,68 38,48 47,58 62,38 78,68"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {wordmark && (
        <span
          className="font-bold"
          style={{
            fontSize: size * 0.78,
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          olaf
        </span>
      )}
    </span>
  );
}
