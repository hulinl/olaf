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
  /** Subtle count text („4 z 20 přihlášeno") shown next to the CTA button. */
  countLabel?: string | null;
  tone?: BlockTone;
}

export function HeroBlock({
  payload,
  fallbackTitle,
  fallbackCtaHref,
  fallbackCtaLabel = "Přihlásit na akci",
  badge,
  countLabel,
  tone = "canvas",
}: Props) {
  const cover = assetUrl(payload.cover_url);
  const title = payload.title_override || fallbackTitle;
  const ctaLabel = payload.cta_label || fallbackCtaLabel;
  // Ignore anchor-only cta_href (e.g. "#rsvp") — landing has no such
  // section, so the click would just mutate the URL hash and dead-end.
  // Older presets used to seed "#rsvp" here; existing events keep that
  // value in DB and this guard makes the CTA jump to the real RSVP page.
  const payloadCta = payload.cta_href?.trim() ?? "";
  const ctaHref = payloadCta && !payloadCta.startsWith("#")
    ? payloadCta
    : fallbackCtaHref;
  // A cover photo always renders as dark surface (overlay). Otherwise the
  // `tone` decides — `ink` paints a solid dark hero, `canvas` is the
  // original light hero.
  const onDark = Boolean(cover) || tone === "ink";

  return (
    <section
      className={[
        "relative isolate flex flex-col overflow-hidden",
        // S coverem tlačíme content do spodní třetiny — fotka pak dýchá,
        // gradient dole udrží čitelnost textu. Bez coveru zůstává původní
        // top-flow (nemá smysl anchor-ovat text ke dnu když není pozadí).
        cover
          ? "min-h-[440px] justify-end sm:min-h-[520px]"
          : tone === "ink"
            ? "bg-ink-900 text-ink-inverse"
            : "border-b border-border",
      ].join(" ")}
    >
      {cover && (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover"
            style={{
              objectPosition: `${payload.focal_x ?? 50}% ${payload.focal_y ?? 50}%`,
              transform: `scale(${(payload.zoom ?? 100) / 100})`,
              transformOrigin: `${payload.focal_x ?? 50}% ${payload.focal_y ?? 50}%`,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.85) 100%)",
            }}
          />
        </div>
      )}

      <div
        className={[
          "mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-4",
          // Cover verze: menší bottom-padding, větší top-padding = ukotveno
          // ke dnu, ale zůstává vzduch nad heroem (badge nesedí těsně na
          // hlavičce). Bez coveru: symetrický padding jako předtím.
          cover ? "pb-14 pt-24 sm:pb-16 sm:pt-32" : "py-20 sm:py-24",
        ].join(" ")}
      >
        {/* Tight header group: badge → eyebrow → title s malým gap-3 (12px)
            místo hlavního gap-6, aby "20 volných míst" sedělo blízko
            nadpisu. User feedback 2026-09-03: velké mezery vypadaly
            odpojené od titulu. */}
        <div className="flex flex-col items-start gap-3">
          {badge}
          {payload.eyebrow &&
            (cover ? (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.12] px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md"
              >
                <span aria-hidden className="text-brand" style={{ fontSize: "0.85em", lineHeight: 1 }}>
                  ●
                </span>
                {payload.eyebrow}
              </span>
            ) : (
              <p
                className={[
                  "inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.2em]",
                  tone === "ink" ? "text-white/85" : "text-ink-900",
                ].join(" ")}
              >
                <span aria-hidden className="text-brand" style={{ fontSize: "0.85em", lineHeight: 1 }}>
                  ●
                </span>
                {payload.eyebrow}
              </p>
            ))}
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
        </div>

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

        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href={ctaHref}
            className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
          >
            {ctaLabel}
          </Link>
          {countLabel && (
            <span
              className={[
                "text-sm font-medium",
                onDark ? "text-white/85" : "text-ink-500",
              ].join(" ")}
              style={{
                textShadow: cover ? "0 1px 8px rgba(0,0,0,0.45)" : undefined,
              }}
            >
              {countLabel}
            </span>
          )}
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
