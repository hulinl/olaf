"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type RSVPRecord,
  events,
} from "@/lib/api";

const RSVP_STATUS_LABEL: Record<RSVPRecord["status"], string> = {
  yes: "Potvrzeno",
  maybe: "Možná",
  no: "Odmítl",
  waitlist: "Waitlist",
  pending_approval: "Čeká na schválení",
  cancelled: "Zrušeno",
};

const RSVP_STATUS_TONE: Record<RSVPRecord["status"], string> = {
  yes: "bg-success/15 text-success",
  maybe: "bg-surface-muted text-ink-500",
  no: "bg-surface-muted text-ink-500",
  waitlist: "bg-warning/15 text-warning",
  pending_approval: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
};

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

/**
 * Level 2 admin view — roster table for a single event. Columns owner
 * cares about when chasing missing items: payment, waiver/contract,
 * insurance. Backed today by RSVP.questionnaire_answers; the placeholder
 * columns get wired when RSVP.payment_status + RSVP.required_docs land.
 */
export default function AdminEventDetailPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [rsvps, setRsvps] = useState<RSVPRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ev, list] = await Promise.all([
          events.publicEvent(wsSlug, eventSlug),
          events.rsvpList(wsSlug, eventSlug),
        ]);
        if (cancelled) return;
        setEvent(ev);
        setRsvps(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/eventy");
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/admin/eventy");
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
  }, [wsSlug, eventSlug, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!event || !rsvps) return null;

  const confirmed = rsvps.filter((r) => r.status === "yes");
  const waitlist = rsvps.filter((r) => r.status === "waitlist");
  const pending = rsvps.filter((r) => r.status === "pending_approval");
  const cancelled = rsvps.filter((r) => r.status === "cancelled");

  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  const sameDay = starts.toDateString() === ends.toDateString();
  const dateLabel = sameDay
    ? starts.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : `${starts.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })} – ${ends.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/eventy"
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na seznam akcí
      </Link>

      <header className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Akce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {dateLabel}
            {event.location_text && ` · ${event.location_text}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton
            href={`/events/${wsSlug}/${eventSlug}`}
            variant="secondary"
            size="md"
          >
            Upravit akci →
          </LinkButton>
          <a
            href={`/${wsSlug}/e/${eventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            Veřejný náhled ↗
          </a>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Přihlášeno"
          value={`${confirmed.length}${event.capacity != null ? ` / ${event.capacity}` : ""}`}
        />
        <StatTile
          label="Waitlist"
          value={String(waitlist.length)}
          tone={waitlist.length > 0 ? "warning" : undefined}
        />
        <StatTile
          label="Ke schválení"
          value={String(pending.length)}
          tone={pending.length > 0 ? "warning" : undefined}
        />
        <StatTile label="Zrušeno" value={String(cancelled.length)} />
      </div>

      {rsvps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            Zatím žádné registrace
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Až se někdo přihlásí, uvidíš ho tady.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Účastník</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Platba</th>
                <th className="px-4 py-3 text-right">Smlouva</th>
                <th className="px-4 py-3 text-right">Pojištění</th>
                <th className="px-4 py-3">Přihlášen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rsvps.map((r) => (
                <RsvpRow key={r.id} rsvp={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div
      className={[
        "rounded-2xl border bg-surface p-5",
        tone === "warning" ? "border-warning/30" : "border-border",
      ].join(" ")}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p
        className={[
          "mt-2 text-3xl font-semibold",
          tone === "warning" ? "text-warning" : "text-ink-900",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function RsvpRow({ rsvp }: { rsvp: RSVPRecord }) {
  const created = new Date(rsvp.created_at);
  return (
    <tr className="group hover:bg-brand/10">
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink-900">
            {rsvp.user_full_name || "—"}
          </span>
          <span className="text-xs text-ink-500">{rsvp.user_email}</span>
          {rsvp.user_phone && (
            <span className="text-xs text-ink-500">{rsvp.user_phone}</span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={[
            "inline-flex rounded px-2 py-0.5 text-xs font-medium",
            RSVP_STATUS_TONE[rsvp.status],
          ].join(" ")}
        >
          {RSVP_STATUS_LABEL[rsvp.status]}
        </span>
        {rsvp.waitlist_position != null && (
          <span className="ml-2 text-xs text-ink-500">
            #{rsvp.waitlist_position}
          </span>
        )}
      </td>
      {/* Placeholders — V1.5 wiring via RSVP.payment_status + required_docs. */}
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-300">—</td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-300">—</td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-300">—</td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-500">
        {created.toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
    </tr>
  );
}
