"use client";

import { useState } from "react";

/**
 * Mobile-friendly bullets list. Below lg renders only the first
 * `previewCount` items + "Číst více" toggle that reveals the rest.
 * From lg up shows everything always (desktop has the vertical real
 * estate, no need to gate).
 *
 * Inline-code rendering happens INSIDE this component (not via a
 * function prop from the parent) — server components can't pass
 * function props into client components, and ExpandableBullets is
 * always rendered by FeatureSection (server). Caused the homepage
 * to crash with a Server Components error on first deploy.
 */
export function ExpandableBullets({
  items,
  previewCount = 2,
}: {
  items: string[];
  previewCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasOverflow = items.length > previewCount;
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
              <span
                dangerouslySetInnerHTML={{ __html: renderInlineCode(bullet) }}
              />
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

function renderInlineCode(text: string): string {
  // Backtick → <code> v bullets. Escapuje HTML aby <code> v
  // dangerouslySetInnerHTML nikoho nezranilo.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-ink-900">$1</code>',
  );
}
