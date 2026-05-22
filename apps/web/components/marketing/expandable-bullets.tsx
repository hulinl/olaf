"use client";

import { useState } from "react";

/**
 * Mobile-friendly bullets list. Below lg renders only the first
 * `previewCount` items + "Číst více" toggle that reveals the rest.
 * From lg up shows everything always (desktop has the vertical real
 * estate, no need to gate).
 *
 * `renderItem` injects each item — keeps inline-code rendering in
 * one place (FeatureSection passes its `renderInlineCode` helper).
 */
export function ExpandableBullets({
  items,
  previewCount = 2,
  renderItem,
}: {
  items: string[];
  previewCount?: number;
  renderItem: (text: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasOverflow = items.length > previewCount;
  // On lg+ all items are visible regardless of `expanded` (CSS makes
  // the hidden items show themselves at lg breakpoint).
  return (
    <div>
      <ul className="flex flex-col gap-2.5 text-ink-700">
        {items.map((bullet, idx) => {
          const visibleOnMobile = idx < previewCount || expanded;
          return (
            <li
              key={bullet}
              className={[
                "flex gap-3",
                visibleOnMobile ? "" : "hidden lg:flex",
              ].join(" ")}
            >
              <span
                aria-hidden
                className="mt-2 size-1.5 shrink-0 rounded-full bg-brand"
              />
              <span dangerouslySetInnerHTML={{ __html: renderItem(bullet) }} />
            </li>
          );
        })}
      </ul>
      {hasOverflow && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover focus-ring lg:hidden"
        >
          Číst více <span aria-hidden>↓</span>
        </button>
      )}
    </div>
  );
}
