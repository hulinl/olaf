import Link from "next/link";

import { assetUrl } from "@/lib/api";
import type { HeroBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: HeroBlockPayload;
  /** Fallback heading when payload.title_override is empty. */
  fallbackTitle: string;
  fallbackCtaHref: string;
  fallbackCtaLabel?: string;
  /** Status badge from the public landing — passed through here so it sits on the hero. */
  badge?: React.ReactNode;
}

export function HeroBlock({
  payload,
  fallbackTitle,
  fallbackCtaHref,
  fallbackCtaLabel = "Přihlásit na akci",
  badge,
}: Props) {
  const cover = assetUrl(payload.cover_url);
  const title = payload.title_override || fallbackTitle;
  const ctaLabel = payload.cta_label || fallbackCtaLabel;
  const ctaHref = payload.cta_href || fallbackCtaHref;

  return (
    <section className="relative min-h-[420px] overflow-hidden">
      <div
        className="absolute inset-0 -z-10 bg-surface-strong"
        style={
          cover
            ? {
                backgroundImage: `linear-gradient(rgba(0,0,0,0.05), rgba(0,0,0,0.05)), url(${cover})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className="mx-auto flex max-w-5xl flex-col items-start px-4 py-20 sm:py-28">
        {badge}
        {payload.eyebrow && (
          <span className="mb-4 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-ink-inverse backdrop-blur">
            {payload.eyebrow}
          </span>
        )}
        <h1 className="max-w-3xl bg-ink-900 px-3 py-2 text-3xl font-semibold leading-tight tracking-tight text-ink-inverse sm:text-5xl">
          {title.toUpperCase()}
        </h1>
        {payload.subtitle && (
          <p className="mt-5 max-w-2xl bg-ink-900 px-3 py-2 text-sm leading-relaxed text-ink-inverse sm:text-base">
            {payload.subtitle}
          </p>
        )}
        <div className="mt-8">
          <Link
            href={ctaHref}
            className="inline-flex h-12 items-center justify-center rounded-md bg-ink-900 px-6 text-base font-semibold text-ink-inverse transition-colors hover:bg-ink-700 focus-ring"
          >
            {ctaLabel}
          </Link>
        </div>
        {payload.meta && payload.meta.length > 0 && (
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5 border-t border-white/30 pt-7">
            {payload.meta.map((m, i) => (
              <div key={i} className="min-w-[120px]">
                <dt className="text-[10px] font-medium uppercase tracking-widest text-ink-inverse/70">
                  {m.k}
                </dt>
                <dd className="mt-1 text-lg font-semibold text-ink-inverse sm:text-xl">
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
