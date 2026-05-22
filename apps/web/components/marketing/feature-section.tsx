import Link from "next/link";

import { ExpandableBullets } from "@/components/marketing/expandable-bullets";
import type { FeatureEntry } from "@/lib/site-config";

/**
 * One feature section on the homepage. Renders alternating left/right
 * screenshot vs copy on lg+, single column on mobile.
 *
 * Screenshots are sourced from /public/screenshots — for now those are
 * SVG placeholders; real PNGs will swap in via the same paths so this
 * component doesn't change when we capture them.
 */
export function FeatureSection({ feature }: { feature: FeatureEntry }) {
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

  const visual = (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-lg shadow-black/5">
      <div className="aspect-[16/10] w-full bg-surface-muted">
        {/* SVG mockupy renderujem jako native <img> — next/image
            přidává URL transformace přes /_next/image které u SVG v
            public/ na SWA neumí (vrací 404 nebo nesprávný MIME).
            <img> je pro statický asset bez paramterů ten správný
            primitiv. */}
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

  return (
    <section
      id={feature.id}
      className="scroll-mt-20 border-t border-border-strong/20 bg-canvas"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20 lg:py-24">
        <div
          className={[
            "grid items-center gap-10 lg:grid-cols-2 lg:gap-14",
            feature.side === "left" ? "lg:[&>*:first-child]:order-2" : "",
          ].join(" ")}
        >
          {copy}
          {visual}
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
      <span className="text-brand">{title.slice(idx, idx + highlight.length)}</span>
      {title.slice(idx + highlight.length)}
    </>
  );
}

