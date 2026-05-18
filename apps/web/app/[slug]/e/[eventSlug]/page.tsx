import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlockRenderer } from "@/components/event-blocks/block-renderer";
import { EventGallery } from "@/components/event-gallery";
import { Logo } from "@/components/ui/logo";
import { OwnerCockpitLink } from "@/components/ui/owner-cockpit-link";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { SectionHead } from "@/components/ui/section-head";
import { assetUrl, type Event } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

async function fetchEvent(
  workspaceSlug: string,
  eventSlug: string,
): Promise<Event | null> {
  return serverFetch<Event>(`/api/events/${workspaceSlug}/${eventSlug}/`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, eventSlug } = await params;
  const event = await fetchEvent(slug, eventSlug);
  if (!event) return { title: "Not found — olaf" };

  const cover =
    assetUrl(event.cover_url) ?? assetUrl(event.workspace_logo_url);
  const description =
    event.description.split("\n")[0]?.slice(0, 180) ||
    `${event.workspace_name} on olaf — ${event.title}.`;

  return {
    title: `${event.title} — ${event.workspace_name}`,
    description,
    openGraph: {
      title: event.title,
      description,
      images: cover ? [cover] : undefined,
      type: "website",
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: event.title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

function formatDateRange(starts: string, ends: string, _tz: string): string {
  const start = new Date(starts);
  const end = new Date(ends);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const fmt: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  if (sameDay) {
    return start.toLocaleDateString("cs-CZ", fmt);
  }
  // Show "16. – 19. dubna 2026" style if same month, else full dates.
  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();
  if (sameMonth) {
    const monthYear = start.toLocaleDateString("cs-CZ", {
      month: "long",
      year: "numeric",
    });
    return `${start.getDate()}. – ${end.getDate()}. ${monthYear}`;
  }
  return `${start.toLocaleDateString("cs-CZ", fmt)} – ${end.toLocaleDateString(
    "cs-CZ",
    fmt,
  )}`;
}

/**
 * Convert a Mapy.cz / Mapy.com share URL into an embeddable URL by ensuring
 * the `frame=1` query parameter is present. Returns null for unsupported hosts.
 */
function getMapyEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== "mapy.cz" && u.hostname !== "mapy.com") return null;
    if (u.searchParams.get("frame") !== "1") {
      u.searchParams.set("frame", "1");
    }
    return u.toString();
  } catch {
    return null;
  }
}

