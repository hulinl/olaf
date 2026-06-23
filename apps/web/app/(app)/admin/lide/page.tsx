"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PersonProfileDialog } from "@/components/person-profile-dialog";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  type HiddenPersonSummary,
  type PersonSummary,
  events,
} from "@/lib/api";

/**
 * Lidé — proto-CRM list of everyone who's had an RSVP on any event
 * the caller owns. Deduped across events; one row per person with
 * aggregate counts. Click a row → open profile dialog with full
 * contact details + event history.
 */
export default function LidePage() {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [hidden, setHidden] = useState<HiddenPersonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openUserId, setOpenUserId] = useState<number | null>(null);
  const [restoreBusy, setRestoreBusy] = useState<number | null>(null);
  const [purgeBusy, setPurgeBusy] = useState<number | null>(null);

  async function refreshPeople() {
    const list = await events.people().catch(() => null);
    if (list) setPeople(list);
  }
  async function refreshHidden() {
    const list = await events.hiddenPeople().catch(() => null);
    if (list) setHidden(list);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      events.people(),
      events.hiddenPeople().catch(() => [] as HiddenPersonSummary[]),
    ])
      .then(([p, h]) => {
        if (cancelled) return;
        setPeople(p);
        setHidden(h);
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

  async function handleRestore(userId: number) {
    setRestoreBusy(userId);
    try {
      await events.unhidePerson(userId);
      await Promise.all([refreshPeople(), refreshHidden()]);
    } catch {
      // keep silent
    } finally {
      setRestoreBusy(null);
    }
  }

  async function handlePurge(userId: number, fullName: string) {
    const ok = await confirmDialog({
      title: `Trvale odstranit ${fullName}?`,
      description:
        "Zruší jejich RSVPs na tvých akcích, smaže tvoje poznámky a tagy o této osobě a odebere je z tvých komunit (kromě adminů).\n\n" +
        "Účet osoby v Olafu zůstává nedotčený. Tuto akci NEJDE vrátit.",
      confirmLabel: "Trvale odstranit",
      variant: "danger",
    });
    if (!ok) return;
    setPurgeBusy(userId);
    try {
      await events.purgePerson(userId);
      await refreshHidden();
    } catch {
      // keep silent
    } finally {
      setPurgeBusy(null);
    }
  }

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

      {hidden && hidden.length > 0 && (
        <section>
          <details className="group">
            <summary className="cursor-pointer list-none">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink-900">
                <span className="transition-transform group-open:rotate-90">
                  ▸
                </span>
                Skrytí lidé ({hidden.length})
              </span>
            </summary>
            <p className="mt-2 max-w-2xl text-sm text-ink-500">
              Lidé, které jsi skryl z přehledu. Jejich účet v Olafu
              zůstává nedotčený — pouze ti je neukazujeme v hlavním
              seznamu. „Vrátit" je tam dá zpět.
            </p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted/60">
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-3">Jméno</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3 text-right">Akce</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hidden.map((h) => {
                    const restoring = restoreBusy === h.user_id;
                    const purging = purgeBusy === h.user_id;
                    const anyBusy = restoring || purging;
                    return (
                      <tr key={h.user_id}>
                        <td className="px-4 py-3 font-medium text-ink-900">
                          {h.full_name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                          {h.email}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRestore(h.user_id)}
                              disabled={anyBusy}
                              title="Vrátit do hlavního seznamu"
                              aria-label="Vrátit"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-brand hover:bg-brand/10 focus-ring disabled:opacity-50"
                            >
                              <span aria-hidden>↺</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handlePurge(h.user_id, h.full_name)
                              }
                              disabled={anyBusy}
                              title="Trvale odstranit (zruší RSVPs, smaže poznámky)"
                              aria-label="Trvale odstranit"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-900 hover:bg-danger-soft hover:text-danger focus-ring disabled:opacity-50"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      <PersonProfileDialog
        userId={openUserId}
        onClose={() => setOpenUserId(null)}
        onHidden={async (userId) => {
          // Optimistic UI — okamžitě odstraň řádek z hlavní tabulky;
          // refetch obou seznamů ho překlopí do "Skrytí lidé".
          setPeople((prev) =>
            prev ? prev.filter((p) => p.user_id !== userId) : prev,
          );
          await refreshHidden();
        }}
      />
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6 17 20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function plurAkce(n: number): string {
  if (n === 1) return "akce";
  if (n < 5) return "akce";
  return "akcí";
}
