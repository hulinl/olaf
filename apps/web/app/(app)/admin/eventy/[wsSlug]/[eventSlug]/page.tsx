"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";

import { EventChecklist } from "@/components/event-checklist";
import { ParticipantProfileDialog } from "@/components/participant-profile-dialog";
import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ShareButton } from "@/components/ui/share-button";
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

const CANCELLATION_REASON_LABEL: Record<
  Exclude<RSVPRecord["cancellation_reason"], "">,
  string
> = {
  self: "Sám zrušil",
  by_token: "Mailem",
  owner: "Zrušil pořadatel",
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
  const [profileRsvpId, setProfileRsvpId] = useState<number | null>(null);

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
  // "Vše" v hlavním rosteru = aktivní registrace; zrušené mají
  // dedikovaný stat tile a vlastní filtr, aby nepřekážely v denní
  // práci ownera. Když user explicitně klikne na "Zrušeno", uvidí
  // jen je.
  const filteredRsvps =
    filter === "all"
      ? rsvps.filter((r) => r.status !== "cancelled")
      : rsvps.filter((r) => r.status === filter);

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
          <ShareButton
            url={`/${wsSlug}/e/${eventSlug}`}
            title={event.title}
            text={`${event.title} — ${dateLabel}`}
            label="Sdílet akci"
          />
        </div>
      </header>

      <div className="grid grid-cols-4 items-stretch gap-2 sm:gap-3">
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

      <EventChecklist workspaceSlug={wsSlug} eventSlug={eventSlug} />

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
        <>
          {/* Mobile: card list. The 7-col table on a phone forced
              horizontal scroll AND hid the approve/reject CTAs that
              are critical for pending_approval flows. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {filteredRsvps.map((r) => (
              <RsvpCard
                key={r.id}
                rsvp={r}
                wsSlug={wsSlug}
                eventSlug={eventSlug}
                onUpdate={(updated) =>
                  setRsvps((prev) =>
                    prev
                      ? prev.map((x) => (x.id === updated.id ? updated : x))
                      : prev,
                  )
                }
                onRemove={(removedId) =>
                  setRsvps((prev) =>
                    prev ? prev.filter((x) => x.id !== removedId) : prev,
                  )
                }
                onOpenProfile={() => setProfileRsvpId(r.id)}
              />
            ))}
          </div>
          {/* sm+: full table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Účastník</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Platba</th>
                  <th className="px-4 py-3 text-right">Faktura</th>
                  <th className="px-4 py-3 text-right">Smlouva</th>
                  <th className="px-4 py-3 text-right">Pojištění</th>
                  <th className="px-4 py-3">Přihlášen</th>
                  {/* Akční sloupec na pravém konci řádku — daleko od
                      dat, snižuje riziko misclick-u při procházení
                      rosteru. Hlavička prázdná, ikona-only buttony
                      v rowu (popelnice). */}
                  <th className="px-2 py-3" aria-label="Akce" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRsvps.map((r) => (
                  <RsvpRow
                    key={r.id}
                    rsvp={r}
                    wsSlug={wsSlug}
                    eventSlug={eventSlug}
                    requiredDocs={event.required_documents ?? []}
                    onUpdate={(updated) =>
                      setRsvps((prev) =>
                        prev
                          ? prev.map((x) =>
                              x.id === updated.id ? updated : x,
                            )
                          : prev,
                      )
                    }
                    onRemove={(removedId) =>
                      setRsvps((prev) =>
                        prev
                          ? prev.filter((x) => x.id !== removedId)
                          : prev,
                      )
                    }
                    onOpenProfile={() => setProfileRsvpId(r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ParticipantProfileDialog
        workspaceSlug={wsSlug}
        eventSlug={eventSlug}
        rsvpId={profileRsvpId}
        onClose={() => setProfileRsvpId(null)}
      />
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
        "flex h-full flex-col justify-between rounded-xl border bg-surface p-2.5 transition-colors sm:rounded-2xl sm:p-5",
        active
          ? "border-brand bg-brand/5"
          : tone === "warning"
            ? "border-warning/30"
            : "border-border",
        href ? "hover:border-brand hover:bg-brand/10" : "",
      ].join(" ")}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-500 sm:text-xs">
        {label}
      </p>
      <p
        className={[
          "mt-1 text-lg font-semibold leading-tight sm:mt-2 sm:text-3xl",
          tone === "warning" ? "text-warning" : "text-ink-900",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
  if (href) return <Link href={href} className="block h-full focus-ring">{body}</Link>;
  return body;
}

function RsvpRow({
  rsvp,
  wsSlug,
  eventSlug,
  requiredDocs,
  onUpdate,
  onRemove,
  onOpenProfile,
}: {
  rsvp: RSVPRecord;
  wsSlug: string;
  eventSlug: string;
  requiredDocs: { key: string; label: string; required: boolean }[];
  onUpdate: (updated: RSVPRecord) => void;
  onRemove: (removedId: number) => void;
  onOpenProfile: () => void;
}) {
  const [busy, setBusy] = useState<
    "paid" | "approve" | "reject" | "organizer" | "remove" | null
  >(null);
  const confirmDialog = useConfirm();
  const created = new Date(rsvp.created_at);
  const requiredKeys = new Set(requiredDocs.map((d) => d.key));
  const uploadedKeys = new Set(rsvp.uploaded_doc_keys);
  const verifiedKeys = new Set(rsvp.verified_doc_keys);

  async function handleMarkPaid() {
    if (busy) return;
    if (!confirm("Označit jako zaplaceno?")) return;
    setBusy("paid");
    try {
      const updated = await events.markRsvpPaid(wsSlug, eventSlug, rsvp.id);
      onUpdate(updated);
    } catch {
      // Quietly fail; admin can retry.
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleOrganizer() {
    if (busy) return;
    const next = !rsvp.is_organizer;
    if (
      next &&
      !confirm(
        `Označit ${rsvp.user_full_name || rsvp.user_email} jako organizátora?\n\nNebude se počítat do kapacity ani se po něm nebude chtít platba.`,
      )
    )
      return;
    if (
      !next &&
      !confirm(
        "Odebrat organizátorovi tuhle roli? Bude opět účastník (s případnou platbou).",
      )
    )
      return;
    setBusy("organizer");
    try {
      const updated = await events.toggleRsvpOrganizer(
        wsSlug,
        eventSlug,
        rsvp.id,
        next,
      );
      onUpdate(updated);
    } catch {
      /* keep quiet */
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    if (busy) return;
    setBusy("approve");
    try {
      const updated = await events.approveRsvp(wsSlug, eventSlug, rsvp.id);
      onUpdate(updated);
    } catch {
      /* keep quiet, admin can retry */
    } finally {
      setBusy(null);
    }
  }

  async function handleReject() {
    if (busy) return;
    if (!confirm("Zamítnout tuto registraci?")) return;
    setBusy("reject");
    try {
      const updated = await events.rejectRsvp(wsSlug, eventSlug, rsvp.id);
      onUpdate(updated);
    } catch {
      /* keep quiet */
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    if (busy) return;
    const who = rsvp.user_full_name || rsvp.user_email;
    const ok = await confirmDialog({
      title: `Odebrat ${who} z akce?`,
      description:
        'Účastníka i případnou roli organizátora smažeme. Pokud se znovu přihlásí, půjde jako úplně nová registrace (projde schvalováním, pokud je nastavené). Historie zůstane v auditu.',
      confirmLabel: "Odebrat",
      variant: "danger",
    });
    if (!ok) return;
    setBusy("remove");
    try {
      await events.removeRsvp(wsSlug, eventSlug, rsvp.id);
      onRemove(rsvp.id);
    } catch {
      /* keep quiet */
    } finally {
      setBusy(null);
    }
  }

  async function handleDismissDuplicate() {
    try {
      const updated = await events.dismissDuplicateHint(
        wsSlug,
        eventSlug,
        rsvp.id,
      );
      onUpdate(updated);
    } catch {
      /* keep quiet */
    }
  }

  return (
    <tr className="group hover:bg-brand/10">
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex min-w-0 flex-col items-start gap-0.5 rounded text-left transition-colors focus-ring hover:text-brand"
          >
            <span className="font-medium text-ink-900 group-hover:underline">
              {rsvp.user_full_name || "—"}
            </span>
            <span className="text-xs text-ink-500">{rsvp.user_email}</span>
          {rsvp.user_phone && (
            <span className="text-xs text-ink-500">{rsvp.user_phone}</span>
          )}
          </button>
          {rsvp.duplicate_hints && rsvp.duplicate_hints.length > 0 && (
            <DuplicateBadge
              hints={rsvp.duplicate_hints}
              onDismiss={handleDismissDuplicate}
            />
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {rsvp.is_organizer ? (
            <span className="inline-flex w-fit rounded bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
              Organizátor
            </span>
          ) : (
            <span
              className={[
                "inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium",
                RSVP_STATUS_TONE[rsvp.status],
              ].join(" ")}
            >
              {RSVP_STATUS_LABEL[rsvp.status]}
              {rsvp.waitlist_position != null && (
                <span className="ml-1 opacity-80">#{rsvp.waitlist_position}</span>
              )}
            </span>
          )}
          {rsvp.status === "cancelled" && rsvp.cancellation_reason !== "" && (
            <span className="text-[11px] text-ink-500">
              {CANCELLATION_REASON_LABEL[rsvp.cancellation_reason]}
            </span>
          )}
          {rsvp.status === "pending_approval" && !rsvp.is_organizer && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy !== null}
                className="rounded-md bg-success px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50 focus-ring"
              >
                {busy === "approve" ? "..." : "Schválit"}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={busy !== null}
                className="rounded-md border border-danger/40 bg-surface px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-danger-soft disabled:opacity-50 focus-ring"
              >
                {busy === "reject" ? "..." : "Zamítnout"}
              </button>
            </div>
          )}
          {/* Akce na účastníkovi mají smysl jen dokud je registrace
              aktivní. Cancelled row ukazuje jen status badge —
              organizer toggle mizí, jinak by tam zůstaly klikatelné
              kontroly nad zrušenou registrací. Remove (popelnice) je
              v dedikovaném sloupci na konci řádku. */}
          {rsvp.can_toggle_organizer && (
            <button
              type="button"
              onClick={handleToggleOrganizer}
              disabled={busy !== null}
              className="text-left text-[11px] font-medium text-ink-500 hover:text-brand disabled:opacity-50"
            >
              {busy === "organizer"
                ? "..."
                : rsvp.is_organizer
                  ? "Odebrat organizátora"
                  : "Označit organizátorem"}
            </button>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {rsvp.is_organizer || rsvp.status === "cancelled" ? (
          <span className="text-ink-300">—</span>
        ) : (
          <PaymentCell rsvp={rsvp} onMarkPaid={handleMarkPaid} marking={busy === "paid"} />
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {rsvp.is_organizer || rsvp.status === "cancelled" ? (
          <span className="text-ink-300">—</span>
        ) : (
          <InvoiceCell rsvp={rsvp} wsSlug={wsSlug} eventSlug={eventSlug} />
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {rsvp.is_organizer || rsvp.status === "cancelled" ? (
          <span className="text-ink-300">—</span>
        ) : (
          <DocCell
            docKey="smlouva"
            required={requiredKeys.has("smlouva")}
            uploaded={uploadedKeys.has("smlouva")}
            verified={verifiedKeys.has("smlouva")}
          />
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {rsvp.is_organizer || rsvp.status === "cancelled" ? (
          <span className="text-ink-300">—</span>
        ) : (
          <DocCell
            docKey="pojisteni"
            required={requiredKeys.has("pojisteni")}
            uploaded={uploadedKeys.has("pojisteni")}
            verified={verifiedKeys.has("pojisteni")}
          />
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-500">
        {created.toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-right">
        {rsvp.can_be_removed && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy !== null}
            title="Odebrat z akce"
            aria-label="Odebrat z akce"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-danger-soft hover:text-danger disabled:opacity-50 focus-ring"
          >
            {busy === "remove" ? (
              <span className="text-[10px]">…</span>
            ) : (
              <TrashIcon className="h-4 w-4" />
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

function DuplicateBadge({
  hints,
  onDismiss,
}: {
  hints: ("same_phone" | "same_name")[];
  /** Owner-side dismiss — když je otec se synem, klik ✕ to schová.
   *  Když není předán, badge je read-only (např. v starých surfaces). */
  onDismiss?: () => void;
}) {
  const tooltipParts: string[] = [];
  if (hints.includes("same_phone")) {
    tooltipParts.push("stejný telefon jako jiná přihláška");
  }
  if (hints.includes("same_name")) {
    tooltipParts.push("stejné jméno jako jiná přihláška");
  }
  return (
    <span
      title={`Možný duplikát: ${tooltipParts.join(" + ")}`}
      className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
    >
      ⚠ Duplikát?
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          title="Není to duplikát"
          aria-label="Není to duplikát"
          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-warning/70 hover:bg-warning/30 hover:text-warning focus-ring"
        >
          <span aria-hidden className="text-[10px] leading-none">×</span>
        </button>
      )}
    </span>
  );
}

function TrashIcon({ className }: { className?: string }) {
  // Inline SVG popelnice — žádný extra dep, snadno barvitelný přes
  // currentColor (text-* tailwind classy).
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6l-1.5 13.5a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8L5 6" />
      <path d="M9 6V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function InvoiceCell({
  rsvp,
  wsSlug,
  eventSlug,
}: {
  rsvp: RSVPRecord;
  wsSlug: string;
  eventSlug: string;
}) {
  if (!rsvp.invoice_id) {
    return <span className="text-ink-300">—</span>;
  }
  return (
    <Link
      href={`/admin/eventy/${wsSlug}/${eventSlug}/edit/faktury/${rsvp.invoice_id}`}
      className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-success/15 text-success hover:bg-success/25"
    >
      Vystaveno →
    </Link>
  );
}

function DocCell({
  docKey: _docKey,
  required,
  uploaded,
  verified,
}: {
  docKey: string;
  required: boolean;
  uploaded: boolean;
  verified: boolean;
}) {
  if (!required) {
    return <span className="text-ink-300">—</span>;
  }
  if (verified) {
    return (
      <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-success/15 text-success">
        Ověřeno
      </span>
    );
  }
  if (uploaded) {
    return (
      <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-success/10 text-success">
        Doloženo
      </span>
    );
  }
  return (
    <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-warning/15 text-warning">
      Chybí
    </span>
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

function RsvpCard({
  rsvp,
  wsSlug,
  eventSlug,
  onUpdate,
  onRemove,
  onOpenProfile,
}: {
  rsvp: RSVPRecord;
  wsSlug: string;
  eventSlug: string;
  onUpdate: (updated: RSVPRecord) => void;
  onRemove: (removedId: number) => void;
  onOpenProfile: () => void;
}) {
  const [busy, setBusy] = useState<
    "paid" | "approve" | "reject" | "remove" | null
  >(null);
  const confirmDialog = useConfirm();

  async function handleApprove() {
    setBusy("approve");
    try {
      const updated = await events.approveRsvp(wsSlug, eventSlug, rsvp.id);
      onUpdate(updated);
    } catch {
      /* keep quiet */
    } finally {
      setBusy(null);
    }
  }
  async function handleReject() {
    if (!confirm("Zamítnout tuto registraci?")) return;
    setBusy("reject");
    try {
      const updated = await events.rejectRsvp(wsSlug, eventSlug, rsvp.id);
      onUpdate(updated);
    } catch {
      /* keep quiet */
    } finally {
      setBusy(null);
    }
  }
  async function handleMarkPaid() {
    if (!confirm("Označit jako zaplaceno?")) return;
    setBusy("paid");
    try {
      const updated = await events.markRsvpPaid(wsSlug, eventSlug, rsvp.id);
      onUpdate(updated);
    } catch {
      /* keep quiet */
    } finally {
      setBusy(null);
    }
  }
  async function handleRemove() {
    const who = rsvp.user_full_name || rsvp.user_email;
    const ok = await confirmDialog({
      title: `Odebrat ${who} z akce?`,
      description:
        'Účastníka i případnou roli organizátora smažeme. Pokud se znovu přihlásí, půjde jako úplně nová registrace. Historie zůstane v auditu.',
      confirmLabel: "Odebrat",
      variant: "danger",
    });
    if (!ok) return;
    setBusy("remove");
    try {
      await events.removeRsvp(wsSlug, eventSlug, rsvp.id);
      onRemove(rsvp.id);
    } catch {
      /* keep quiet */
    } finally {
      setBusy(null);
    }
  }

  async function handleDismissDuplicate() {
    try {
      const updated = await events.dismissDuplicateHint(
        wsSlug,
        eventSlug,
        rsvp.id,
      );
      onUpdate(updated);
    } catch {
      /* keep quiet */
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex flex-col items-start gap-0.5 text-left focus-ring"
          >
          <span className="text-sm font-semibold text-ink-900">
            {rsvp.user_full_name || "—"}
          </span>
          <span className="text-xs text-ink-500">{rsvp.user_email}</span>
          {rsvp.user_phone && (
            <span className="text-xs text-ink-500">{rsvp.user_phone}</span>
          )}
          </button>
          {rsvp.duplicate_hints && rsvp.duplicate_hints.length > 0 && (
            <DuplicateBadge
              hints={rsvp.duplicate_hints}
              onDismiss={handleDismissDuplicate}
            />
          )}
        </div>
        {rsvp.is_organizer ? (
          <span className="inline-flex shrink-0 rounded bg-brand/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
            Organizátor
          </span>
        ) : (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={[
                "inline-flex rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                RSVP_STATUS_TONE[rsvp.status],
              ].join(" ")}
            >
              {RSVP_STATUS_LABEL[rsvp.status]}
              {rsvp.waitlist_position != null && (
                <span className="ml-1 opacity-80">#{rsvp.waitlist_position}</span>
              )}
            </span>
            {rsvp.status === "cancelled" && rsvp.cancellation_reason !== "" && (
              <span className="text-[10px] text-ink-500">
                {CANCELLATION_REASON_LABEL[rsvp.cancellation_reason]}
              </span>
            )}
          </div>
        )}
      </div>

      {rsvp.status === "pending_approval" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy !== null}
            className="flex-1 rounded-md bg-success px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 focus-ring"
          >
            {busy === "approve" ? "..." : "Schválit"}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={busy !== null}
            className="flex-1 rounded-md border border-danger/40 bg-surface px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50 focus-ring"
          >
            {busy === "reject" ? "..." : "Zamítnout"}
          </button>
        </div>
      )}

      {rsvp.payment_status !== "waived" && rsvp.status !== "cancelled" && (
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-ink-500">Platba</span>
          {rsvp.payment_status === "paid" ? (
            <span className="inline-flex rounded bg-success/15 px-2 py-0.5 font-medium text-success">
              Zaplaceno
            </span>
          ) : (
            <button
              type="button"
              onClick={handleMarkPaid}
              disabled={busy !== null}
              className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
            >
              {busy === "paid" ? "..." : "Označit zaplaceno"}
            </button>
          )}
        </div>
      )}
      {rsvp.can_be_removed && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy !== null}
          title="Odebrat z akce"
          aria-label="Odebrat z akce"
          className="inline-flex h-8 w-8 items-center justify-center self-end rounded-md text-ink-400 hover:bg-danger-soft hover:text-danger disabled:opacity-50 focus-ring"
        >
          {busy === "remove" ? (
            <span className="text-xs">…</span>
          ) : (
            <TrashIcon className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
