import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlockRenderer } from "@/components/event-blocks/block-renderer";
import { AppFooter } from "@/components/ui/app-footer";
import { Logo } from "@/components/ui/logo";
import { OwnerCockpitLink } from "@/components/ui/owner-cockpit-link";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { ShareButton } from "@/components/ui/share-button";
import {
  assetUrl,
  type Event,
  type EventDraftPreview,
  formatEventDateRange,
  formatSpotsRemaining,
} from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

type FetchResult = Event | EventDraftPreview;

async function fetchEvent(
  workspaceSlug: string,
  eventSlug: string,
): Promise<FetchResult | null> {
  return serverFetch<FetchResult>(
    `/api/events/${workspaceSlug}/${eventSlug}/`,
  );
}

function isDraftPreview(p: FetchResult): p is EventDraftPreview {
  return (p as EventDraftPreview).is_draft_preview === true;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, eventSlug } = await params;
  const event = await fetchEvent(slug, eventSlug);
  if (!event) return { title: "Not found — olaf" };
  if (isDraftPreview(event)) {
    return {
      title: `${event.title} — chystá se`,
      // Tell search engines + link previews to skip — draft pages
      // shouldn't be indexed.
      robots: { index: false, follow: false },
    };
  }

  // Description fallback: dřív padal rovnou na `event.title`, což u
  // event-ů bez description vedlo k OG card-u s titulem dvakrát (jednou
  // og:title, jednou og:description). User report 2026-06-25. Místo
  // duplikace skládáme „termín · místo" — víc kontextu pro share.
  const firstDescLine = event.description.split("\n")[0]?.slice(0, 180);
  const dateLabel = formatEventDateRange(event.starts_at, event.ends_at);
  const fallbackDescParts: string[] = [];
  if (dateLabel) fallbackDescParts.push(dateLabel);
  if (event.location_text) fallbackDescParts.push(event.location_text);
  const description =
    firstDescLine ||
    (fallbackDescParts.length > 0
      ? fallbackDescParts.join(" · ")
      : event.workspace_name);

  // Event titul stojí na vlastních nohou — předtím tu byl
  // "${event.title} — ${event.workspace_name}", což user explicitně
  // odmítl (každá akce má být svá, workspace je jen container, ne
  // prefix v browser tabu nebo OG titulu).
  //
  // og:image se generuje dynamicky přes colocated `opengraph-image.tsx`
  // (Next file convention). Vlastní branded card s title + termín +
  // komunita overlaid na cover fotce — konzistentní i pro eventy bez
  // uploadu (kde předtím WhatsApp share vypadal jako naked URL).
  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
    },
  };
}

export default async function EventLandingPage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const event = await fetchEvent(slug, eventSlug);
  if (!event) notFound();
  if (isDraftPreview(event)) {
    return <DraftPreviewPage preview={event} />;
  }

  const cancelled = event.status === "cancelled";
  const cta_href = `/${event.workspace_slug}/e/${event.slug}/rsvp`;

  return (
    <div data-theme="paper" className="bg-canvas text-ink-900">
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
            <ShareButton
              url={`/${event.workspace_slug}/e/${event.slug}`}
              title={event.title}
              text={event.title}
              variant="soft"
            />
            <OwnerCockpitLink
              workspaceSlug={event.workspace_slug}
              eventSlug={event.slug}
            />
            <PublicAuthIndicator />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-x-clip">
        {!event.blocks || event.blocks.length === 0 ? (
          // Minimal hero when the owner hasn't built an obsah yet. Used
          // to fall off into an empty page where any other auto-section
          // (recommended gear list, etc) looked like the whole event —
          // confusing. Default: title, date, location, RSVP CTA.
          <FallbackHero event={event} ctaHref={cta_href} />
        ) : null}
        {event.blocks && event.blocks.length > 0 && (() => {
          const heroBadge = cancelled ? (
            <span className="inline-flex items-center rounded-md bg-danger px-3 py-1 text-xs font-semibold text-white">
              ZRUŠENO
            </span>
          ) : event.is_open_for_rsvp ? (
            (() => {
              // Přítelkyně-tester 2026-09-04: chce v hero prominentně
              // vidět kolik lidí je aktuálně přihlášeno (social proof
              // + urgency zároveň). Předtím badge ukazoval jen „N
              // volných míst", takže owner ani sdílející kamarád
              // nevěděl kolik už jich tam je. Nová logika vždy vede
              // s confirmed count, urgency stavy (POSLEDNÍ / VYPRODÁNO)
              // to jen doplňují.
              const confirmed = event.confirmed_count ?? 0;
              const capacity = event.capacity;
              const remaining = event.remaining_capacity ?? 0;
              if (capacity != null && remaining === 0) {
                return (
                  <span className="inline-flex items-center rounded-md bg-ink-900 px-3 py-1 text-xs font-semibold text-ink-inverse">
                    VYPRODÁNO{event.waitlist_enabled ? " · waitlist otevřený" : ""}
                  </span>
                );
              }
              if (capacity != null && remaining <= 3) {
                return (
                  <span className="inline-flex items-center rounded-md bg-brand px-3 py-1 text-xs font-semibold text-brand-ink">
                    {confirmed}/{capacity} přihlášeno · POSLEDNÍ {remaining} MÍST{remaining === 1 ? "O" : "A"}
                  </span>
                );
              }
              if (capacity != null) {
                return (
                  <span className="inline-flex items-center rounded-md bg-surface-muted px-3 py-1 text-xs font-semibold text-ink-700">
                    {confirmed} z {capacity} přihlášeno
                  </span>
                );
              }
              if (confirmed > 0) {
                return (
                  <span className="inline-flex items-center rounded-md bg-surface-muted px-3 py-1 text-xs font-semibold text-ink-700">
                    {confirmed} přihlášeno
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
                  // Fallback pro hero H1 když si owner nepřepsal
                  // `title_override`. Předtím se sem zřetězilo
                  // "${workspace} — ${title}" a workspace dominoval
                  // hero každé akce. Teď stojí na sobě jen event title.
                  fallbackTitle={event.title}
                  fallbackCtaHref={cta_href}
                  heroBadge={i === heroIndex ? heroBadge : undefined}
                  images={event.images}
                  eventPrice={{
                    amount: event.price_amount,
                    currency: event.price_currency,
                    note: event.price_note,
                  }}
                  gearListsBySlug={event.gear_lists_by_slug}
                  organizersByUserId={event.organizers_by_user_id}
                />
              ))}
            </>
          );
        })()}

        {/* Recommended gear list is intentionally NOT auto-rendered
            on public anymore — that turned events with no obsah into
            a page that looked like nothing-but-a-gear-list. The
            checklist still appears for registered participants in
            their event zone (/events/<ws>/<event> Vybavení tab), and
            owners who want gear visible publicly can drop the
            existing "Vybavení" block into the block builder. */}


        {/* Public landing is presentation-only. Participant zone (payment
            + docs + invoice) lives at /events/[ws]/[event] and on the
            dashboard's "Čeká na tebe" feed — landing stays clean.
            Gallery used to auto-render here when images existed, with a
            hardcoded "Z minulých kempů" headline; that surprised owners
            (random title showing up on their non-camp event) and broke
            the layout near the footer. Galleries are now opt-in: the
            owner adds a Gallery block via the page builder when they
            want one, with their own eyebrow + title. */}

        <AppFooter />
      </main>
    </div>
  );
}

