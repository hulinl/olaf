"use client";

import { useEffect, useState } from "react";

import type { FeatureEntry } from "@/lib/site-config";

/**
 * Sticky right-side TOC for the feature tour — back to anchored
 * in-flow layout (user feedback: floating fixed positioning byla
 * "moc napravo a hodně malé", anchored sticky se mu líbila víc).
 *
 * Layout: flex sibling of the features column. `self-start` opts
 * out of flex-stretch tak aby aside height = content height (ne
 * celá flex container height). Sticky `<div>` uvnitř sleduje scroll
 * v rámci aside.
 *
 * Release point — řízen výškou flex containeru (= features column).
 * Page reduces LAST feature section's bottom padding to zero tak že
 * release se trigne PŘESNĚ tam kde poslední bullet končí, ne až po
 * 96 px padding bufferu.
 *
 * Active highlight ze IntersectionObserver (separate concern).
 */
export function FeatureToc({ features }: { features: FeatureEntry[] }) {
  const [active, setActive] = useState<string | null>(features[0]?.id ?? null);

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

  return (
    <aside
      className="hidden lg:block lg:sticky lg:top-24 lg:mt-24 lg:h-max lg:w-56 lg:shrink-0 lg:self-start"
      aria-label="Prohlídka sekcí"
    >
      <div className="flex flex-col gap-1 border-l border-border pl-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-500">
          Prohlídka
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {features.map((f) => {
            const isActive = active === f.id;
            return (
              <li key={f.id}>
                <a
                  href={`#${f.id}`}
                  className={[
                    "group flex items-baseline gap-2 rounded py-0.5 text-[15px] leading-snug transition-colors focus-ring",
                    isActive
                      ? "text-brand"
                      : "text-ink-500 hover:text-ink-900",
                  ].join(" ")}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span
                    className={[
                      "font-mono text-[11px] transition-colors",
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
