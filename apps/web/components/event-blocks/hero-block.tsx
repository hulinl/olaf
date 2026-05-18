import Link from "next/link";

import { assetUrl } from "@/lib/api";
import type { BlockTone, HeroBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: HeroBlockPayload;
  /** Fallback heading when payload.title_override is empty. */
  fallbackTitle: string;
  fallbackCtaHref: string;
  fallbackCtaLabel?: string;
  /** Status badge from the public landing — passed through here so it sits on the hero. */
  badge?: React.ReactNode;
  tone?: BlockTone;
}

export function HeroBlock({
  payload,
  fallbackTitle,
  fallbackCtaHref,
  fallbackCtaLabel = "Přihlásit na akci",
  badge,
  tone = "canvas",
}: Props) {
  const cover = assetUrl(payload.cover_url);
  const title = payload.title_override || fallbackTitle;
  const ctaLabel = payload.cta_label || fallbackCtaLabel;
  const ctaHref = payload.cta_href || fallbackCtaHref;
  // A cover photo always renders as dark surface (overlay). Otherwise the
  // `tone` decides — `ink` paints a solid dark hero, `canvas` is the
  // original light hero.
  const onDark = Boolean(cover) || tone === "ink";

  return (
    <section
      className={[
        "relative isolate overflow-hidden",
        cover
          ? "min-h-[440px] sm:min-h-[520px]"
          : tone === "ink"
            ? "bg-ink-900 text-ink-inverse"
            : "border-b border-border",
      ].join(" ")}
    >
      {cover && (
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.85) 100%), url(${cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}

      <div
        className={[
          "mx-auto flex max-w-5xl flex-col items-start gap-6 px-4",
          cover ? "py-24 sm:py-32" : "py-20 sm:py-24",
        ].join(" ")}
      >
        {badge}

        {payload.eyebrow && (
          <p
            className={[
              "font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
              onDark ? "text-white/80" : "text-ink-500",
            ].join(" ")}
          >
            {payload.eyebrow}
          </p>
        )}

        <h1
          className={[
            "max-w-3xl text-5xl font-semibold leading-[0.95] sm:text-6xl md:text-7xl",
            onDark ? "text-ink-inverse" : "text-ink-900",
          ].join(" ")}
          style={{
            letterSpacing: "-0.035em",
            textShadow: cover ? "0 2px 24px rgba(0,0,0,0.45)" : undefined,
          }}
        >
          {title}
        </h1>

        {payload.subtitle && (
          <p
            className={[
              "max-w-2xl text-lg sm:text-xl",
              onDark ? "text-white/95" : "text-ink-700",
            ].join(" ")}
            style={{
              letterSpacing: "-0.01em",
              lineHeight: 1.4,
              fontWeight: 500,
              textShadow: cover ? "0 1px 12px rgba(0,0,0,0.5)" : undefined,
            }}
          >
            {payload.subtitle}
          </p>
        )}

        <div className="mt-2">
          <Link
            href={ctaHref}
            className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
          >
            {ctaLabel}
          </Link>
        </div>

        {payload.meta && payload.meta.length > 0 && (
          <dl
            className={[
              "mt-6 flex flex-wrap gap-x-10 gap-y-5 border-t pt-7",
              onDark ? "border-white/20" : "border-border",
            ].join(" ")}
          >
            {payload.meta.map((m, i) => (
              <div key={i} className="min-w-[120px]">
                <dt
                  className={[
                    "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
                    onDark ? "text-white/65" : "text-ink-500",
                  ].join(" ")}
                >
                  {m.k}
                </dt>
                <dd
                  className={[
                    "mt-1 text-xl font-semibold sm:text-2xl",
                    onDark ? "text-ink-inverse" : "text-ink-900",
                  ].join(" ")}
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {m.v}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
