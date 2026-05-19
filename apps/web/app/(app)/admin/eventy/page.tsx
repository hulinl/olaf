"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type EventSummary,
  events,
} from "@/lib/api";

const STATUS_LABELS: Record<EventSummary["status"], string> = {
  draft: "Draft",
  published: "Publikováno",
  closed: "Uzavřeno",
  cancelled: "Zrušeno",
  completed: "Proběhlo",
};

const STATUS_TONE: Record<EventSummary["status"], string> = {
  draft: "bg-surface-muted text-ink-500",
  published: "bg-success/15 text-success",
  closed: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  completed: "bg-surface-muted text-ink-500",
};

/**
 * Level 1 admin view of all owned events — a table, not cards.
 * Columns the owner glances at when triaging: capacity fill, payment
 * status (V1.5), document status (V1.5). Clicking a row drills into
 * the per-event RSVP roster (Level 2), which itself links to the
 * existing cockpit (Level 3) for edits.
 *
 * For V1, payment / document columns render `—` because the backing
 * fields (RSVP.payment_status, RSVP.required_docs) don't exist yet —
 * but the column structure is in place so the data only needs to be
 * wired when those slices land.
 */
export default function AdminEventyTablePage() {
  const router = useRouter();
  const [ownedEvents, setOwnedEvents] = useState<EventSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ev = await events.owner();
        if (cancelled) return;
        setOwnedEvents(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/eventy");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const now = Date.now();
  const rows = (ownedEvents ?? []).filter((e) => {
    const endsAt = new Date(e.ends_at).getTime();
    if (filter === "upcoming") return endsAt >= now;
    if (filter === "past") return endsAt < now;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Tvůrce</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Moje akce
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Tabulkový přehled tvých akcí. Klikni na řádek pro detail
          účastníků, nebo otevři menu pro editaci.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs filter={filter} onChange={setFilter} />
        <LinkButton href="/admin/eventy/new" variant="primary" size="md">
          + Vytvořit akci
        </LinkButton>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            {filter === "upcoming"
              ? "Žádné nadcházející akce"
              : filter === "past"
                ? "Žádné minulé akce"
                : "Zatím žádné akce"}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Vytvoř svojí první akci. Komunitu mít nemusíš — akce má vlastní
            stránku a registraci.
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Akce</th>
                <th className="px-4 py-3">Termín</th>
                <th className="px-4 py-3 text-right">Přihlášeno</th>
                <th className="px-4 py-3 text-right">Waitlist</th>
                <th className="px-4 py-3 text-right">Platby</th>
                <th className="px-4 py-3 text-right">Smlouvy</th>
                <th className="px-4 py-3 text-right">Pojištění</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((e) => (
                <EventRow key={`${e.workspace_slug}/${e.slug}`} event={e} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterTabs({
  filter,
  onChange,
}: {
  filter: "upcoming" | "past" | "all";
  onChange: (f: "upcoming" | "past" | "all") => void;
}) {
  const tabs: { v: "upcoming" | "past" | "all"; label: string }[] = [
    { v: "upcoming", label: "Nadcházející" },
    { v: "past", label: "Minulé" },
    { v: "all", label: "Vše" },
  ];
  // Pill-shaped segmented control: outer + inner both rounded-full, so
  // the active button never appears to "leak" past the container — any
  // radius mismatch we tried with rounded-md/lg + math padding kept
  // showing visible edges on prod (screenshot 2026-05-19).
  return (
    <div className="inline-flex w-fit rounded-full border border-border bg-surface p-1">
      {tabs.map((t) => (
        <button
          key={t.v}
          type="button"
          onClick={() => onChange(t.v)}
          className={[
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-ring",
            filter === t.v
              ? "bg-ink-900 text-ink-inverse"
              : "text-ink-700 hover:bg-surface-muted",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function EventRow({ event }: { event: EventSummary }) {
  const router = useRouter();
  const href = `/admin/eventy/${event.workspace_slug}/${event.slug}`;
  const starts = new Date(event.starts_at);
  const dateLabel = starts.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const capacity =
    event.capacity != null
      ? `${event.confirmed_count} / ${event.capacity}`
      : String(event.confirmed_count);

  // Make the whole row navigable. Skip when click started inside an
  // interactive element so users can still text-select cells without
  // triggering navigation.
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
          <span className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span
              className={[
                "inline-flex rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                STATUS_TONE[event.status],
              ].join(" ")}
            >
              {STATUS_LABELS[event.status]}
            </span>
            {event.location_text && <span>· {event.location_text}</span>}
          </span>
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-700">{dateLabel}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink-900">
        {capacity}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-700">
        {event.waitlist_count > 0 ? event.waitlist_count : "—"}
      </td>
      {/* Platby / Smlouvy / Pojištění — V1.5 fields, render placeholder
          for now so the column structure is locked in. */}
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-300">
        —
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-300">
        —
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-300">
        —
      </td>
    </tr>
  );
}
