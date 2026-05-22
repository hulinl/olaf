"use client";

import { useEffect, useState } from "react";

import type { FeatureEntry } from "@/lib/site-config";

/**
 * Sticky right-side TOC for the feature tour. Highlights the currently-
 * visible section via IntersectionObserver; clicks scroll to the
 * matching `id`. Visible only on lg+ — on mobile the user has the
 * burger menu and a long-scroll page; a sticky strip would steal
 * precious horizontal space without paying for it.
 *
 * Inspired by the bifactory-web article reading nav (right-side TOC
 * follows scroll, highlights active heading).
 */
export function FeatureToc({ features }: { features: FeatureEntry[] }) {
  const [active, setActive] = useState<string | null>(features[0]?.id ?? null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    // Trigger when the section's top crosses ~30 % from viewport top.
    // That's the point where the user "feels" they're reading it.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        if (visible.length > 0) {
          setActive(visible[0].target.id);
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

  return (
    <aside
      // Absolute-positioned right column = explicit sticky container.
      // Parent má `relative` + `pr-56` rezervaci pro tento sloupec.
      // Aside je `h-full` parentu (= features list height), sticky
      // uvnitř drží během features touru a propustí přesně na konci
      // posledního feature contentu — žádný stretching do navazující
      // sekce.
      className="pointer-events-none absolute right-4 top-0 hidden lg:bottom-0 lg:block lg:h-full lg:w-44"
      aria-label="Prohlídka sekcí"
    >
      <div className="pointer-events-auto sticky top-24 mt-24 flex flex-col gap-1 border-l border-border pl-5">
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
