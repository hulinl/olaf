"use client";

import { useEffect, useState } from "react";

import type { FeatureEntry } from "@/lib/site-config";

/**
 * Floating right-side TOC for the feature tour.
 *
 * Visibility uses two sentinel DOM nodes (`#tour-start`, `#tour-end`)
 * placed by the page around the features map. On every scroll tick
 * we read their getBoundingClientRect and apply a simple rule:
 *
 *   visible = start.top < THRESHOLD_TOP
 *             AND end.top > THRESHOLD_BOTTOM
 *
 * — i.e. user has scrolled past the start of the tour AND hasn't yet
 * scrolled past the end. Predictable, no IntersectionObserver quirks
 * around root-margin or initial dispatch states.
 *
 * Active-section highlight stays on IntersectionObserver (cheap +
 * doesn't need to be perfectly synced with visibility).
 */
export function FeatureToc({ features }: { features: FeatureEntry[] }) {
  const [active, setActive] = useState<string | null>(features[0]?.id ?? null);
  const [visible, setVisible] = useState(false);

  // Active highlight — same observer pattern as before, separate
  // concern from visibility.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
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

    for (const f of features) {
      const el = document.getElementById(f.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [features]);

  // Visibility — scroll-based sentinel polling. Cheaper than
  // double-IntersectionObserver and easier to reason about.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function compute() {
      const start = document.getElementById("feature-tour-start");
      const end = document.getElementById("feature-tour-end");
      if (!start || !end) {
        setVisible(false);
        return;
      }
      const startTop = start.getBoundingClientRect().top;
      const endTop = end.getBoundingClientRect().top;
      // TOC zobrazujeme jakmile start sentinel proletěl nad horní
      // pětinou viewportu (= user už opustil hero), a schováváme
      // hned jakmile end sentinel dosáhne stejné linky (= user
      // narazil na konec posledního feature contentu).
      const threshold = Math.max(120, window.innerHeight * 0.2);
      setVisible(startTop < threshold && endTop > threshold);
    }

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  return (
    <aside
      // Wider (`w-48` = 192px) + further from edge (`right-10` = 40px)
      // tak aby na desktop monitoru nepůsobila vystrčená z viewportu.
      className={[
        "fixed right-10 top-28 z-10 hidden w-48 transition-opacity duration-200 lg:block",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
      aria-label="Prohlídka sekcí"
      aria-hidden={!visible}
    >
      <div className="flex flex-col gap-1 border-l border-border pl-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-500">
          Prohlídka
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {features.map((f) => {
            const isActive = active === f.id;
            return (
              <li key={f.id}>
                <a
                  href={`#${f.id}`}
                  className={[
                    "group flex items-baseline gap-2 rounded py-0.5 text-sm leading-tight transition-colors focus-ring",
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
