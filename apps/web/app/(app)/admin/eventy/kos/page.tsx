"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ApiError, type EventSummary, events } from "@/lib/api";

const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(deletedAt: string): number {
  const deletedTs = new Date(deletedAt).getTime();
  const expiryTs = deletedTs + RETENTION_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((expiryTs - Date.now()) / DAY_MS));
}

function plural(n: number): string {
  if (n === 1) return "den";
  if (n >= 2 && n <= 4) return "dny";
  return "dní";
}

export default function EventTrashPage() {
  const router = useRouter();
  const [rows, setRows] = useState<EventSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  async function load() {
    try {
      setError(null);
      const data = await events.trashList();
      setRows(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login?next=/admin/eventy/kos");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRestore(e: EventSummary) {
    const key = `restore:${e.workspace_slug}/${e.slug}`;
    setBusy(key);
    try {
      await events.restore(e.workspace_slug, e.slug);
      setRows((current) => current?.filter((r) => r.slug !== e.slug) ?? null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Obnovení selhalo.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handlePurge(e: EventSummary) {
    const ok = await confirmDialog({
      title: `Smazat „${e.title}" nadobro?`,
      description:
        "Akce zmizí včetně všech registrací, smluv, plateb a nahraných dokumentů. Po purge už ji nelze obnovit.",
      confirmLabel: "Smazat nadobro",
      variant: "danger",
    });
    if (!ok) return;
    const key = `purge:${e.workspace_slug}/${e.slug}`;
    setBusy(key);
    try {
      await events.purge(e.workspace_slug, e.slug);
      setRows((current) => current?.filter((r) => r.slug !== e.slug) ?? null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Smazání selhalo.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Tvůrce</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Koš
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Smazané akce čekají {RETENTION_DAYS} dní, než se odstraní napořád.
          Můžeš je vrátit, nebo smazat hned.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/admin/eventy"
            className="text-brand hover:underline focus-ring"
          >
            ← Zpět na moje akce
          </Link>
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading && (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {!loading && rows && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            Koš je prázdný
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Žádné smazané akce — všechno, co máš v přehledu, je aktivní.
          </p>
        </div>
      )}

      {!loading && rows && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((e) => {
            const left = e.deleted_at ? daysLeft(e.deleted_at) : 0;
            const restoreKey = `restore:${e.workspace_slug}/${e.slug}`;
            const purgeKey = `purge:${e.workspace_slug}/${e.slug}`;
            return (
              <li
                key={`${e.workspace_slug}/${e.slug}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink-900">{e.title}</span>
                  <span className="text-xs text-ink-500">
                    {e.location_text || "—"} ·{" "}
                    {left > 0
                      ? `smaže se za ${left} ${plural(left)}`
                      : "smaže se dnes"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRestore(e)}
                    disabled={busy === restoreKey}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-surface-muted disabled:opacity-50 focus-ring"
                  >
                    {busy === restoreKey ? "Vracím…" : "Vrátit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePurge(e)}
                    disabled={busy === purgeKey}
                    className="rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-soft/60 disabled:opacity-50 focus-ring"
                  >
                    {busy === purgeKey ? "Mažu…" : "Smazat napořád"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
