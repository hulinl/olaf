"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PersonProfileDialog } from "@/components/person-profile-dialog";
import { Alert } from "@/components/ui/card";
import { ApiError, type PersonSummary, events } from "@/lib/api";

/**
 * Lidé — proto-CRM list of everyone who's had an RSVP on any event
 * the caller owns. Deduped across events; one row per person with
 * aggregate counts. Click a row → open profile dialog with full
 * contact details + event history.
 */
export default function LidePage() {
  const router = useRouter();
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openUserId, setOpenUserId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    events
      .people()
      .then((p) => {
        if (!cancelled) setPeople(p);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/lide");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Tvůrce</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Lidé
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Každý, kdo se zaregistroval na některou z tvých akcí. Klikni na
          jméno pro detail — kontakty, adresa, nouzový kontakt a historie
          registrací.
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      {people === null && !error && (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {people && people.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            Zatím tu nikdo není
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Jakmile se na některou z tvých akcí někdo zaregistruje, objeví
            se tady.
          </p>
        </div>
      )}

      {people && people.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-2 sm:hidden">
            {people.map((p) => (
              <button
                key={p.user_id}
                type="button"
                onClick={() => setOpenUserId(p.user_id)}
                className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 text-left shadow-sm transition-colors hover:border-brand hover:bg-brand/5 focus-ring"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-ink-900">
                    {p.full_name}
                  </span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-700">
                    {p.event_count} {plurAkce(p.event_count)}
                  </span>
                </div>
                <span className="text-xs text-ink-500">{p.email}</span>
                {p.phone && (
                  <span className="text-xs text-ink-500">{p.phone}</span>
                )}
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Jméno</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Telefon</th>
                  <th className="px-4 py-3 text-right">Akcí</th>
                  <th className="px-4 py-3">Poslední registrace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.map((p) => (
                  <tr
                    key={p.user_id}
                    onClick={() => setOpenUserId(p.user_id)}
                    className="cursor-pointer hover:bg-brand/10"
                  >
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {p.full_name}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{p.email}</td>
                    <td className="px-4 py-3 text-ink-700">
                      {p.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink-900">
                      {p.event_count}
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {p.last_rsvp_at
                        ? new Date(p.last_rsvp_at).toLocaleDateString(
                            "cs-CZ",
                            { day: "numeric", month: "short", year: "numeric" },
                          )
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PersonProfileDialog
        userId={openUserId}
        onClose={() => setOpenUserId(null)}
      />
    </div>
  );
}

function plurAkce(n: number): string {
  if (n === 1) return "akce";
  if (n < 5) return "akce";
  return "akcí";
}
