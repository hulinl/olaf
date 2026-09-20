import Link from "next/link";

import { assetUrl } from "@/lib/api";
import {
  type BlockTone,
  type HeroBlockPayload,
  formatCzDateRange,
  formatCzTimeRange,
} from "@/lib/event-blocks";

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
  /** Event date fields — když `payload.show_dates = true`, hero prepend-ne
   *  meta tile „Termín" s auto-formátovaným rozsahem + sub-řádkem
   *  s časem v `eventTz`. */
  eventStartsAt?: string;
  eventEndsAt?: string;
  eventTz?: string;
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
  eventStartsAt = "",
  eventEndsAt = "",
  eventTz = "",
}: Props) {
  // Systémové meta dlaždice (Místo / Termín) - auto z eventu, když
  // owner v hero-form zaškrtl příslušný toggle. Prepend-nou se před
  // custom `payload.meta`, aby stály v gridu jako první.
  const systemTiles = buildSystemTiles(
    payload,
    { eventLocationText, eventMeetingPointText, eventLocationUrl },
    { eventStartsAt, eventEndsAt, eventTz },
  );
  const allMeta = [...systemTiles, ...(payload.meta ?? [])];
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

        {allMeta.length > 0 && (
          <dl
            className={[
              "mt-6 flex flex-wrap gap-x-10 gap-y-5 border-t pt-7",
              onDark ? "border-white/20" : "border-border",
            ].join(" ")}
          >
            {allMeta.map((m, i) => (
              <HeroMetaTile key={i} tile={m} onDark={onDark} />
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

interface HeroTile {
  k: string;
  v: string;
  /** Když set, celá dlaždice se stane linkem — pro „Místo" tile
   *  s odkazem na mapu. Externí URL → target="_blank". */
  href?: string;
  /** Volitelný secondary řádek pod hlavní hodnotou — místo srazu
   *  vedle lokace apod. */
  sub?: string;
  /** Volitelná ikona před labelem (typicky pro Místo → mapa). */
  icon?: "map";
}

/** Jedna meta dlaždice v hero gridu. Když `tile.href`, vykreslí se
 *  jako `<a>` a přidá se šipka „→" pro click affordance. */
function HeroMetaTile({
  tile,
  onDark,
}: {
  tile: HeroTile;
  onDark: boolean;
}) {
  const dtClasses = [
    "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
    onDark ? "text-white/65" : "text-ink-500",
  ].join(" ");
  const ddClasses = [
    "mt-1 text-xl font-semibold sm:text-2xl",
    onDark ? "text-ink-inverse" : "text-ink-900",
  ].join(" ");
  const subClasses = [
    "mt-0.5 text-xs",
    onDark ? "text-white/70" : "text-ink-500",
  ].join(" ");

  const body = (
    <>
      <dt className={dtClasses}>
        {tile.icon === "map" && (
          <MapPinIcon
            className={[
              "mr-1 inline-block h-3 w-3 -translate-y-px",
              onDark ? "text-white/80" : "text-brand",
            ].join(" ")}
          />
        )}
        {tile.k}
      </dt>
      <dd className={ddClasses} style={{ letterSpacing: "-0.02em" }}>
        {tile.v}
        {tile.href && (
          <span aria-hidden className="ml-1 text-base">
            →
          </span>
        )}
      </dd>
      {tile.sub && <div className={subClasses}>{tile.sub}</div>}
    </>
  );
  if (tile.href) {
    return (
      <a
        href={tile.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group min-w-[140px] hover:opacity-80 focus-ring rounded"
      >
        {body}
      </a>
    );
  }
  return <div className="min-w-[140px]">{body}</div>;
}

/** Auto-generované meta dlaždice z event fields. Owner v hero-form
 *  zaškrtne, které chce vidět — data se pak čerpají z Nastavení akce,
 *  žádná duplikace v payloadu. */
function buildSystemTiles(
  payload: HeroBlockPayload,
  loc: {
    eventLocationText: string;
    eventMeetingPointText: string;
    eventLocationUrl: string;
  },
  dates: { eventStartsAt: string; eventEndsAt: string; eventTz: string },
): HeroTile[] {
  const tiles: HeroTile[] = [];
  if (payload.show_dates && dates.eventStartsAt) {
    const timeSub = formatCzTimeRange(
      dates.eventStartsAt,
      dates.eventEndsAt,
      dates.eventTz,
    );
    tiles.push({
      k: "Termín",
      v: formatCzDateRange(dates.eventStartsAt, dates.eventEndsAt),
      sub: timeSub || undefined,
    });
  }
  if (
    payload.show_location &&
    (loc.eventLocationText.trim() !== "" ||
      loc.eventMeetingPointText.trim() !== "")
  ) {
    tiles.push({
      k: "Místo",
      v: loc.eventLocationText || loc.eventMeetingPointText,
      sub: loc.eventLocationText && loc.eventMeetingPointText
        ? `Sraz: ${loc.eventMeetingPointText}`
        : undefined,
      href: loc.eventLocationUrl.trim() || undefined,
      icon: "map",
    });
  }
  return tiles;
}

/** Malá map-pin ikona pro „Místo" dlaždici — usnadňuje pochopení,
 *  že tile je linkem na externí mapu. */
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path
        d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
      />
    </svg>
  );
}

