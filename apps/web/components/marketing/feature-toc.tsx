"use client";

import { useEffect, useState } from "react";

import type { FeatureEntry } from "@/lib/site-config";

/**
 * Floating right-side TOC for the feature tour.
 *
 * Why `position: fixed` + JS visibility toggle instead of pure CSS
 * sticky: CSS sticky's release point is the parent's content-area
 * bottom, but the practical "I'm done with this section" moment is
 * when the LAST feature's content ends — not when the parent's
 * padding box ends, not at the start of the next dark section.
 *
 * Two observers run in parallel:
 *   - `activeObs` highlights the section currently nearest viewport top
 *   - `visibilityObs` (with rootMargin `-30% 0 -10% 0`) flips the
 *     `visible` flag based on whether ANY feature's middle band is
 *     in the viewport. The TOC unmounts as soon as the last feature
 *     scrolls past the top half of the viewport.
 *
 * `lg:fixed` positions independently of layout — the page reserves
 * 14rem of right-side space via `lg:pr-56` on the features wrapper
 * so the floating column doesn't overlap content.
 */
export function FeatureToc({ features }: { features: FeatureEntry[] }) {
  const [active, setActive] = useState<string | null>(features[0]?.id ?? null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) {
      // Old browser fallback — keep TOC always visible during tour.
      setVisible(true);
      return;
    }

    const featureEls = features
      .map((f) => document.getElementById(f.id))
      .filter((el): el is HTMLElement => el !== null);

    // Active-section highlight — pick the one closest to viewport top.
    const activeObs = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        if (inView.length > 0) {
          setActive(inView[0].target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );

    // Visibility — TOC visible if ANY feature has its "reading zone"
    // (top 70 % of viewport) intersecting the viewport. The moment
    // the last feature scrolls past, all observers go offscreen and
    // `visibilityState` collapses to "no intersections" → hide.
    let intersectingCount = 0;
    const visibilityObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) intersectingCount++;
          else intersectingCount--;
        }
        setVisible(intersectingCount > 0);
      },
      { rootMargin: "0px 0px -30% 0px", threshold: 0 },
    );

    for (const el of featureEls) {
      activeObs.observe(el);
      visibilityObs.observe(el);
    }

    return () => {
      activeObs.disconnect();
      visibilityObs.disconnect();
    };
  }, [features]);

  return (
    <aside
      // Fixed positioning v pravo, mimo flow stránky. `visible`
      // řídí display takže TOC nezamořuje viewport mimo feature tour.
      // `lg:pr-56` na features wrapperu rezervuje místo aby nedošlo
      // k překryvu s nábožně klikatelnými prvky vpravo.
      className={[
        "fixed right-6 top-24 z-10 hidden w-44 transition-opacity duration-200 lg:block",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
      aria-label="Prohlídka sekcí"
      aria-hidden={!visible}
    >
      <div className="flex flex-col gap-1 border-l border-border pl-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-500">
          Prohlídka
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {features.map((f) => {
            const isActive = active === f.id;
            return (
              <li key={f.id}>
                <a
                  href={`#${f.id}`}
                  className={[
                    "group flex items-baseline gap-2 rounded py-1 text-sm transition-colors focus-ring",
                    isActive
                      ? "text-brand"
                      : "text-ink-500 hover:text-ink-900",
                  ].join(" ")}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span
                    className={[
                      "font-mono text-[10px] transition-colors",
                      isActive ? "text-brand" : "text-ink-300",
                    ].join(" ")}
                  >
                    {f.number}
                  </span>
                  <span className={isActive ? "font-medium" : ""}>
                    {f.tag}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