export default async function EventLandingPage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const event = await fetchEvent(slug, eventSlug);
  if (!event) notFound();

  const cover = assetUrl(event.cover_url);
  const dateRange = formatDateRange(event.starts_at, event.ends_at, event.tz);
  const cancelled = event.status === "cancelled";
  const cta_href = `/${event.workspace_slug}/e/${event.slug}/rsvp`;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
            aria-label="olaf"
          >
            <Logo size={26} />
          </Link>
          <div className="flex items-center gap-3">
            <OwnerCockpitLink
              workspaceSlug={event.workspace_slug}
              eventSlug={event.slug}
            />
            <PublicAuthIndicator />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {event.blocks && event.blocks.length > 0 && (() => {
          const heroBadge = cancelled ? (
            <span className="mb-4 inline-flex items-center rounded-md bg-danger px-3 py-1 text-xs font-semibold text-white">
              ZRUŠENO
            </span>
          ) : event.is_open_for_rsvp && event.capacity != null ? (
            (() => {
              const remaining = event.remaining_capacity ?? 0;
              if (remaining === 0) {
                return (
                  <span className="mb-4 inline-flex items-center rounded-md bg-ink-900 px-3 py-1 text-xs font-semibold text-ink-inverse">
                    VYPRODÁNO{event.waitlist_enabled ? " · waitlist otevřený" : ""}
                  </span>
                );
              }
              if (remaining <= 3) {
                return (
                  <span className="mb-4 inline-flex items-center rounded-md bg-brand px-3 py-1 text-xs font-semibold text-brand-ink">
                    POSLEDNÍ {remaining} MÍST{remaining === 1 ? "O" : "A"}
                  </span>
                );
              }
              return null;
            })()
          ) : null;
          const heroIndex = event.blocks.findIndex((b) => b.type === "hero");
          return (
            <>
              {event.blocks.map((b, i) => (
                <BlockRenderer
                  key={b.id}
                  block={b}
                  fallbackTitle={`${event.workspace_name} — ${event.title}`}
                  fallbackCtaHref={cta_href}
                  heroBadge={i === heroIndex ? heroBadge : undefined}
                  images={event.images}
                />
              ))}
            </>
          );
        })()}

        {event.blocks && event.blocks.length > 0 ? null : (
        <>
        {/* Hero */}
        <section
          className={[
            "relative overflow-hidden",
            cover ? "min-h-[520px]" : "border-b border-border",
          ].join(" ")}
        >
          {cover && (
            <>
              <div
                className="absolute inset-0 -z-10"
                style={{
                  backgroundImage: `url(${cover})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div
                className="absolute inset-0 -z-10"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.75) 100%)",
                }}
              />
            </>
          )}
          <div
            className={[
              "mx-auto flex max-w-5xl flex-col items-start gap-6 px-4",
              cover ? "py-24 sm:py-32" : "py-20 sm:py-24",
            ].join(" ")}
          >
            {cancelled && (
              <span className="inline-flex items-center rounded-md bg-danger px-3 py-1 text-xs font-semibold text-white">
                ZRUŠENO
              </span>
            )}
            {!cancelled && event.is_open_for_rsvp && event.capacity != null && (
              (() => {
                const remaining = event.remaining_capacity ?? 0;
                if (remaining === 0) {
                  return (
                    <span className="inline-flex items-center rounded-md bg-ink-900 px-3 py-1 text-xs font-semibold text-ink-inverse">
                      Vyprodáno{event.waitlist_enabled ? " · waitlist otevřený" : ""}
                    </span>
                  );
                }
                if (remaining <= 3) {
                  return (
                    <span className="inline-flex items-center rounded-md bg-brand px-3 py-1 text-xs font-semibold text-brand-ink">
                      Poslední {remaining} míst{remaining === 1 ? "o" : "a"}
                    </span>
                  );
                }
                return null;
              })()
            )}

            <h1
              className={[
                "max-w-3xl text-5xl font-semibold leading-[0.95] sm:text-6xl md:text-7xl",
                cover ? "text-ink-inverse" : "text-ink-900",
              ].join(" ")}
              style={{ letterSpacing: "-0.035em" }}
            >
              {event.title}
            </h1>

            {event.description && (
              <p
                className={[
                  "max-w-2xl text-lg sm:text-xl",
                  cover ? "text-white/90" : "text-ink-700",
                ].join(" ")}
                style={{
                  letterSpacing: "-0.01em",
                  lineHeight: 1.4,
                  fontWeight: 500,
                }}
              >
                {event.description.split("\n")[0]}
              </p>
            )}

            <div className="mt-2">
              {event.is_open_for_rsvp ? (
                <Link
                  href={cta_href}
                  className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
                >
                  Přihlásit na akci
                </Link>
              ) : (
                <span
                  className={[
                    "inline-flex h-12 items-center justify-center rounded-md px-6 text-base font-semibold",
                    cover
                      ? "bg-white/15 text-ink-inverse"
                      : "bg-surface-strong text-ink-500",
                  ].join(" ")}
                >
                  {cancelled
                    ? "Akce zrušena"
                    : event.status === "closed"
                      ? "Registrace uzavřena"
                      : "Registrace zatím nejsou otevřené"}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* DETAILY — meta row in brand style */}
        <section className="border-t border-border bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:py-14">
            <dl className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              <MetaPair k="Termín" v={dateRange} />
              <MetaPair
                k="Místo"
                v={event.location_text || "—"}
                href={event.location_url || undefined}
              />
              {event.capacity != null && (
                <MetaPair
                  k="Kapacita"
                  v={`${event.capacity} míst${
                    event.confirmed_count > 0
                      ? ` · ${event.confirmed_count} přihlášeno`
                      : ""
                  }`}
                />
              )}
              {event.price_text && (
                <MetaPair k="Cena" v={event.price_text} />
              )}
            </dl>
          </div>
        </section>

        {/* MAPA — iframe embed when location_url is a Mapy.cz / Mapy.com share */}
        {(() => {
          const embed = getMapyEmbed(event.location_url);
          if (!embed) return null;
          return (
            <section className="border-t border-border bg-canvas">
              <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
                <SectionHead eyebrow="Mapa" title="Kde se sejdeme" />
                <div
                  className="relative w-full overflow-hidden rounded-md border border-border bg-surface"
                  style={{ aspectRatio: "16 / 9" }}
                >
                  <iframe
                    loading="lazy"
                    src={embed}
                    title="Mapa"
                    className="absolute inset-0 h-full w-full border-0"
                  />
                </div>
                {event.location_url && (
                  <a
                    href={event.location_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-700 hover:text-ink-900"
                  >
                    Otevřít v Mapy.cz →
                  </a>
                )}
              </div>
            </section>
          );
        })()}

        {/* O AKCI + foto */}
        {event.description && (
          <section className="border-t border-border bg-surface-strong">
            <div className="mx-auto grid max-w-5xl gap-12 px-4 py-16 sm:py-20 md:grid-cols-2 md:items-start">
              <div>
                <SectionHead eyebrow="O akci" title="Proč jet" />
                <div
                  className="space-y-4 text-ink-700"
                  style={{ fontSize: 16, lineHeight: 1.6 }}
                >
                  {event.description.split("\n\n").map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt={event.title}
                  className="aspect-square w-full rounded-md object-cover"
                />
              )}
            </div>
          </section>
        )}

        {/* PROGRAM — dark accent section */}
        {event.program.length > 0 && (
          <section className="border-t border-border bg-ink-900 text-ink-inverse">
            <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
              <SectionHead eyebrow="Program" title="Den po dni" tone="dark" />
              <ol className="space-y-8">
                {event.program.map((d, i) => (
                  <li key={i} className="flex gap-5">
                    <span
                      className="shrink-0 font-mono text-4xl font-semibold leading-none text-white/30 sm:text-5xl"
                      style={{ letterSpacing: "-0.03em" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1">
                      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">
                        {d.day}
                      </p>
                      <h3
                        className="mt-1 text-xl font-semibold text-ink-inverse sm:text-2xl"
                        style={{ letterSpacing: "-0.02em" }}
                      >
                        {d.title}
                      </h3>
                      <p
                        className="mt-3 whitespace-pre-line text-white/80"
                        style={{ fontSize: 16, lineHeight: 1.6 }}
                      >
                        {d.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* CO JE V CENĚ + CO NENÍ V CENĚ */}
        {(event.included.length > 0 || event.not_included.length > 0) && (
          <section className="border-t border-border bg-canvas">
            <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
              <SectionHead eyebrow="Cena" title="Co dostaneš a za co platíš" />
              <div className="grid gap-12 md:grid-cols-2">
                {event.included.length > 0 && (
                  <div>
                    <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-900">
                      V ceně
                    </p>
                    <ul className="space-y-3 border-l-2 border-brand pl-6">
                      {event.included.map((item, i) => (
                        <li
                          key={i}
                          className="text-ink-900"
                          style={{ fontSize: 16, lineHeight: 1.55 }}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {event.not_included.length > 0 && (
                  <div>
                    <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
                      Hradíš sám
                    </p>
                    <ul className="space-y-3 border-l-2 border-border-strong pl-6">
                      {event.not_included.map((item, i) => (
                        <li
                          key={i}
                          className="text-ink-700"
                          style={{ fontSize: 16, lineHeight: 1.55 }}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                    {event.additional_cost_note && (
                      <p className="mt-5 border-l-2 border-border pl-6 text-sm text-ink-500">
                        Odhad navíc · {event.additional_cost_note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* NÁROČNOST */}
        {(event.difficulty_level > 0 || event.difficulty_note) && (
          <section className="border-t border-border bg-surface-strong">
            <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
              <SectionHead eyebrow="Náročnost" title={`${event.difficulty_level || "—"} z 5`} />
              {event.difficulty_level > 0 && (
                <div className="mb-6 flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={[
                        "h-2 w-12 rounded-full",
                        n <= event.difficulty_level
                          ? "bg-brand"
                          : "bg-border",
                      ].join(" ")}
                    />
                  ))}
                </div>
              )}
              {event.difficulty_note && (
                <p
                  className="max-w-2xl text-ink-700"
                  style={{ fontSize: 16, lineHeight: 1.6 }}
                >
                  {event.difficulty_note}
                </p>
              )}
            </div>
          </section>
        )}

        {/* DOPRAVA / UBYTOVÁNÍ / VÝBAVA */}
        {(event.transport_info ||
          event.accommodation_info ||
          event.gear_info) && (
          <section className="border-t border-border bg-canvas">
            <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
              <SectionHead eyebrow="Praktické info" title="Doprava, spaní, výbava" />
              <div className="grid gap-10 sm:grid-cols-3">
                {event.transport_info && (
                  <PracticalCol title="Doprava" body={event.transport_info} />
                )}
                {event.accommodation_info && (
                  <PracticalCol
                    title="Ubytování a strava"
                    body={event.accommodation_info}
                  />
                )}
                {event.gear_info && (
                  <PracticalCol title="Výbava" body={event.gear_info} />
                )}
              </div>
            </div>
          </section>
        )}

        {/* HIGHLIGHTS — Na co se zaměříme */}
        {event.highlights.length > 0 && (
          <section className="border-t border-border bg-surface-strong">
            <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
              <SectionHead eyebrow="Highlights" title="Na co se zaměříme" />
              <ul className="grid gap-3 sm:grid-cols-2">
                {event.highlights.map((h, i) => (
                  <li
                    key={i}
                    className="border-l-2 border-brand pl-5 text-ink-900"
                    style={{ fontSize: 16, lineHeight: 1.55 }}
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* FAQ */}
        {event.faq.length > 0 && (
          <section className="border-t border-border bg-canvas">
            <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
              <SectionHead eyebrow="FAQ" title="Časté dotazy" />
              <dl className="divide-y divide-border border-y border-border">
                {event.faq.map((f, i) => (
                  <div key={i} className="py-6">
                    <dt
                      className="text-lg font-semibold text-ink-900"
                      style={{ letterSpacing: "-0.015em" }}
                    >
                      {f.question}
                    </dt>
                    <dd
                      className="mt-3 whitespace-pre-line text-ink-700"
                      style={{ fontSize: 16, lineHeight: 1.6 }}
                    >
                      {f.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-border bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
            <SectionHead
              eyebrow="Přihlášení"
              title={event.is_open_for_rsvp ? "Pojedeš s námi?" : "Přihlášení zavřená"}
              lead={
                event.is_open_for_rsvp
                  ? event.capacity != null
                    ? `Kapacita je ${event.capacity} a místa zaplníme. Pošli RSVP a zajisti si své místo.`
                    : "Registrace jsou otevřené. Připoj se k nám."
                  : cancelled
                    ? `Akce byla zrušena${
                        event.cancellation_reason
                          ? `: ${event.cancellation_reason}`
                          : "."
                      }`
                    : "Registrace na tuto akci nejsou momentálně otevřené."
              }
            />
            {event.is_open_for_rsvp && (
              <Link
                href={cta_href}
                className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
              >
                Přihlásit na akci
              </Link>
            )}
          </div>
        </section>
        </>
        )}

        {event.images.length > 0 &&
          !event.blocks.some((b) => b.type === "gallery") && (
            <EventGallery images={event.images} />
          )}

        <footer className="border-t border-border bg-canvas">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-10 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} {event.workspace_name} ·{" "}
              <Link
                href={`/${event.workspace_slug}`}
                className="underline hover:text-ink-900"
              >
                Profil
              </Link>
            </span>
            <span>
              <Link href="/" className="hover:text-ink-900">
                olaf
              </Link>{" "}
              · EU-hosted · GDPR-clean
            </span>
          </div>
        </footer>
      </main>
    </>
  );
}

function MetaPair({
  k,
  v,
  href,
}: {
  k: string;
  v: string;
  href?: string;
}) {
  const valueNode = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink-900 underline hover:no-underline"
    >
      {v}
    </a>
  ) : (
    v
  );
  return (
    <div>
      <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
        {k}
      </dt>
      <dd
        className="mt-2 text-lg font-semibold text-ink-900"
        style={{ letterSpacing: "-0.015em" }}
      >
        {valueNode}
      </dd>
    </div>
  );
}

function PracticalCol({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
        {title}
      </p>
      <p
        className="mt-3 whitespace-pre-line text-ink-700"
        style={{ fontSize: 16, lineHeight: 1.6 }}
      >
        {body}
      </p>
    </div>
  );
}
