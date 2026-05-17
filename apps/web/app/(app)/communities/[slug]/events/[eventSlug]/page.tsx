"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { EventDangerZone } from "@/components/event-danger-zone";
import { Alert, Card, CardSection } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

const STATUS_LABELS: Record<OlafEvent["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

const STATUS_TONE: Record<OlafEvent["status"], string> = {
  draft: "bg-surface-muted text-ink-700",
  published: "bg-success/15 text-success",
  closed: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  completed: "bg-surface-muted text-ink-500",
};

export default function EventCockpitPage({ params }: Props) {
  const { slug, eventSlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev] = await Promise.all([
          workspaces.detail(slug),
          events.publicEvent(slug, eventSlug),
        ]);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/${slug}/e/${eventSlug}`);
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/communities/${slug}`);
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Něco se pokazilo.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, eventSlug, router]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (error || !workspace || !event) {
    return (
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-4xl px-4 py-10">
          {error && <Alert variant="danger">{error}</Alert>}
        </section>
      </main>
    );
  }

  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  const sameDay =
    starts.toDateString() === ends.toDateString();
  const dateLabel = sameDay
    ? starts.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : `${starts.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "short",
      })} – ${ends.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`;

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-12">
        <p className="text-sm text-ink-500">
          <Link
            href={`/communities/${slug}`}
            className="hover:text-ink-900"
          >
            ← {workspace.name}
          </Link>
        </p>

        <header className="mt-4 mb-8">
          <div className="flex flex-wrap items-baseline gap-3">
            <span
              className={[
                "shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
                STATUS_TONE[event.status],
              ].join(" ")}
            >
              {STATUS_LABELS[event.status]}
            </span>
            <span className="text-sm text-ink-500">{dateLabel}</span>
            {event.location_text && (
              <span className="text-sm text-ink-500">
                · {event.location_text}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {event.title}
          </h1>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Přihlášeno"
            value={String(event.confirmed_count)}
            hint={
              event.capacity != null
                ? `z kapacity ${event.capacity}`
                : "bez limitu"
            }
          />
          <StatTile
            label="Waitlist"
            value={String(event.waitlist_count)}
            hint={
              event.waitlist_count > 0
                ? "automaticky postoupí při zrušení"
                : event.waitlist_enabled
                  ? "zapnutý, zatím prázdný"
                  : "vypnutý"
            }
          />
          <StatTile
            label="Volných míst"
            value={
              event.remaining_capacity == null
                ? "∞"
                : String(event.remaining_capacity)
            }
            hint={
              event.is_open_for_rsvp ? "RSVP otevřené" : "RSVP zavřené"
            }
          />
        </div>

        <h2 className="mt-10 text-lg font-semibold text-ink-900">Akce</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ActionTile
            title="Upravit detaily"
            description="Název, popis, termín, místo, kapacita, dotazník."
            href={`/communities/${slug}/events/${eventSlug}/edit`}
          />
          <ActionTile
            title="Bloky stránky"
            description="Sestav veřejnou stránku — hero, dny, statistiky, co je v ceně."
            href={`/communities/${slug}/events/${eventSlug}/blocks`}
          />
          <ActionTile
            title="Přihlášení"
            description={`${event.confirmed_count} potvrzeno${
              event.waitlist_count > 0
                ? ` · ${event.waitlist_count} waitlist`
                : ""
            }. Schvaluj, kontaktuj, exportuj.`}
            href={`/communities/${slug}/events/${eventSlug}/rsvps`}
          />
          <ActionTile
            title="Veřejný náhled"
            description="Otevři, jak akci uvidí účastníci."
            href={`/${slug}/e/${eventSlug}`}
            external
          />
        </div>

        <div className="mt-10 border-t border-border pt-10">
          <EventDangerZone
            event={event}
            workspaceSlug={slug}
            onCancelled={(updated) => setEvent(updated)}
          />
        </div>
      </section>
    </main>
  );
}

function StatTile({
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

function ActionTile({
  title,
  description,
  href,
  external = false,
}: {
  title: string;
  description: string;
  href: string;
  external?: boolean;
}) {
  const inner = (
    <div className="flex h-full flex-col rounded-md border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-muted/40 focus-ring">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        <span className="text-ink-500" aria-hidden="true">
          {external ? "↗" : "→"}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-500">{description}</p>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return <Link href={href}>{inner}</Link>;
}
