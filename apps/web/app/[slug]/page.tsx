import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFooter } from "@/components/ui/app-footer";
import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { SectionHead } from "@/components/ui/section-head";
import { ShareButton } from "@/components/ui/share-button";
import { WorkspaceSocialsRow } from "@/components/workspace-socials-row";
import {
  assetUrl,
  type EventSummary,
  type Workspace,
  formatEventDateRange,
  formatEventPrice,
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

export default async function WorkspaceProfilePage({ params }: Props) {
  const { slug } = await params;
  const [workspace, events] = await Promise.all([
    fetchWorkspace(slug),
    fetchEvents(slug),
  ]);
  if (!workspace) notFound();

  const logo = assetUrl(workspace.logo_url);
  const cover = assetUrl(workspace.cover_url);

  // Public komunita list — zobrazujeme jen `published` (případně auto-
  // přepnuté na `completed`). Drafty, zrušené a closed schovat. Datum
  // dělení podle `starts_at` (ne `ends_at`) — user request 2026-06-25:
  // "ty co mají starší datum začátku jako dnešek tak už mají být
  // v minulých". Vícedenní akce co teď běží = past, jakmile start prošel.
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const upcoming = events.filter(
    (e) =>
      e.status === "published" &&
      new Date(e.starts_at).getTime() >= todayStart,
  );
  const past = events.filter(
    (e) =>
      (e.status === "published" || e.status === "completed") &&
      new Date(e.starts_at).getTime() < todayStart,
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
              <WorkspaceSocialsRow workspace={workspace} className="mt-8" />
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

        {/* PAST — sekce vždy viditelná, i když je archiv prázdný.
            Předtím se podmiňovala `past.length > 0` a po unshare
            posledního minulého eventu úplně mizela ze stránky.
            User pak nevěděl, kde sekce vlastně je. */}
        <section className="bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:py-16">
            <SectionHead eyebrow="Archiv" title="Minulé akce" />
            {past.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center text-ink-500">
                Žádné minulé akce. Tady se časem objeví archiv.
              </p>
            ) : (
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
            )}
          </div>
        </section>

        <AppFooter />
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
  const price = formatEventPrice(event.price_amount, event.price_currency);

  // Cinematic variant — when a cover exists, the whole card becomes
  // the photo with a gradient + text overlay. Without a cover we fall
  // back to the older surface/text layout.
  if (cover) {
    return (
      <Link
        href={`/${workspaceSlug}/e/${event.slug}`}
        className={[
          "group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl shadow-md transition-all focus-ring",
          muted
            ? "opacity-90 hover:opacity-100"
            : "hover:-translate-y-0.5 hover:shadow-lg",
        ].join(" ")}
      >
        <div
          className="absolute inset-0 -z-10 transition-transform duration-300 group-hover:scale-[1.02]"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.20) 45%, rgba(0,0,0,0.82) 100%), url(${cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="flex flex-col gap-2 p-6 text-ink-inverse">
          <p
            className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-white/85"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
          >
            {dateLabel}
            {event.location_text && <> · {event.location_text}</>}
          </p>
          <h3
            className="text-2xl font-semibold sm:text-3xl"
            style={{
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              textShadow: "0 2px 14px rgba(0,0,0,0.55)",
            }}
          >
            {event.title}
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-white/90">
            {price && (
              <span
                className="font-semibold tabular-nums"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
              >
                {price}
              </span>
            )}
            {!cancelled && (
              <span
                className="text-white/80"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
              >
                <strong className="text-white">{event.confirmed_count}</strong>
                {event.capacity != null ? ` / ${event.capacity}` : ""}{" "}
                přihlášeno
              </span>
            )}
            {cancelled && (
              <span className="rounded bg-danger px-2 py-0.5 text-xs font-semibold text-white">
                ZRUŠENO
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // No-cover fallback — keep the original textual card so the grid
  // doesn't develop ugly blank tiles for events without a hero photo.
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
        {price && (
          <p className="mt-2 text-sm">
            <span className="font-semibold text-ink-900 tabular-nums">
              {price}
            </span>
            {event.price_note && (
              <span className="ml-1 text-ink-500">· {event.price_note}</span>
            )}
          </p>
        )}
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
