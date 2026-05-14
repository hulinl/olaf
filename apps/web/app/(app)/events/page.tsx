"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { ApiError, type EventSummary, events } from "@/lib/api";

const STATUS_LABELS: Record<EventSummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export default function EventsPage() {
  const [list, setList] = useState<EventSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await events.owner();
        if (!cancelled) setList(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load events.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upcoming = (list ?? []).filter(
    (e) =>
      e.status === "published" ||
      e.status === "draft" ||
      e.status === "closed",
  );
  const past = (list ?? []).filter(
    (e) => e.status === "completed" || e.status === "cancelled",
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand">Events</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Tvoje akce
            </h1>
            <p className="mt-2 max-w-xl text-ink-500">
              Eventy ve workspaces, kde jsi Owner. Zatím se nové eventy
              vytvářejí v Django admin — UI pro Owner tvorbu přijde brzy.
            </p>
          </div>
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && !error && list !== null && list.length === 0 && (
          <Card>
            <CardSection>
              <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
                <h2 className="text-base font-semibold text-ink-900">
                  Žádné akce zatím
                </h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                  Až vytvoříš první event (v Django adminu), uvidíš ho tady
                  spolu s počtem přihlášených.
                </p>
                <LinkButton
                  href="http://localhost:8000/admin/events/event/add/"
                  variant="secondary"
                  size="md"
                  className="mt-5"
                >
                  Otevřít Django admin
                </LinkButton>
              </div>
            </CardSection>
          </Card>
        )}

        {!loading && upcoming.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-lg font-semibold text-ink-900">
              Nadcházející
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {upcoming.map((e) => (
                <EventRow key={`${e.workspace_slug}/${e.slug}`} event={e} />
              ))}
            </div>
          </section>
        )}

        {!loading && past.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-ink-900">
              Minulé
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {past.map((e) => (
                <EventRow key={`${e.workspace_slug}/${e.slug}`} event={e} />
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function EventRow({ event }: { event: EventSummary }) {
  const starts = new Date(event.starts_at);
  return (
    <Card>
      <CardSection>
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
          <Link
            href={`/${event.workspace_slug}/e/${event.slug}`}
            className="hover:underline"
          >
            {event.title}
          </Link>
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
      </CardSection>
    </Card>
  );
}
