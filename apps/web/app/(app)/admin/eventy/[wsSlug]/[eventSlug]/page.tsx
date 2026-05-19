"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type RSVPRecord,
  events,
} from "@/lib/api";

type Filter = "all" | "yes" | "waitlist" | "pending_approval" | "cancelled";

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
export default function AdminEventDetailPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      }
    >
      <AdminEventDetail {...props} />
    </Suspense>
  );
}

function AdminEventDetail({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter") as Filter | null;
  const filter: Filter =
    filterParam &&
    ["all", "yes", "waitlist", "pending_approval", "cancelled"].includes(
      filterParam,
    )
      ? filterParam
      : "all";
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
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/admin/eventy/${wsSlug}/${eventSlug}`);
          return;
        }
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
  const filteredRsvps =
    filter === "all" ? rsvps : rsvps.filter((r) => r.status === filter);

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
            href={`/admin/eventy/${wsSlug}/${eventSlug}/edit`}
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
          href={`/admin/eventy/${wsSlug}/${eventSlug}?filter=yes`}
          active={filter === "yes"}
        />
        <StatTile
          label="Waitlist"
          value={String(waitlist.length)}
          tone={waitlist.length > 0 ? "warning" : undefined}
          href={`/admin/eventy/${wsSlug}/${eventSlug}?filter=waitlist`}
          active={filter === "waitlist"}
        />
        <StatTile
          label="Ke schválení"
          value={String(pending.length)}
          tone={pending.length > 0 ? "warning" : undefined}
          href={`/admin/eventy/${wsSlug}/${eventSlug}?filter=pending_approval`}
          active={filter === "pending_approval"}
        />
        <StatTile
          label="Zrušeno"
          value={String(cancelled.length)}
          href={`/admin/eventy/${wsSlug}/${eventSlug}?filter=cancelled`}
          active={filter === "cancelled"}
        />
      </div>

      {filter !== "all" && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-500">Filtr aktivní.</span>
          <Link
            href={`/admin/eventy/${wsSlug}/${eventSlug}`}
            className="font-medium text-brand hover:underline"
          >
            Zobrazit všechny ×
          </Link>
        </div>
      )}

      {filteredRsvps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            {filter === "all"
              ? "Zatím žádné registrace"
              : "Žádné záznamy v tomto filtru"}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            {filter === "all"
              ? "Až se někdo přihlásí, uvidíš ho tady."
              : "Zkus jiný filtr nebo zobraz všechny."}
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
              {filteredRsvps.map((r) => (
                <RsvpRow
                  key={r.id}
                  rsvp={r}
                  wsSlug={wsSlug}
                  eventSlug={eventSlug}
                  onPaid={(updated) =>
                    setRsvps((prev) =>
                      prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev,
                    )
                  }
                />
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
  href,
  active,
}: {
  label: string;
  value: string;
  tone?: "warning";
  href?: string;
  active?: boolean;
}) {
  const body = (
    <div
      className={[
        "rounded-2xl border bg-surface p-5 transition-colors",
        active
          ? "border-brand bg-brand/5"
          : tone === "warning"
            ? "border-warning/30"
            : "border-border",
        href ? "hover:border-brand hover:bg-brand/10" : "",
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
  if (href) return <Link href={href}>{body}</Link>;
  return body;
}

function RsvpRow({
  rsvp,
  wsSlug,
  eventSlug,
  onPaid,
}: {
  rsvp: RSVPRecord;
  wsSlug: string;
  eventSlug: string;
  onPaid: (updated: RSVPRecord) => void;
}) {
  const [marking, setMarking] = useState(false);
  const created = new Date(rsvp.created_at);

  async function handleMarkPaid() {
    if (marking) return;
    if (!confirm("Označit jako zaplaceno?")) return;
    setMarking(true);
    try {
      const updated = await events.markRsvpPaid(wsSlug, eventSlug, rsvp.id);
      onPaid(updated);
    } catch {
      // Quietly fail; admin can retry.
    } finally {
      setMarking(false);
    }
  }

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
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <PaymentCell rsvp={rsvp} onMarkPaid={handleMarkPaid} marking={marking} />
      </td>
      {/* Smlouva / Pojištění — Slice 7 (required_documents). */}
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

function PaymentCell({
  rsvp,
  onMarkPaid,
  marking,
}: {
  rsvp: RSVPRecord;
  onMarkPaid: () => void;
  marking: boolean;
}) {
  if (rsvp.payment_status === "waived") {
    return <span className="text-ink-300">—</span>;
  }
  if (rsvp.payment_status === "paid") {
    return (
      <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-success/15 text-success">
        Zaplaceno
      </span>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-warning/15 text-warning">
        Čeká
      </span>
      <button
        type="button"
        onClick={onMarkPaid}
        disabled={marking}
        className="text-[11px] font-medium text-ink-500 hover:text-ink-900 disabled:opacity-50"
      >
        {marking ? "..." : "Označit zaplaceno"}
      </button>
    </div>
  );
}
