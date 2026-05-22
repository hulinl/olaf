"use client";

import { useEffect, useState } from "react";

import type { MdxHeading } from "@/lib/content";

/**
 * Sticky right-side TOC for an article (manual or blog). Same UX as
 * the homepage `FeatureToc` but lists h2/h3 headings extracted from
 * the MDX source instead of section IDs.
 *
 * `level=3` headings get indented one step. Visible only on lg+ —
 * mobile gets full-width content, the article is short enough that
 * a TOC would feel like overkill on a phone.
 *
 * Active heading is detected by IntersectionObserver — same logic
 * as FeatureToc, so the two surfaces feel identical when you switch
 * between landing and a docs page.
 */
export function ArticleToc({ headings }: { headings: MdxHeading[] }) {
  const [active, setActive] = useState<string | null>(headings[0]?.slug ?? null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

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
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 },
    );

    for (const h of headings) {
      const el = document.getElementById(h.slug);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <aside
      // Sticky on the aside itself s `self-start` aby aside nestretchoval
      // celou flex výšku → sticky release synchronní s koncem článku, ne
      // až na úrovni footeru. `mt-16` na lg+ srovná první item s první
      // h2 (article má sm:py-16 vlastní top padding).
      className="hidden lg:block lg:sticky lg:top-24 lg:mt-16 lg:h-max lg:w-52 lg:shrink-0 lg:self-start"
      aria-label="Obsah článku"
    >
      <div className="flex flex-col gap-1 border-l border-border pl-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-500">
          Obsah
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {headings.map((h) => {
            const isActive = active === h.slug;
            return (
              <li key={h.slug}>
                <a
                  href={`#${h.slug}`}
                  className={[
                    "block rounded py-1 text-sm leading-snug transition-colors focus-ring",
                    h.level === 3 ? "pl-4" : "",
                    isActive
                      ? "text-brand"
                      : "text-ink-500 hover:text-ink-900",
                  ].join(" ")}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className={isActive ? "font-medium" : ""}>
                    {h.title}
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
