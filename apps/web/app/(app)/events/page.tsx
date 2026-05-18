"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { ApiError, type EventSummary, events } from "@/lib/api";

/**
 * Consumer view — events the signed-in user is RSVPed to. Owner / creator
 * surface lives at /admin/events and uses `events.owner()`.
 */
export default function MyEventsPage() {
  const [list, setList] = useState<EventSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await events.mine();
        if (!cancelled) setList(data);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Nepodařilo se načíst akce.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const upcoming = (list ?? []).filter(
    (e) => new Date(e.ends_at).getTime() >= now.getTime(),
  );
  const past = (list ?? []).filter(
    (e) => new Date(e.ends_at).getTime() < now.getTime(),
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-10">
          <p className="text-sm font-medium text-brand">Akce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Moje akce
          </h1>
          <p className="mt-2 max-w-xl text-ink-500">
            Akce, na které ses přihlásil, nebo na ně čekáš ve waitlistu.
          </p>
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
                  Zatím žádné přihlášky
                </h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                  Až se přihlásíš na akci v některé z komunit, uvidíš ji tady.
                </p>
                <LinkButton
                  href="/workspaces"
                  variant="secondary"
                  size="md"
                  className="mt-5"
                >
                  Projít komunity
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
    <Link
      href={`/${event.workspace_slug}/e/${event.slug}`}
      className="block rounded-lg border border-border bg-surface p-6 shadow-sm transition-colors hover:border-border-strong hover:shadow-md focus-ring"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink-500">
          {event.location_text || "—"}
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
      <p className="mt-3 text-sm text-ink-500">
        <strong className="text-ink-900">{event.confirmed_count}</strong>
        {event.capacity != null ? ` / ${event.capacity}` : ""} přihlášeno
      </p>
    </Link>
  );
}
