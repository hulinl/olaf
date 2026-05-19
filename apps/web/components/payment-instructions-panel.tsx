"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  type RSVPPaymentInstructions,
  events,
  formatEventPrice,
} from "@/lib/api";

interface Props {
  workspaceSlug: string;
  eventSlug: string;
  /** Compact = no big card chrome, used inside the success view. */
  compact?: boolean;
}

/**
 * Renders QR Platba + IBAN + variable symbol for the current user's RSVP.
 * Self-contained client island — fetches the data on mount and silently
 * renders nothing if:
 *  - the user is anonymous (401),
 *  - they don't have an RSVP for this event (404),
 *  - or the event is free (400).
 *
 * When the payment has been reconciled (status="paid"), shows a Zaplaceno
 * badge instead of the QR.
 */
export function PaymentInstructionsPanel({
  workspaceSlug,
  eventSlug,
  compact = false,
}: Props) {
  const [data, setData] = useState<RSVPPaymentInstructions | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    events
      .paymentInstructions(workspaceSlug, eventSlug)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        // 401/404/400 → just stay hidden; not an error worth surfacing.
        if (err instanceof ApiError) {
          setHidden(true);
        } else {
          setHidden(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, eventSlug]);

  if (hidden || !data) return null;

  const paid = data.status === "paid";

  return (
    <section
      className={[
        "rounded-2xl border bg-surface",
        compact ? "p-5" : "p-6 shadow-sm",
        paid ? "border-success/30 bg-success/5" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-900">
          {paid ? "Platba přijata" : "Pokyny k platbě"}
        </h3>
        {paid ? (
          <span className="rounded-full bg-success/20 px-3 py-0.5 text-xs font-semibold text-success">
            Zaplaceno
          </span>
        ) : (
          <span className="rounded-full bg-warning/15 px-3 py-0.5 text-xs font-semibold text-warning">
            Čeká na platbu
          </span>
        )}
      </div>

      {paid ? (
        <p className="mt-3 text-sm text-ink-700">
          Děkujeme — registrace je plně potvrzená.
        </p>
      ) : !data.iban ? (
        <p className="mt-3 text-sm text-ink-500">
          Organizátor ještě nezadal platební údaje. Kontaktuj ho prosím
          přímo.
        </p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-500">Částka</dt>
            <dd className="font-semibold text-ink-900">
              {formatEventPrice(data.amount, data.currency)}
            </dd>
            <dt className="text-ink-500">Účet (IBAN)</dt>
            <dd className="font-mono text-ink-900">{data.iban}</dd>
            {data.bank_name && (
              <>
                <dt className="text-ink-500">Banka</dt>
                <dd className="text-ink-900">{data.bank_name}</dd>
              </>
            )}
            <dt className="text-ink-500">Variabilní symbol</dt>
            <dd className="font-mono text-ink-900">{data.variable_symbol}</dd>
            <dt className="text-ink-500">Zpráva</dt>
            <dd className="text-ink-700">{data.message}</dd>
            <dt className="text-ink-500">Splatnost</dt>
            <dd className="text-ink-700">{data.due_days} dní od registrace</dd>
          </dl>
          {data.qr_png_url && (
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.qr_png_url}
                alt="QR Platba"
                width={200}
                height={200}
                className="rounded-md border border-border bg-white p-2"
              />
              <span className="text-[10px] uppercase tracking-[0.16em] text-ink-500">
                QR Platba
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
