import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/ui/logo";
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

export default async function EventLandingPage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const event = await fetchEvent(slug, eventSlug);
  if (!event) notFound();

  const cover = assetUrl(event.cover_url);
  const logo = assetUrl(event.workspace_logo_url);
  const dateRange = formatDateRange(event.starts_at, event.ends_at, event.tz);
  const cancelled = event.status === "cancelled";
  const cta_href = `/${event.workspace_slug}/e/${event.slug}/rsvp`;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href={`/${event.workspace_slug}`}
            className="flex items-center gap-2 text-ink-900 transition-opacity hover:opacity-80"
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={`${event.workspace_name} logo`}
                className="h-7 w-7 rounded object-contain"
              />
            ) : (
              <Logo size={24} wordmark={false} />
            )}
            <span className="text-sm font-medium">{event.workspace_name}</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-ink-500 transition-colors hover:text-ink-900"
          >
            <Logo size={20} />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
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
            {cancelled && (
              <span className="mb-4 inline-flex items-center rounded-md bg-danger px-3 py-1 text-xs font-semibold text-white">
                ZRUŠENO
              </span>
            )}
            <h1 className="max-w-3xl bg-ink-900 px-3 py-2 text-3xl font-semibold leading-tight tracking-tight text-ink-inverse sm:text-5xl">
              {event.workspace_name.toUpperCase()} — {event.title.toUpperCase()}
            </h1>
            {event.description && (
              <p className="mt-5 max-w-2xl bg-ink-900 px-3 py-2 text-sm leading-relaxed text-ink-inverse sm:text-base">
                {event.description.split("\n")[0]}
              </p>
            )}
            <div className="mt-8">
              {event.is_open_for_rsvp ? (
                <Link
                  href={cta_href}
                  className="inline-flex h-12 items-center justify-center rounded-md bg-ink-900 px-6 text-base font-semibold text-ink-inverse transition-colors hover:bg-ink-700 focus-ring"
                >
                  Přihlásit na akci
                </Link>
              ) : (
                <span className="inline-flex h-12 items-center justify-center rounded-md bg-ink-900/60 px-6 text-base font-semibold text-ink-inverse">
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

        {/* DETAILY */}
        <section className="border-t border-border bg-surface-muted/40">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="mb-6 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
              DETAILY AKCE
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailCard label="TERMÍN" value={dateRange} />
              <DetailCard
                label="MÍSTO"
                value={event.location_text || "—"}
                link={event.location_url || undefined}
              />
              {event.capacity != null && (
                <DetailCard
                  label="KAPACITA"
                  value={`${event.capacity} míst${
                    event.confirmed_count > 0
                      ? ` · ${event.confirmed_count} přihlášeno`
                      : ""
                  }`}
                />
              )}
              {event.price_text && (
                <DetailCard label="CENA" value={event.price_text} />
              )}
            </div>
          </div>
        </section>

        {/* O AKCI + foto */}
        {event.description && (
          <section className="border-t border-border">
            <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-2">
              <div>
                <h2 className="mb-4 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
                  O AKCI
                </h2>
                <div className="space-y-4 text-ink-900">
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
                  className="aspect-square w-full rounded-lg object-cover"
                />
              )}
            </div>
          </section>
        )}

        {/* PROGRAM */}
        {event.program.length > 0 && (
          <section className="border-t border-border bg-surface-muted/40">
            <div className="mx-auto max-w-5xl px-4 py-16">
              <h2 className="mb-10 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
                PROGRAM
              </h2>
              <ol className="space-y-8">
                {event.program.map((d, i) => (
                  <li key={i} className="flex gap-4 sm:gap-6">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-brand-ink sm:h-12 sm:w-12 sm:text-lg">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold uppercase tracking-wide text-ink-900 sm:text-lg">
                        {d.day} — {d.title}
                      </h3>
                      <p className="mt-2 text-ink-700">{d.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* CO JE V CENĚ */}
        {event.included.length > 0 && (
          <section className="border-t border-border">
            <div className="mx-auto max-w-5xl px-4 py-16">
              <h2 className="mb-6 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
                CO JE V CENĚ
              </h2>
              <ul className="space-y-4 border-l-2 border-brand pl-6">
                {event.included.map((item, i) => (
                  <li key={i} className="text-ink-900">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* HIGHLIGHTS — Na co se zaměříme */}
        {event.highlights.length > 0 && (
          <section className="border-t border-border bg-surface-muted/40">
            <div className="mx-auto max-w-5xl px-4 py-16">
              <h2 className="mb-6 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
                NA CO SE ZAMĚŘÍME
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {event.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border bg-surface p-4 text-ink-900"
                  >
                    {h}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="mb-4 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
              PŘIHLAS SE
            </h2>
            <p className="max-w-2xl text-ink-700">
              {event.is_open_for_rsvp
                ? event.capacity != null
                  ? `Místa jsou omezená — kapacita je ${event.capacity}. Přihlas se co nejdřív a zajisti si své místo.`
                  : "Registrace jsou otevřené. Připoj se k nám."
                : cancelled
                  ? `Akce byla zrušena${
                      event.cancellation_reason
                        ? `: ${event.cancellation_reason}`
                        : "."
                    }`
                  : "Registrace na tuto akci nejsou momentálně otevřené."}
            </p>
            {event.is_open_for_rsvp && (
              <div className="mt-8">
                <Link
                  href={cta_href}
                  className="inline-flex h-12 items-center justify-center rounded-md bg-ink-900 px-6 text-base font-semibold text-ink-inverse transition-colors hover:bg-ink-700 focus-ring"
                >
                  Přihlásit na akci
                </Link>
              </div>
            )}
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} {event.workspace_name} ·{" "}
              <Link
                href={`/${event.workspace_slug}`}
                className="underline hover:text-ink-900"
              >
                profil
              </Link>
            </span>
            <span className="text-ink-300">
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

function DetailCard({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: string;
}) {
  const valueNode = link ? (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink-900 underline hover:no-underline"
    >
      {value}
    </a>
  ) : (
    value
  );
  return (
    <div className="rounded-md bg-brand p-5 text-brand-ink">
      <span className="inline-block bg-ink-900 px-2 py-1 text-xs font-semibold tracking-wide text-ink-inverse">
        {label}
      </span>
      <p className="mt-3 text-lg font-semibold">{valueNode}</p>
    </div>
  );
}
