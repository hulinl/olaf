"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type AuditEntry,
  type Workspace,
  audit,
  workspaces,
} from "@/lib/api";

const ACTION_LABELS: Record<string, string> = {
  "event.soft_delete": "Smazání akce",
  "event.restore": "Obnovení akce",
  "event.purge": "Trvalé smazání",
  "event.cancel": "Zrušení akce",
  "event.update": "Úprava akce",
  "rsvp.approve": "Schválení přihlášky",
  "rsvp.reject": "Zamítnutí přihlášky",
  "workspace_member.role_change": "Změna role člena",
};

const PAGE_SIZE = 50;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditPage() {
  const router = useRouter();
  const [mine, setMine] = useState<Workspace[] | null>(null);
  const [wsSlug, setWsSlug] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap: load workspaces the user manages, default to the first
  // owner/admin one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await workspaces.mine();
        if (cancelled) return;
        const managed = all.filter(
          (w) => w.my_role === "owner" || w.my_role === "admin",
        );
        setMine(managed);
        if (managed.length > 0 && !wsSlug) {
          setWsSlug(managed[0].slug);
        } else if (managed.length === 0) {
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/audit");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Načtení workspaců selhalo.",
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!wsSlug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await audit.list({
          workspace: wsSlug,
          action: actionFilter || undefined,
          page,
          page_size: PAGE_SIZE,
        });
        if (cancelled) return;
        setRows(data.results);
        setTotal(data.total);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Načtení selhalo.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wsSlug, actionFilter, page]);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  const actionOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.action));
    return Object.entries(ACTION_LABELS).filter(([k]) => present.has(k));
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Tvůrce</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Aktivita
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Co se ve workspace stalo — kdo upravil akci, kdo schválil
          přihlášku, kdo poslal něco do koše. Append-only, nikdo to
          nemůže přepsat.
        </p>
      </header>

      {mine && mine.length === 0 && (
        <Alert variant="info">
          Nespravuješ žádný workspace. Aktivita je viditelná jen
          ownerům + adminům.
        </Alert>
      )}

      {mine && mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-500">Workspace:</span>
            <select
              value={wsSlug}
              onChange={(e) => {
                setWsSlug(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-ring"
            >
              {mine.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-500">Typ akce:</span>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-ring"
            >
              <option value="">Vše</option>
              {Object.entries(ACTION_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {actionFilter && actionOptions.length === 0 && (
            <span className="text-xs text-ink-500">
              Žádné záznamy s tímto filtrem.
            </span>
          )}
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {loading && (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {!loading && !error && rows.length === 0 && wsSlug && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            Žádná aktivita
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Aktivita se začne plnit od chvíle, kdy někdo něco udělá v
            tomto workspace.{" "}
            <Link
              href="/admin/eventy"
              className="text-brand hover:underline focus-ring"
            >
              Otevři akce
            </Link>
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink-900">
                    {row.actor ? row.actor.full_name : "Systém"}
                  </span>
                  <span className="font-mono text-xs text-ink-500">
                    {formatDateTime(row.created_at)}
                  </span>
                </div>
                <p className="text-sm text-ink-700">{row.summary}</p>
                <div className="flex flex-wrap gap-2 text-xs text-ink-500">
                  <span className="rounded bg-surface-muted px-2 py-0.5 font-mono">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </span>
                  {row.target_type && (
                    <span className="rounded bg-surface-muted px-2 py-0.5 font-mono">
                      {row.target_type} #{row.target_id}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 text-sm text-ink-700">
              <span>
                Strana {page} z {pageCount} ({total} záznamů)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-50 focus-ring"
                >
                  ← Předchozí
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-50 focus-ring"
                >
                  Další →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
