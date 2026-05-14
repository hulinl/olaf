"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import {
  ApiError,
  type EventSummary,
  type Workspace,
  assetUrl,
  events,
  workspaces,
} from "@/lib/api";
import { useUser } from "@/lib/user-context";

export default function DashboardPage() {
  const user = useUser();
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[] | null>(null);
  const [ownedEvents, setOwnedEvents] = useState<EventSummary[] | null>(null);
  const [myEvents, setMyEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, owned, mine] = await Promise.all([
          workspaces.mine(),
          events.owner().catch(() => [] as EventSummary[]),
          events.mine().catch(() => [] as EventSummary[]),
        ]);
        if (cancelled) return;
        setMyWorkspaces(ws);
        setOwnedEvents(owned);
        setMyEvents(mine);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Něco se nepovedlo načíst.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upcomingOwned = (ownedEvents ?? []).filter(
    (e) =>
      e.status === "published" ||
      e.status === "draft" ||
      e.status === "closed",
  );
  const upcomingRsvped = (myEvents ?? []).filter(
    (e) => new Date(e.starts_at).getTime() > Date.now(),
  );
  const totalConfirmed = (ownedEvents ?? []).reduce(
    (sum, e) => sum + (e.confirmed_count || 0),
    0,
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-10">
          <p className="text-sm font-medium text-brand">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Ahoj, {user.first_name}.
          </h1>
          <p className="mt-2 max-w-xl text-ink-500">
            Přehled tvých komunit a akcí — vytvoř event, sleduj přihlášené,
            nebo se podívej, na co ses zaregistroval/a.
          </p>
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && !error && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Komunity"
                value={String(myWorkspaces?.length ?? 0)}
                hint={
                  (myWorkspaces?.length ?? 0) > 0
                    ? "Klikni níže pro detail"
                    : "Zatím žádné"
                }
              />
              <StatCard
                label="Tvoje akce (Owner)"
                value={String(upcomingOwned.length)}
                hint={
                  upcomingOwned.length > 0
                    ? `${totalConfirmed} celkem přihlášených`
                    : "—"
                }
              />
              <StatCard
                label="Tvoje RSVP"
                value={String(upcomingRsvped.length)}
                hint={
                  upcomingRsvped.length > 0
                    ? "Nadcházející"
                    : "Žádné nadcházející"
                }
              />
            </div>

            <Section title="Tvoje komunity" href="/communities">
              {(myWorkspaces?.length ?? 0) === 0 ? (
                <EmptyState
                  title="Zatím nejsi v žádné komunitě"
                  body="Až tě někdo přidá nebo si vytvoříš workspace, uvidíš ho tady."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {myWorkspaces!.map((ws) => (
                    <WorkspaceMini key={ws.slug} workspace={ws} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Akce, které vedeš" href="/events">
              {upcomingOwned.length === 0 ? (
                <EmptyState
                  title="Zatím žádný event"
                  body="Vytvoř první event v Django adminu a uvidíš ho tady."
                  cta={{
                    label: "Vytvořit event",
                    href: "http://localhost:8000/admin/events/event/add/",
                  }}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcomingOwned.slice(0, 4).map((e) => (
                    <EventMini key={`${e.workspace_slug}/${e.slug}`} event={e} />
                  ))}
                </div>
              )}
            </Section>

            {upcomingRsvped.length > 0 && (
              <Section title="Tvoje nadcházející akce">
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcomingRsvped.slice(0, 4).map((e) => (
                    <EventMini key={`${e.workspace_slug}/${e.slug}`} event={e} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardSection>
        <p className="text-sm font-medium text-ink-500">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-ink-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      </CardSection>
    </Card>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {href && (
          <Link
            href={href}
            className="text-sm text-ink-500 hover:text-ink-900"
          >
            Vše →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <Card>
      <CardSection>
        <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
          <h3 className="text-base font-semibold text-ink-900">{title}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{body}</p>
          {cta && (
            <LinkButton
              href={cta.href}
              variant="primary"
              size="md"
              className="mt-5"
            >
              {cta.label}
            </LinkButton>
          )}
        </div>
      </CardSection>
    </Card>
  );
}

function WorkspaceMini({ workspace }: { workspace: Workspace }) {
  const logo = assetUrl(workspace.logo_url);
  return (
    <Link
      href={`/communities/${workspace.slug}`}
      className="group flex items-center gap-3 rounded-md border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:shadow-sm focus-ring"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-strong"
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
          <span className="text-base font-semibold text-ink-inverse">
            {workspace.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="truncate font-medium text-ink-900">{workspace.name}</p>
          {workspace.my_role === "owner" && (
            <span className="rounded bg-brand px-1 py-0.5 text-[10px] font-medium text-brand-ink">
              Owner
            </span>
          )}
        </div>
        {workspace.location && (
          <p className="truncate text-xs text-ink-500">{workspace.location}</p>
        )}
      </div>
    </Link>
  );
}

function EventMini({ event }: { event: EventSummary }) {
  const starts = new Date(event.starts_at);
  return (
    <Link
      href={`/${event.workspace_slug}/e/${event.slug}`}
      className="block rounded-md border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:shadow-sm focus-ring"
    >
      <p className="text-xs text-ink-500">
        {starts.toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
      <p className="mt-1 font-medium text-ink-900">{event.title}</p>
      {event.location_text && (
        <p className="mt-0.5 text-xs text-ink-500">{event.location_text}</p>
      )}
      <p className="mt-3 text-xs text-ink-500">
        <strong className="text-ink-900">{event.confirmed_count}</strong>
        {event.capacity != null ? ` / ${event.capacity}` : ""} přihlášeno
      </p>
    </Link>
  );
}
