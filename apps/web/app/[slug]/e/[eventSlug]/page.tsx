import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlockRenderer } from "@/components/event-blocks/block-renderer";
import { Logo } from "@/components/ui/logo";
import { OwnerCockpitLink } from "@/components/ui/owner-cockpit-link";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { assetUrl, type Event, type EventDraftPreview } from "@/lib/api";
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
      title: `${event.title} — chystá se · ${event.workspace_name}`,
      // Tell search engines + link previews to skip — draft pages
      // shouldn't be indexed.
      robots: { index: false, follow: false },
    };
  }

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
            <OwnerCockpitLink
              workspaceSlug={event.workspace_slug}
              eventSlug={event.slug}
            />
            <PublicAuthIndicator />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-x-clip">
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
                  eventPrice={{
                    amount: event.price_amount,
                    currency: event.price_currency,
                    note: event.price_note,
                  }}
                />
              ))}
            </>
          );
        })()}


        {/* Public landing is presentation-only. Participant zone (payment
            + docs + invoice) lives at /events/[ws]/[event] and on the
            dashboard's "Čeká na tebe" feed — landing stays clean.
            Gallery used to auto-render here when images existed, with a
            hardcoded "Z minulých kempů" headline; that surprised owners
            (random title showing up on their non-camp event) and broke
            the layout near the footer. Galleries are now opt-in: the
            owner adds a Gallery block via the page builder when they
            want one, with their own eyebrow + title. */}

        <footer className="border-t border-border bg-canvas">
          <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-8 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
            <span>
              © {new Date().getFullYear()}{" "}
              <Link href="/" className="hover:text-ink-900">
                olaf
              </Link>
            </span>
          </div>
        </footer>
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

      <footer className="border-t border-border bg-canvas">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-8 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
          <span>
            © {new Date().getFullYear()}{" "}
            <Link href="/" className="hover:text-ink-900">
              olaf
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

