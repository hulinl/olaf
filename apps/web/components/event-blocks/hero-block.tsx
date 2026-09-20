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
  /** Když true, CTA button se schová a místo něj přijde disabled-vypadající
   *  „Přihlášky uzavřené" label. User request 2026-09-11 — na proběhlé
   *  akce nesmí jít kliknout „Přihlásit". */
  ctaDisabled?: boolean;
  /** Label pro disabled state (jinak fallback „Přihlášky uzavřené"). */
  ctaDisabledLabel?: string;
  /** Event location fields — hero je čerpá přímo z eventu (single source
   *  of truth s Nastavením akce), když `payload.show_location = true`.
   *  Bez duplikace v payloadu → owner může měnit lokaci v Nastavení
   *  a hero se auto-aktualizuje. */
  eventLocationText?: string;
  eventMeetingPointText?: string;
  eventLocationUrl?: string;
}

export function HeroBlock({
  payload,
  fallbackTitle,
  fallbackCtaHref,
  fallbackCtaLabel = "Přihlásit na akci",
  badge,
  countLabel,
  tone = "canvas",
  ctaDisabled = false,
  ctaDisabledLabel = "Přihlášky uzavřené",
  eventLocationText = "",
  eventMeetingPointText = "",
  eventLocationUrl = "",
}: Props) {
  const showLocation =
    payload.show_location === true &&
    (eventLocationText.trim() !== "" || eventMeetingPointText.trim() !== "");
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
          {ctaDisabled ? (
            <span
              aria-disabled="true"
              className={[
                "inline-flex h-12 items-center justify-center rounded-md px-6 text-base font-semibold",
                onDark
                  ? "bg-white/15 text-white/70"
                  : "bg-surface-muted text-ink-500",
                "cursor-not-allowed select-none",
              ].join(" ")}
            >
              {ctaDisabledLabel}
            </span>
          ) : (
            <Link
              href={ctaHref}
              className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
            >
              {ctaLabel}
            </Link>
          )}
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

        {showLocation && (
          <HeroLocationCard
            locationText={eventLocationText}
            meetingPointText={eventMeetingPointText}
            locationUrl={eventLocationUrl}
            onDark={onDark}
          />
        )}
      </div>
    </section>
  );
}

/** Kompaktní lokační karta v hero. Data přímo z event settings —
 *  single source of truth s formulářem Nastavení. Když je zadaný
 *  `location_url`, celá karta funguje jako link do externí mapy;
 *  jinak je karta statická (jen text). Stylizovaná map-preview
 *  ikona (SVG s pinem) nahrazuje reálný static map — API klíč zatím
 *  nemáme, tohle vypadá záměrně, ne jako placeholder. */
function HeroLocationCard({
  locationText,
  meetingPointText,
  locationUrl,
  onDark,
}: {
  locationText: string;
  meetingPointText: string;
  locationUrl: string;
  onDark: boolean;
}) {
  const hasLink = locationUrl.trim() !== "";
  const inner = (
    <div className="flex items-center gap-4">
      <MapPreviewIcon onDark={onDark} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {locationText && (
          <span
            className={[
              "text-base font-semibold sm:text-lg",
              onDark ? "text-ink-inverse" : "text-ink-900",
            ].join(" ")}
            style={{
              textShadow: onDark ? "0 1px 8px rgba(0,0,0,0.5)" : undefined,
            }}
          >
            {locationText}
          </span>
        )}
        {meetingPointText && (
          <span
            className={[
              "text-sm",
              onDark ? "text-white/85" : "text-ink-500",
            ].join(" ")}
            style={{
              textShadow: onDark ? "0 1px 8px rgba(0,0,0,0.5)" : undefined,
            }}
          >
            Sraz: {meetingPointText}
          </span>
        )}
        {hasLink && (
          <span
            className={[
              "mt-1 inline-flex items-center gap-1 text-xs font-medium",
              onDark ? "text-white" : "text-brand",
            ].join(" ")}
          >
            Otevřít v mapě
            <span aria-hidden>→</span>
          </span>
        )}
      </div>
    </div>
  );
  const cardClasses = [
    "mt-6 max-w-xl rounded-lg border p-4 backdrop-blur-sm transition-colors",
    onDark
      ? "border-white/20 bg-white/[0.08] hover:bg-white/[0.14]"
      : "border-border bg-surface hover:bg-surface-muted",
  ].join(" ");
  if (hasLink) {
    return (
      <a
        href={locationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cardClasses} focus-ring`}
      >
        {inner}
      </a>
    );
  }
  return <div className={cardClasses}>{inner}</div>;
}

/** Stylizovaná mini-mapa jako SVG — grid pozadí + pin ve středu.
 *  Bez externího assetu / API klíče. Až budeme mít Maps API klíč, dá
 *  se nahradit reálným static map obrázkem beze změny okolí. */
function MapPreviewIcon({ onDark }: { onDark: boolean }) {
  return (
    <div
      aria-hidden
      className={[
        "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border sm:h-20 sm:w-20",
        onDark
          ? "border-white/20 bg-ink-900/60"
          : "border-border bg-surface-muted",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 80 80"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        {/* Map grid — zjednodušená mřížka jako z papírové mapy */}
        <g
          stroke={onDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.12)"}
          strokeWidth="1"
        >
          <line x1="0" y1="20" x2="80" y2="20" />
          <line x1="0" y1="40" x2="80" y2="40" />
          <line x1="0" y1="60" x2="80" y2="60" />
          <line x1="20" y1="0" x2="20" y2="80" />
          <line x1="40" y1="0" x2="40" y2="80" />
          <line x1="60" y1="0" x2="60" y2="80" />
        </g>
        {/* Náznak cesty */}
        <path
          d="M6 66 Q 28 50, 40 42 T 74 20"
          stroke={onDark ? "rgba(255,199,25,0.7)" : "rgba(255,159,10,0.85)"}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {/* Pin uprostřed */}
      <svg
        viewBox="0 0 24 24"
        className="relative m-auto block h-6 w-6 sm:h-7 sm:w-7"
        style={{ marginTop: "22%" }}
        aria-hidden
      >
        <path
          d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z"
          fill="#ffc719"
          stroke="#0f172a"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="9" r="2.5" fill="#0f172a" />
      </svg>
    </div>
  );
}
