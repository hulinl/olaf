"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, use, useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type EventSummary,
  type Workspace,
  auth,
  workspaces,
} from "@/lib/api";

const STATUS_LABELS: Record<EventSummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Level 2 admin view of a single komunita — stays inside the /admin shell
 * (sidebar visible). Shows the workspace's events as a table; from here
 * the owner can drill into the existing /workspaces/<slug>/edit cockpit
 * for profile edits, and links to the public profile in a new tab.
 */
export default function AdminKomunitaDetailPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
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
        if (ws.my_role !== "owner") {
          try {
            await auth.me();
            router.replace(`/${slug}`);
          } catch {
            router.replace(`/login?next=/admin/komunity/${slug}`);
          }
          return;
        }
        setWorkspace(ws);
        setEventList(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/admin/komunity/${slug}`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/komunity");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Něco se pokazilo.");
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
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!workspace || !eventList) return null;

  const now = Date.now();
  const upcoming = eventList.filter(
    (e) => new Date(e.ends_at).getTime() >= now,
  );
  const past = eventList.filter(
    (e) => new Date(e.ends_at).getTime() < now,
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/komunity"
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na seznam komunit
      </Link>

      <header className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Komunita</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {workspace.name}
          </h1>
          {workspace.location && (
            <p className="mt-1 text-sm text-ink-500">{workspace.location}</p>
          )}
          {workspace.bio && (
            <p className="mt-3 max-w-2xl text-ink-700">{workspace.bio}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton
            href={`/admin/komunity/${workspace.slug}/edit`}
            variant="secondary"
            size="md"
          >
            Upravit komunitu →
          </LinkButton>
          <a
            href={`/${workspace.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            Veřejný profil ↗
          </a>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Členů" value={String(workspace.member_count ?? 1)} />
        <StatTile label="Nadcházející akce" value={String(upcoming.length)} />
        <StatTile label="Minulé akce" value={String(past.length)} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink-900">
          Akce této komunity
        </h2>
        {eventList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
            <h3 className="text-base font-semibold text-ink-900">
              Žádné akce
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
              Vytvoř první akci v této komunitě.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Akce</th>
                  <th className="px-4 py-3">Termín</th>
                  <th className="px-4 py-3 text-right">Přihlášeno</th>
                  <th className="px-4 py-3 text-right">Waitlist</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {eventList.map((e) => (
                  <EventRow key={e.slug} event={e} wsSlug={workspace.slug} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function EventRow({
  event,
  wsSlug,
}: {
  event: EventSummary;
  wsSlug: string;
}) {
  const router = useRouter();
  const href = `/admin/eventy/${wsSlug}/${event.slug}`;
  const starts = new Date(event.starts_at);

  function handleRowClick(e: ReactMouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, label")) return;
    router.push(href);
  }

  return (
    <tr
      onClick={handleRowClick}
      className="group cursor-pointer hover:bg-brand/10"
    >
      <td className="px-4 py-3">
        <Link
          href={href}
          className="flex flex-col gap-0.5 focus-ring"
        >
          <span className="font-medium text-ink-900">{event.title}</span>
          <span className="flex items-center gap-2 text-xs text-ink-500">
            <span className="font-mono uppercase tracking-wide">
              {STATUS_LABELS[event.status]}
            </span>
            {event.location_text && <span>· {event.location_text}</span>}
          </span>
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
        {starts.toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink-900">
        {event.capacity != null
          ? `${event.confirmed_count} / ${event.capacity}`
          : event.confirmed_count}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-700">
        {event.waitlist_count > 0 ? event.waitlist_count : "—"}
      </td>
    </tr>
  );
}
