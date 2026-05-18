"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { WorkspaceMetaLine } from "@/components/ui/workspace-meta-line";
import {
  ApiError,
  type Community,
  type EventSummary,
  type Workspace,
  assetUrl,
  communities as communitiesApi,
  events as eventsApi,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS_LABELS: Record<EventSummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export default function WorkspaceDetailPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [eventList, setEventList] = useState<EventSummary[] | null>(null);
  const [communityList, setCommunityList] = useState<Community[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev, comms] = await Promise.all([
          workspaces.detail(slug),
          workspaces.eventsFor(slug),
          communitiesApi.forWorkspace(slug).catch(() => [] as Community[]),
        ]);
        if (cancelled) return;
        setWorkspace(ws);
        setEventList(ev);
        setCommunityList(comms);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/workspaces");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Nepovedlo se načíst komunitu.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-5xl px-4 py-10">
          <Alert variant="danger">{error}</Alert>
        </section>
      </main>
    );
  }

  if (!workspace) return null;

  const logo = assetUrl(workspace.logo_url);
  const isOwner = workspace.my_role === "owner";
  const upcoming = (eventList ?? []).filter(
    (e) =>
      e.status === "published" ||
      e.status === "draft" ||
      e.status === "closed",
  );
  const past = (eventList ?? []).filter(
    (e) => e.status === "completed" || e.status === "cancelled",
  );
  const socials = Object.entries(workspace.social_links ?? {}).filter(
    ([, url]) => Boolean(url),
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <Breadcrumbs
          items={[
            { label: "Workspaces", href: "/workspaces" },
            { label: workspace.name },
          ]}
        />

        <header className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface"
            style={
              workspace.accent_color
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
              <span className="text-2xl font-semibold text-ink-inverse">
                {workspace.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
                {workspace.name}
              </h1>
              {isOwner && (
                <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-brand-ink">
                  Owner
                </span>
              )}
            </div>
            <WorkspaceMetaLine
              location={workspace.location}
              memberCount={workspace.member_count}
              socials={socials}
              className="mt-1"
            />
          </div>
          <LinkButton
            href={`/${workspace.slug}`}
            variant="secondary"
            size="md"
          >
            Veřejný profil
          </LinkButton>
        </header>

        {workspace.bio && (
          <p className="mt-6 max-w-2xl text-ink-700">{workspace.bio}</p>
        )}

        <section className="mt-12">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-ink-900">
              Nadcházející akce
            </h2>
          </div>
          {upcoming.length === 0 ? (
            <Card>
              <CardSection>
                <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
                  <h3 className="text-base font-semibold text-ink-900">
                    Žádné nadcházející akce
                  </h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                    {isOwner
                      ? "Vytvoř první akci a uvidíš ji tady."
                      : "Tato komunita zatím neplánuje žádnou veřejnou akci."}
                  </p>
                  {isOwner && (
                    <LinkButton
                      href="/events/new"
                      variant="primary"
                      size="md"
                      className="mt-5"
                    >
                      Vytvořit event
                    </LinkButton>
                  )}
                </div>
              </CardSection>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {upcoming.map((e) => (
                <EventCard
                  key={e.slug}
                  event={e}
                  workspaceSlug={workspace.slug}
                  showStatus={isOwner}
                />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-5 text-xl font-semibold text-ink-900">
              Minulé akce
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {past.map((e) => (
                <EventCard
                  key={e.slug}
                  event={e}
                  workspaceSlug={workspace.slug}
                  showStatus={isOwner}
                />
              ))}
            </div>
          </section>
        )}

        {isOwner && (
          <section className="mt-12">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold text-ink-900">Komunity</h2>
              <LinkButton
                href={`/workspaces/${workspace.slug}/communities/new`}
                variant="ghost"
                size="md"
              >
                + Nová komunita
              </LinkButton>
            </div>
            {communityList === null ? (
              <p className="text-sm text-ink-500">Načítám…</p>
            ) : communityList.length === 0 ? (
              <Card>
                <CardSection>
                  <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
                    <h3 className="text-base font-semibold text-ink-900">
                      Žádné komunity
                    </h3>
                    <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                      Komunita = roster lidí pod tvým workspacem, do kterého
                      sdílíš akce. Vytvoř první.
                    </p>
                  </div>
                </CardSection>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {communityList.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/workspaces/${workspace.slug}/communities/${c.slug}`}
                    className="block rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong hover:shadow-md focus-ring"
                  >
                    <h3 className="text-base font-semibold text-ink-900">
                      {c.name}
                    </h3>
                    {c.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-500">
                        {c.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs font-mono uppercase tracking-[0.14em] text-ink-500">
                      {c.member_count} členů ·{" "}
                      {c.visibility === "public"
                        ? "veřejná"
                        : c.visibility === "unlisted"
                          ? "skrytá"
                          : "soukromá"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

function EventCard({
  event,
  workspaceSlug,
  showStatus,
}: {
  event: EventSummary;
  workspaceSlug: string;
  /** Owner view? Shows status label + edit link. */
  showStatus: boolean;
}) {
  const starts = new Date(event.starts_at);
  const href = showStatus
    ? `/events/${workspaceSlug}/${event.slug}`
    : `/${workspaceSlug}/e/${event.slug}`;
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-surface p-6 shadow-sm transition-colors hover:border-border-strong hover:shadow-md focus-ring"
    >
      <div className="flex items-baseline justify-between gap-3">
        {showStatus && (
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {STATUS_LABELS[event.status]}
          </span>
        )}
        <span className="text-xs text-ink-500">
          {starts.toLocaleDateString("cs-CZ", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-ink-900">
        {event.title}
      </h3>
      {event.location_text && (
        <p className="mt-1 text-sm text-ink-500">{event.location_text}</p>
      )}
      <div className="mt-4 flex items-baseline gap-4 text-sm">
        <span className="text-ink-900">
          <strong>{event.confirmed_count}</strong>
          {event.capacity != null ? ` / ${event.capacity}` : ""}{" "}
          přihlášeno
        </span>
        {event.waitlist_count > 0 && (
          <span className="text-ink-500">
            +{event.waitlist_count} waitlist
          </span>
        )}
      </div>
    </Link>
  );
}
