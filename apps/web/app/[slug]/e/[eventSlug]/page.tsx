import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlockRenderer } from "@/components/event-blocks/block-renderer";
import { EventGallery } from "@/components/event-gallery";
import { PaymentInstructionsPanel } from "@/components/payment-instructions-panel";
import { RequiredDocsPanel } from "@/components/required-docs-panel";
import { Logo } from "@/components/ui/logo";
import { OwnerCockpitLink } from "@/components/ui/owner-cockpit-link";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
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

export default async function EventLandingPage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const event = await fetchEvent(slug, eventSlug);
  if (!event) notFound();

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


        {/* Price is rendered inside the included_split block now; the
            standalone strip we added in Slice 2 turned into a duplicate
            once the block pulls from event.price_*. Kept the
            formatEventPrice helper import for reuse. */}

        {/* Logged-in participant: payment block + required-docs block.
            Both auto-hide when not applicable (free event, anon viewer,
            no required docs, no RSVP). */}
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          <PaymentInstructionsPanel
            workspaceSlug={event.workspace_slug}
            eventSlug={event.slug}
          />
          <RequiredDocsPanel
            workspaceSlug={event.workspace_slug}
            eventSlug={event.slug}
          />
        </section>

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
    </div>
  );
}

