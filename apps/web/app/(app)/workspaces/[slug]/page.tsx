"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { DiscussionWall } from "@/components/discussion-wall";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { WorkspaceMetaLine } from "@/components/ui/workspace-meta-line";
import { WorkspaceSocialsRow } from "@/components/workspace-socials-row";
import { useUser } from "@/lib/user-context";
import {
  ApiError,
  type EventSummary,
  type Workspace,
  assetUrl,
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
  const user = useUser();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [eventList, setEventList] = useState<EventSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev] = await Promise.all([
          workspaces.detail(slug),
          workspaces.eventsFor(slug),
        ]);
        if (cancelled) return;
        setWorkspace(ws);
        setEventList(ev);
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
  // Stejný filter jako public komunita view + in-app dashboard
  // (PR #224/#225). Status-only filter dříve nechával proběhlé published
  // akce v „upcoming" — auto-flip do `completed` běží denně a u akcí
  // skončených třeba dnes ráno se ještě nestihl projít. Per user
  // 2026-06-25: dělení podle `starts_at` (ne `ends_at`).
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const upcoming = (eventList ?? []).filter(
    (e) =>
      e.status === "published" &&
      new Date(e.starts_at).getTime() >= todayStart,
  );
  const past = (eventList ?? []).filter(
    (e) =>
      (e.status === "published" || e.status === "completed") &&
      new Date(e.starts_at).getTime() < todayStart,
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <Breadcrumbs
          items={[
            { label: "Komunity", href: "/workspaces" },
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
              className="mt-1"
            />
            <WorkspaceSocialsRow workspace={workspace} className="mt-3" />
          </div>
          <a
            href={`/${workspace.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Veřejný profil"
            aria-label="Otevřít veřejný profil v novém okně"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 3h7v7" />
              <path d="M10 14L21 3" />
              <path d="M21 14v7H3V3h7" />
            </svg>
          </a>
        </header>

        {workspace.bio && (
          <p className="mt-6 max-w-2xl text-ink-700">{workspace.bio}</p>
        )}

        <WorkspaceTabs
          workspace={workspace}
          upcoming={upcoming}
          past={past}
          isOwner={isOwner}
          slug={slug}
          userId={user.id}
        />
      </section>
    </main>
  );
}

/** Tab switcher between Akce (events) and Nástěnka (wall).
 *  Replaces the old "all sections stacked + jump-to anchor strip" so
 *  the page is shorter, doesn't scroll-jump on tab switch, and Nástěnka
 *  is reachable on small viewports without scrolling past the empty
 *  events grid. */
function WorkspaceTabs({
  workspace,
  upcoming,
  past,
  isOwner,
  slug,
  userId,
}: {
  workspace: Workspace;
  upcoming: EventSummary[];
  past: EventSummary[];
  isOwner: boolean;
  slug: string;
  userId: number;
}) {
  // Owner-only viewers get the wall tab; visitors w/o access only see
  // Akce, so hiding the tab strip entirely would be confusing — keep
  // a single visible tab so the page structure feels intentional.
  type Tab = "akce" | "nastenka";
  const [tab, setTab] = useState<Tab>("akce");

  return (
    <>
      <div
        role="tablist"
        aria-label="Sekce komunity"
        className="mt-8 flex flex-wrap gap-2 text-sm"
      >
        <TabButton active={tab === "akce"} onClick={() => setTab("akce")}>
          Nadcházející akce
        </TabButton>
        {isOwner && (
          <TabButton
            active={tab === "nastenka"}
            onClick={() => setTab("nastenka")}
          >
            Nástěnka
          </TabButton>
        )}
      </div>

      {tab === "akce" && (
        <>
          <section className="mt-8">
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
                        href="/admin/eventy/new"
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
            <section className="mt-10">
              <details className="group">
                <summary className="cursor-pointer list-none">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-ink-500 hover:text-ink-900">
                    <span className="transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    Minulé akce ({past.length})
                  </span>
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {past.map((e) => (
                    <EventCard
                      key={e.slug}
                      event={e}
                      workspaceSlug={workspace.slug}
                      showStatus={isOwner}
                    />
                  ))}
                </div>
              </details>
            </section>
          )}
        </>
      )}

      {tab === "nastenka" && isOwner && (
        <section className="mt-8">
          <DiscussionWall
            scope={{ kind: "workspace", slug, isModerator: isOwner }}
            currentUserId={userId}
            topicHref={(topicId) =>
              `/workspaces/${slug}/nastenka/${topicId}`
            }
          />
        </section>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "rounded-md border px-3 py-1.5 font-medium focus-ring",
        active
          ? "border-brand bg-brand text-brand-ink"
          : "border-border bg-surface text-ink-700 hover:bg-surface-muted hover:text-ink-900",
      ].join(" ")}
    >
      {children}
    </button>
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
    ? `/admin/eventy/${workspaceSlug}/${event.slug}`
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
