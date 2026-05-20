import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { SectionHead } from "@/components/ui/section-head";
import { ShareButton } from "@/components/ui/share-button";
import {
  assetUrl,
  type EventSummary,
  type Workspace,
} from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchWorkspace(slug: string): Promise<Workspace | null> {
  return serverFetch<Workspace>(`/api/workspaces/${slug}/`);
}

async function fetchEvents(slug: string): Promise<EventSummary[]> {
  return (
    (await serverFetch<EventSummary[]>(`/api/workspaces/${slug}/events/`)) ?? []
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await fetchWorkspace(slug);
  if (!workspace) return { title: "Not found — olaf" };

  const cover = assetUrl(workspace.cover_url);
  return {
    title: `${workspace.name} — olaf`,
    description: workspace.bio || `${workspace.name} on olaf.`,
    openGraph: {
      title: workspace.name,
      description: workspace.bio,
      images: cover ? [cover] : undefined,
      type: "website",
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: workspace.name,
      description: workspace.bio,
      images: cover ? [cover] : undefined,
    },
  };
}

function formatEventDateRange(starts: string, ends: string): string {
  const s = new Date(starts);
  const e = new Date(ends);
  const fmt: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  const sameMonth =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  if (sameMonth) {
    const monthYear = s.toLocaleDateString("cs-CZ", {
      month: "long",
      year: "numeric",
    });
    return `${s.getDate()}.–${e.getDate()}. ${monthYear}`;
  }
  return `${s.toLocaleDateString("cs-CZ", fmt)} – ${e.toLocaleDateString(
    "cs-CZ",
    fmt,
  )}`;
}

export default async function WorkspaceProfilePage({ params }: Props) {
  const { slug } = await params;
  const [workspace, events] = await Promise.all([
    fetchWorkspace(slug),
    fetchEvents(slug),
  ]);
  if (!workspace) notFound();

  const logo = assetUrl(workspace.logo_url);
  const cover = assetUrl(workspace.cover_url);
  const socials = Object.entries(workspace.social_links ?? {}).filter(
    ([, url]) => Boolean(url),
  );

  const now = new Date();
  const upcoming = events.filter(
    (e) =>
      e.status === "published" &&
      new Date(e.ends_at).getTime() >= now.getTime(),
  );
  const past = events.filter(
    (e) =>
      e.status === "completed" ||
      e.status === "cancelled" ||
      (e.status === "published" &&
        new Date(e.ends_at).getTime() < now.getTime()),
  );

  return (
    <div className="bg-canvas text-ink-900">
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
              url={`/${workspace.slug}`}
              title={workspace.name}
              text={workspace.bio || workspace.name}
              variant="soft"
            />
            <PublicAuthIndicator />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* HERO */}
        <section
          className={[
            "relative isolate overflow-hidden",
            cover ? "min-h-[400px] sm:min-h-[480px]" : "",
          ].join(" ")}
        >
          {cover && (
            <div
              className="absolute inset-0 -z-10"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.80) 100%), url(${cover})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-20 sm:py-24">
            <span
              className={
                cover
                  ? "inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.12] px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md"
                  : "inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-ink-900"
              }
            >
              <span
                aria-hidden
                className="text-brand"
                style={{ fontSize: "0.85em", lineHeight: 1 }}
              >
                ●
              </span>
              Komunita
            </span>

            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
              <div
                className={[
                  "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 shadow-md sm:h-24 sm:w-24",
                  cover ? "border-white/80 bg-white" : "border-canvas bg-surface",
                ].join(" ")}
                style={
                  workspace.accent_color && !logo
                    ? { backgroundColor: workspace.accent_color }
                    : undefined
                }
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt={`${workspace.name} logo`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-2xl font-semibold text-ink-300">
                    {workspace.name.charAt(0)}
                  </span>
                )}
              </div>
              <h1
                className={[
                  "max-w-3xl text-5xl font-semibold leading-[0.95] sm:text-6xl md:text-7xl",
                  cover ? "text-ink-inverse" : "text-ink-900",
                ].join(" ")}
                style={{
                  letterSpacing: "-0.035em",
                  textShadow: cover ? "0 2px 24px rgba(0,0,0,0.45)" : undefined,
                }}
              >
                {workspace.name}
              </h1>
            </div>

            {workspace.location && (
              <p
                className={[
                  "text-base sm:text-lg",
                  cover ? "text-white/90" : "text-ink-500",
                ].join(" ")}
                style={
                  cover
                    ? { textShadow: "0 1px 12px rgba(0,0,0,0.5)" }
                    : undefined
                }
              >
                {workspace.location}
              </p>
            )}
          </div>
        </section>

        {/* BIO */}
        {workspace.bio && (
          <section className="bg-canvas">
            <div className="mx-auto max-w-5xl px-4 py-14 sm:py-16">
              <SectionHead eyebrow="O nás" title={workspace.name} />
              <p
                className="max-w-2xl text-ink-700"
                style={{ fontSize: 16, lineHeight: 1.6 }}
              >
                {workspace.bio}
              </p>
              {socials.length > 0 && (
                <div className="mt-8 flex flex-wrap gap-3">
                  {socials.map(([key, url]) => (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
                    >
                      <span className="font-mono uppercase tracking-[0.14em] text-[11px] text-ink-500">
                        {key}
                      </span>
                      <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                      <span aria-hidden>↗</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* UPCOMING */}
        <section className="bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:py-16">
            <SectionHead eyebrow="Akce" title="Nadcházející" />
            {upcoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center text-ink-500">
                Žádné nadcházející akce. Sleduj nás a budeme tu, až bude něco
                vypsáno.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {upcoming.map((e) => (
                  <EventCard
                    key={e.slug}
                    event={e}
                    workspaceSlug={workspace.slug}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* PAST */}
        {past.length > 0 && (
          <section className="bg-canvas">
            <div className="mx-auto max-w-5xl px-4 py-14 sm:py-16">
              <SectionHead eyebrow="Archiv" title="Minulé akce" />
              <div className="grid gap-4 sm:grid-cols-2">
                {past.map((e) => (
                  <EventCard
                    key={e.slug}
                    event={e}
                    workspaceSlug={workspace.slug}
                    muted
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="bg-canvas">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-10 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} {workspace.name}
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

function EventCard({
  event,
  workspaceSlug,
  muted = false,
}: {
  event: EventSummary;
  workspaceSlug: string;
  muted?: boolean;
}) {
  const cover = assetUrl(event.cover_url);
  const dateLabel = formatEventDateRange(event.starts_at, event.ends_at);
  const cancelled = event.status === "cancelled";
  return (
    <Link
      href={`/${workspaceSlug}/e/${event.slug}`}
      className={[
        "group relative isolate flex h-full flex-col overflow-hidden rounded-2xl border shadow-sm transition-all focus-ring",
        muted
          ? "border-border bg-surface opacity-90 hover:opacity-100"
          : "border-border bg-surface hover:-translate-y-0.5 hover:shadow-md",
      ].join(" ")}
    >
      {cover && (
        <div
          className="aspect-[16/9] w-full bg-surface-muted"
          style={{
            backgroundImage: `url(${cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div className="flex flex-1 flex-col p-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-500">
          {dateLabel}
          {event.location_text && <> · {event.location_text}</>}
        </p>
        <h3
          className="mt-3 text-xl font-semibold text-ink-900 sm:text-2xl"
          style={{ letterSpacing: "-0.025em", lineHeight: 1.2 }}
        >
          {event.title}
        </h3>
        <div className="mt-auto pt-5 text-sm text-ink-500">
          {cancelled ? (
            <span className="font-medium text-danger">Zrušeno</span>
          ) : (
            <>
              <strong className="text-ink-900">{event.confirmed_count}</strong>
              {event.capacity != null ? ` / ${event.capacity}` : ""} přihlášeno
              {event.waitlist_count > 0 && (
                <span className="ml-2 text-ink-500">
                  +{event.waitlist_count} waitlist
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
