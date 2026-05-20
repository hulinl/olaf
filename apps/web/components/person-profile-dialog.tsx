"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, type PersonDetail, events } from "@/lib/api";

interface Props {
  userId: number | null;
  onClose: () => void;
}

const RSVP_LABEL: Record<string, string> = {
  yes: "Potvrzeno",
  maybe: "Možná",
  no: "Odmítl",
  waitlist: "Waitlist",
  pending_approval: "Čeká na schválení",
  cancelled: "Zrušeno",
};

const RSVP_TONE: Record<string, string> = {
  yes: "bg-success/15 text-success",
  waitlist: "bg-warning/15 text-warning",
  pending_approval: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  maybe: "bg-surface-muted text-ink-500",
  no: "bg-surface-muted text-ink-500",
};

/**
 * Lidé detail — extends the participant-profile shape with an event
 * history list (every RSVP this person has on creator's events).
 */
export function PersonProfileDialog({ userId, onClose }: Props) {
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId == null) {
      setPerson(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    events
      .person(userId)
      .then((p) => {
        if (!cancelled) setPerson(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (userId == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId, onClose]);

  if (userId == null) return null;

  const addr = person?.address;
  const addrLine = addr
    ? [addr.street, [addr.zip, addr.city].filter(Boolean).join(" "), addr.country]
        .filter(Boolean)
        .join(", ")
    : "";
  const ec = person?.emergency_contact;
  const hasEc = ec && (ec.name || ec.phone);
  const hasAddr = addrLine || addr?.legacy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profil osoby"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Detail osoby
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="text-ink-500 hover:text-ink-900"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex justify-center py-6">
              <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
            </div>
          )}
          {error && (
            <p className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          {person && !loading && (
            <div className="flex flex-col gap-5">
              <header>
                <h2 className="text-xl font-semibold text-ink-900">
                  {person.full_name}
                </h2>
                <p className="mt-1 text-sm text-ink-500">{person.email}</p>
              </header>

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Kontakt
                </p>
                <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-ink-500">Telefon</dt>
                  <dd className="text-ink-900">
                    {person.phone ? (
                      <a
                        href={`tel:${person.phone}`}
                        className="text-brand hover:underline"
                      >
                        {person.phone}
                      </a>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </dd>
                  <dt className="text-ink-500">E-mail</dt>
                  <dd className="text-ink-900">
                    <a
                      href={`mailto:${person.email}`}
                      className="text-brand hover:underline"
                    >
                      {person.email}
                    </a>
                  </dd>
                </dl>
              </section>

              {hasAddr && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                    Adresa
                  </p>
                  <p className="mt-2 text-sm text-ink-900">
                    {addrLine || addr?.legacy}
                  </p>
                </section>
              )}

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Nouzový kontakt
                </p>
                {hasEc ? (
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-ink-500">Jméno</dt>
                    <dd className="text-ink-900">{ec.name || "—"}</dd>
                    <dt className="text-ink-500">Telefon</dt>
                    <dd className="text-ink-900">
                      {ec.phone ? (
                        <a
                          href={`tel:${ec.phone}`}
                          className="text-brand hover:underline"
                        >
                          {ec.phone}
                        </a>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </dd>
                    {ec.relationship && (
                      <>
                        <dt className="text-ink-500">Vztah</dt>
                        <dd className="text-ink-900">{ec.relationship}</dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-ink-500">
                    Účastník nemá vyplněný nouzový kontakt.
                  </p>
                )}
              </section>

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Historie registrací ({person.events.length})
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {person.events.map((e) => (
                    <li
                      key={`${e.workspace_slug}/${e.event_slug}-${e.rsvp_created_at}`}
                    >
                      <Link
                        href={`/admin/eventy/${e.workspace_slug}/${e.event_slug}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-muted focus-ring"
                        onClick={onClose}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-ink-900">
                            {e.event_title}
                          </span>
                          <span className="text-xs text-ink-500">
                            {new Date(e.event_starts_at).toLocaleDateString(
                              "cs-CZ",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                        </div>
                        <span
                          className={[
                            "inline-flex shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            RSVP_TONE[e.rsvp_status] ??
                              "bg-surface-muted text-ink-500",
                          ].join(" ")}
                        >
                          {RSVP_LABEL[e.rsvp_status] ?? e.rsvp_status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
