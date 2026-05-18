"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import {
  ApiError,
  type EventSummary,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

const STATUS_LABELS: Record<EventSummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export default function AdminEventyPage() {
  const [ownedEvents, setOwnedEvents] = useState<EventSummary[] | null>(null);
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev] = await Promise.all([
          workspaces.mine(),
          events.owner(),
        ]);
        if (cancelled) return;
        setHasWorkspace(ws.some((w: Workspace) => w.my_role === "owner"));
        setOwnedEvents(ev);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const upcoming = (ownedEvents ?? []).filter(
    (e) => new Date(e.ends_at).getTime() >= now.getTime(),
  );
  const past = (ownedEvents ?? []).filter(
    (e) => new Date(e.ends_at).getTime() < now.getTime(),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Správce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Moje akce
          </h1>
          <p className="mt-2 max-w-2xl text-ink-500">
            Akce, které jsi vytvořil. Klikni pro detail — registrace,
            obsah stránky, sdílení.
          </p>
        </div>
        {hasWorkspace && (
          <LinkButton href="/events/new" variant="primary" size="md">
            + Vytvořit akci
          </LinkButton>
        )}
      </header>

      {loading && (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {!loading && !error && (ownedEvents?.length ?? 0) === 0 && (
        <Card>
          <CardSection>
            <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
              <h3 className="text-base font-semibold text-ink-900">
                Zatím žádná akce
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                {hasWorkspace
                  ? "Vytvoř svojí první akci."
                  : "Nejdřív si založ komunitu, pak v ní vytvoř akci."}
              </p>
              <div className="mt-5">
                {hasWorkspace ? (
                  <LinkButton href="/events/new" variant="primary" size="md">
                    + Vytvořit akci
                  </LinkButton>
                ) : (
                  <LinkButton href="/workspaces/new" variant="primary" size="md">
                    + Vytvořit komunitu
                  </LinkButton>
                )}
              </div>
            </div>
          </CardSection>
        </Card>
      )}

      {!loading && upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-500">
            Nadcházející
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((e) => (
              <EventAdminCard key={e.slug} event={e} />
            ))}
          </div>
        </section>
      )}

      {!loading && past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-500">
            Minulé
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((e) => (
              <EventAdminCard key={e.slug} event={e} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EventAdminCard({
  event,
  muted = false,
}: {
  event: EventSummary;
  muted?: boolean;
}) {
  const starts = new Date(event.starts_at);
  return (
    <Link
      href={`/events/${event.workspace_slug}/${event.slug}`}
      className={[
        "block rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-md focus-ring",
        muted ? "opacity-75 hover:opacity-100" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {STATUS_LABELS[event.status]}
        </span>
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
          {event.capacity != null ? ` / ${event.capacity}` : ""} přihlášeno
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
