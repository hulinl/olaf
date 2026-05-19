"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { DiscussionWall } from "@/components/discussion-wall";
import { PaymentInstructionsPanel } from "@/components/payment-instructions-panel";
import { RequiredDocsPanel } from "@/components/required-docs-panel";
import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { useUser } from "@/lib/user-context";
import {
  ApiError,
  type Event as OlafEvent,
  type Invoice,
  assetUrl,
  events,
  formatEventPrice,
} from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

const RSVP_STATUS_LABEL: Record<string, string> = {
  yes: "Potvrzeno",
  maybe: "Možná",
  no: "Odmítl",
  waitlist: "Na waitlistu",
  pending_approval: "Čeká na schválení",
  cancelled: "Zrušeno",
};

const RSVP_STATUS_TONE: Record<string, string> = {
  yes: "bg-success/15 text-success",
  waitlist: "bg-warning/15 text-warning",
  pending_approval: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  maybe: "bg-surface-muted text-ink-500",
  no: "bg-surface-muted text-ink-500",
};

/**
 * Participant's "moje účast" page for a single event.
 *
 * This is the canonical place for everything the participant cares
 * about: status, payment instructions (QR), required documents
 * (upload), and the issued invoice (if any). The public landing
 * (/[ws]/e/[event]) stays presentation-only.
 *
 * Loads everything in parallel; each panel self-handles its empty
 * state, so the page renders cleanly whether the event is free, has
 * no required docs, or hasn't been paid yet.
 */
export default function MyEventPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const user = useUser();
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ev = await events.publicEvent(wsSlug, eventSlug);
        if (cancelled) return;
        setEvent(ev);
        // Invoice is optional — 404 = no invoice yet, that's fine.
        try {
          const inv = await events.myInvoice(wsSlug, eventSlug);
          if (!cancelled) setInvoice(inv);
        } catch {
          // ignore
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/events/${wsSlug}/${eventSlug}`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/events");
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
  }, [wsSlug, eventSlug, router]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }
  if (error) {
    return (
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-4 py-10">
          <Alert variant="danger">{error}</Alert>
        </section>
      </main>
    );
  }
  if (!event) return null;

  const my = event.my_rsvp;
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
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:py-12">
        <Link
          href="/events"
          className="text-sm text-ink-500 hover:text-ink-900"
        >
          ← Zpět na moje akce
        </Link>

        <header>
          <p className="text-sm font-medium text-brand">Moje účast</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {dateLabel}
            {event.location_text && ` · ${event.location_text}`} ·{" "}
            <Link
              href={`/${wsSlug}/e/${eventSlug}`}
              className="underline hover:text-ink-900"
            >
              Otevřít stránku akce ↗
            </Link>
          </p>
        </header>

        {/* RSVP status summary — header pill on the right mirrors every
            other section's status placement. Price lives on the invoice
            / payment panel below, no need to duplicate it here. */}
        {my && (
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-ink-900">
                Status registrace
              </h3>
              <div className="flex items-center gap-2">
                {my.waitlist_position != null && (
                  <span className="text-xs text-ink-500">
                    pořadí #{my.waitlist_position}
                  </span>
                )}
                <span
                  className={[
                    "inline-flex rounded-full px-3 py-0.5 text-xs font-semibold",
                    RSVP_STATUS_TONE[my.status] ??
                      "bg-surface-muted text-ink-500",
                  ].join(" ")}
                >
                  {RSVP_STATUS_LABEL[my.status] ?? my.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {!my && (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
            Na tuto akci nejsi přihlášen/á.{" "}
            <Link
              href={`/${wsSlug}/e/${eventSlug}/rsvp`}
              className="font-medium text-brand underline"
            >
              Přihlásit se →
            </Link>
          </div>
        )}

        <PaymentInstructionsPanel
          workspaceSlug={wsSlug}
          eventSlug={eventSlug}
        />

        <RequiredDocsPanel workspaceSlug={wsSlug} eventSlug={eventSlug} />

        {invoice && (
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink-900">
                  Faktura
                </h3>
                <p className="mt-1 text-sm text-ink-500">
                  {invoice.number} · vystavena{" "}
                  {new Date(invoice.issued_at).toLocaleDateString("cs-CZ", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-success/20 px-3 py-0.5 text-xs font-semibold text-success">
                {invoice.status === "paid" ? "Zaplaceno" : invoice.status}
              </span>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-500">Částka</dt>
                <dd className="font-semibold text-ink-900">
                  {formatEventPrice(invoice.total, invoice.currency)}
                </dd>
                <dt className="text-ink-500">Variabilní symbol</dt>
                <dd className="font-mono text-ink-900">
                  {invoice.variable_symbol || "—"}
                </dd>
                <dt className="text-ink-500">Dodavatel</dt>
                <dd className="text-ink-700">{invoice.supplier_name}</dd>
                <dt className="text-ink-500">Odběratel</dt>
                <dd className="text-ink-700">{invoice.customer_name}</dd>
              </dl>
              {invoice.has_qr && (
                <div className="flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetUrl(
                      `/api/events/${wsSlug}/${eventSlug}/invoices/${invoice.id}/qr.png`,
                    )}
                    alt="QR Platba"
                    width={160}
                    height={160}
                    className="rounded-md border border-border bg-white p-2"
                  />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-ink-500">
                    QR Platba
                  </span>
                </div>
              )}
            </div>
            <div className="mt-4">
              <a
                href={assetUrl(
                  `/api/events/${wsSlug}/${eventSlug}/invoices/${invoice.id}/pdf/`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted focus-ring"
              >
                Stáhnout PDF ↓
              </a>
            </div>
          </section>
        )}

        {/* Cancel registration */}
        {my &&
          my.status !== "cancelled" &&
          event.status !== "cancelled" && (
            <div className="rounded-md border border-danger/30 bg-danger-soft/30 p-4 text-sm text-ink-700">
              <p>
                Chceš svojí registraci zrušit? Klik níže ji okamžitě zruší
                a uvolní místo dalšímu zájemci.
              </p>
              <CancelRsvpButton wsSlug={wsSlug} eventSlug={eventSlug} />
            </div>
          )}

        {/* Nástěnka — visible to anyone with an active RSVP (or owner).
            Backend filters topics + comments to the event scope so other
            events' threads stay separate. */}
        {my && my.status !== "cancelled" && (
          <DiscussionWall
            scope={{
              kind: "event",
              workspaceSlug: wsSlug,
              eventSlug,
              isModerator: false,
            }}
            currentUserId={user.id}
          />
        )}
      </section>
    </main>
  );
}

function CancelRsvpButton({
  wsSlug,
  eventSlug,
}: {
  wsSlug: string;
  eventSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (!confirm("Opravdu chceš svojí registraci zrušit?")) return;
    setBusy(true);
    try {
      await events.cancelMyRsvp(wsSlug, eventSlug);
      router.refresh();
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="mt-3 inline-flex items-center rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
    >
      {busy ? "Ruším…" : "Zrušit registraci"}
    </button>
  );
}
