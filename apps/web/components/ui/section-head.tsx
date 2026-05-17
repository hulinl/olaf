import { ReactNode } from "react";

interface Props {
  /** Small mono uppercase label above the title, e.g. "DETAILY" or "PROGRAM". */
  eyebrow?: ReactNode;
  /** Display title — Geist Sans 600, ~32–38px per brand manual §07. */
  title: ReactNode;
  /** Optional one-line lead under the title (brand manual: Geist Sans 500 22px). */
  lead?: ReactNode;
  /** Tone variant for surfaces. */
  tone?: "light" | "dark";
  className?: string;
}

/**
 * Brand-aligned section head. Renders the small mono eyebrow, the display
 * title in Geist Sans 600 with tight tracking, and an underline rule — per
 * `docs/brand/brand-manual.html` §07 (Typography) and the manual's own
 * .section-head pattern.
 *
 * Replaces the legacy "inline-block bg-ink-900 px-3 py-1.5 …" treatment.
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  tone = "light",
  className = "",
}: Props) {
  const dark = tone === "dark";
  return (
    <div
      className={[
        "pb-5 border-b mb-10",
        dark ? "border-white/15" : "border-border",
        className,
      ].join(" ")}
    >
      {eyebrow && (
        <p
          className={[
            "font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
            dark ? "text-white/60" : "text-ink-500",
          ].join(" ")}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={[
          "mt-2 text-3xl font-semibold tracking-tight sm:text-4xl",
          dark ? "text-ink-inverse" : "text-ink-900",
        ].join(" ")}
        style={{ letterSpacing: "-0.025em", lineHeight: 1.05 }}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={[
            "mt-4 max-w-2xl text-lg sm:text-xl",
            dark ? "text-white/75" : "text-ink-700",
          ].join(" ")}
          style={{ letterSpacing: "-0.01em", lineHeight: 1.4, fontWeight: 500 }}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