function DraftPreviewPage({ preview }: { preview: EventDraftPreview }) {
  const logo = assetUrl(preview.workspace_logo_url);
  return (
    <div data-theme="paper" className="flex min-h-screen flex-col bg-canvas text-ink-900">
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
            aria-label="olaf"
          >
            <Logo size={26} />
          </Link>
          <PublicAuthIndicator />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={preview.workspace_name}
              className="mx-auto mb-6 h-16 w-16 rounded-lg border border-border bg-surface object-contain"
            />
          ) : null}
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Akce se chystá
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {preview.title}
          </h1>
          <p className="mt-4 text-ink-700">
            Pořadatel akci ještě připravuje, takže veřejná stránka zatím
            není dostupná. Mrkni za chvíli — jakmile to spustí, najdeš tu
            program, cenu i registraci.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/${preview.workspace_slug}`}
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
            >
              Profil pořadatele
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-hover focus-ring"
            >
              Vytvořit účet
            </Link>
          </div>

          <p className="mt-6 text-xs text-ink-500">
            Už účet máš?{" "}
            <Link href="/login" className="font-medium text-ink-700 underline hover:text-ink-900">
              Přihlásit se
            </Link>
            .
          </p>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}


/** Minimal fallback hero used when an event has no blocks built yet.
 *  Replaces the "empty page where the only thing visible was the gear
 *  auto-section" feel — owner gets a working public link the moment
 *  they create the event, with title, date, location and an RSVP CTA. */
function FallbackHero({
  event,
  ctaHref,
}: {
  event: Event;
  ctaHref: string;
}) {
  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  const sameDay = starts.toDateString() === ends.toDateString();
  const dateLabel = sameDay
    ? starts.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : `${starts.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })} – ${ends.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" })}`;
  const cancelled = event.status === "cancelled";

  return (
    <section className="bg-canvas">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <h1 className="text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          {event.title}
        </h1>
        <p className="mt-3 text-base text-ink-500">
          {dateLabel}
          {event.location_text && ` · ${event.location_text}`}
        </p>
        {event.capacity != null && event.is_open_for_rsvp && (
          <p className="mt-2 text-sm text-ink-500">
            Přihlášeno {event.confirmed_count} z {event.capacity}
            {event.remaining_capacity != null &&
              event.remaining_capacity > 0 &&
              ` · ${formatSpotsRemaining(event.remaining_capacity)}`}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {cancelled ? (
            <span className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white">
              Zrušeno
            </span>
          ) : event.is_open_for_rsvp ? (
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink hover:opacity-90 focus-ring"
            >
              Přihlásit se
            </Link>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-ink-500">
                Registrace zatím není otevřená.
              </span>
              <Link
                href={`/${event.workspace_slug}`}
                className="inline-flex items-center text-sm font-medium text-ink-700 underline hover:text-ink-900"
              >
                Kontakt na pořadatele najdeš na stránce komunity →
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
