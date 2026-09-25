import Link from "next/link";
import type { ReactNode } from "react";

import { ExpandableBullets } from "@/components/marketing/expandable-bullets";
import type { FeatureEntry } from "@/lib/site-config";

/**
 * One feature section on the homepage. Renders alternating left/right
 * visual vs copy on lg+, single column on mobile.
 *
 * `visual` slot přijme JSX (typicky device frame + screen mockup z
 * `components/marketing/mockups/`). Pokud nedodáš, fallback je SVG
 * placeholder z `/public/screenshots/…` — zůstává pro backward-compat,
 * ale nový landing v2 posílá reálné HTML mockupy.
 */
export function FeatureSection({
  feature,
  visual,
}: {
  feature: FeatureEntry;
  visual?: ReactNode;
}) {
  const copy = (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-brand">
        <span className="font-mono">{feature.number}</span>
        <span aria-hidden>·</span>
        <span>{feature.tag}</span>
      </div>
      <h2
        className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl"
        style={{ letterSpacing: "-0.02em", lineHeight: 1.15 }}
      >
        {feature.highlight ? (
          renderHighlighted(feature.title, feature.highlight)
        ) : (
          feature.title
        )}
      </h2>
      <p className="text-lg leading-relaxed text-ink-700">{feature.lede}</p>
      <ExpandableBullets items={feature.bullets} previewCount={2} />
      {feature.manualSlug && (
        <div>
          <Link
            href={`/manual/${feature.manualSlug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-hover focus-ring"
          >
            Návod: {feature.title.toLowerCase()} →
          </Link>
        </div>
      )}
    </div>
  );

  const fallbackVisual = (
    <div className="relative overflow-hidden rounded-sm border border-border bg-surface shadow-lg shadow-black/5">
      <div className="aspect-[16/10] w-full bg-surface-muted">
        {/* SVG placeholder fallback (legacy). Nový landing dodává
            `visual` prop s reálným HTML mockupem, tenhle path se
            aktivuje jen když někdo přidá novou FEATURES entry a
            zapomene visual. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={feature.screenshot}
          alt={feature.screenshotAlt ?? feature.title}
          width={1280}
          height={800}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
  const visualBlock = visual ?? fallbackVisual;

  return (
    <section
      id={feature.id}
      className="scroll-mt-20 border-t border-border bg-canvas"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20 lg:py-24">
        <div
          className={[
            "grid items-center gap-10 lg:grid-cols-2 lg:gap-14",
            feature.side === "left" ? "lg:[&>*:first-child]:order-2" : "",
          ].join(" ")}
        >
          {copy}
          {visualBlock}
        </div>
      </div>
    </section>
  );
}

function renderHighlighted(title: string, highlight: string) {
  const idx = title.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="text-amber-glow">{title.slice(idx, idx + highlight.length)}</span>
      {title.slice(idx + highlight.length)}
    </>
  );
}

