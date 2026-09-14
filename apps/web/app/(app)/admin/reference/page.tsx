"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";

import { Alert } from "@/components/ui/card";
import { ApiError, type EventFeedback, auth, events } from "@/lib/api";

type FilterState = {
  publicOnly: boolean;
  minRating: number;
  query: string;
};

/**
 * Reference — přehled všech zpětných vazeb napříč akcemi. Owner tady
 * jedním pohledem vidí, které kartičky jsou zveřejněné na landing
 * stránkách akcí (`is_public=True`) a rychle toggluje. Klik na řádek
 * navádí zpět na cockpit té akce.
 */
export default function ReferencesPage() {
  const [rows, setRows] = useState<EventFeedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>({
    publicOnly: false,
    minRating: 1,
    query: "",
  });
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await auth.allReferences();
        if (cancelled) return;
        setRows(list);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = filter.query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter.publicOnly && !r.is_public) return false;
      if (r.rating < filter.minRating) return false;
      if (q) {
        const hay = `${r.name} ${r.event_title} ${r.went_well}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter]);

  async function togglePublish(row: EventFeedback) {
    if (busyIds.has(row.id)) return;
    setBusyIds((prev) => new Set(prev).add(row.id));
    const previous = row;
    const optimistic = { ...row, is_public: !row.is_public };
    setRows((prev) =>
      prev ? prev.map((x) => (x.id === row.id ? optimistic : x)) : prev,
    );
    try {
      const updated = await events.publishFeedback(
        row.workspace_slug,
        row.event_slug,
        row.id,
        optimistic.is_public,
      );
      setRows((prev) =>
        prev ? prev.map((x) => (x.id === row.id ? updated : x)) : prev,
      );
    } catch (err) {
      setRows((prev) =>
        prev ? prev.map((x) => (x.id === row.id ? previous : x)) : prev,
      );
      setError(err instanceof ApiError ? err.message : "Publikace selhala.");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (rows === null) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  const publicCount = rows.filter((r) => r.is_public).length;
  const avgRating =
    rows.length > 0
      ? rows.reduce((s, r) => s + r.rating, 0) / rows.length
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-brand">Reference</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          Zpětné vazby napříč akcemi
        </h1>
        <p className="text-sm text-ink-500">
          {rows.length === 0
            ? "Zatím nikdo neposlal žádnou zpětnou vazbu."
            : (
                <>
                  {rows.length} odpově
                  {rows.length === 1
                    ? "ď"
                    : rows.length < 5
                      ? "di"
                      : "dí"}
                  {avgRating !== null && (
                    <>
                      {" "}
                      · průměr{" "}
                      <strong className="text-ink-900">
                        {avgRating.toFixed(1)}
                      </strong>
                      /5
                    </>
                  )}
                  {" · "}
                  <strong className="text-ink-900">{publicCount}</strong>{" "}
                  zveřejněno
                </>
              )}
        </p>
      </header>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3 text-sm">
          <input
            type="search"
            placeholder="Hledat v textu / jménu / názvu akce…"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            className="flex-1 min-w-[220px] rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-ring"
          />
          <label className="flex items-center gap-2">
            <span className="text-ink-500">Min hodnocení:</span>
            <select
              value={filter.minRating}
              onChange={(e) =>
                setFilter({ ...filter, minRating: Number(e.target.value) })
              }
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}★
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filter.publicOnly}
              onChange={(e) =>
                setFilter({ ...filter, publicOnly: e.target.checked })
              }
              className="size-4 accent-brand"
            />
            <span>Jen zveřejněné</span>
          </label>
        </div>
      )}

      {filtered && filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
          {rows.length === 0
            ? "Rozešli žádost o zpětnou vazbu z cockpitu akce a odpovědi se objeví tady."
            : "Filtr nic nevrací. Zkus je uvolnit."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered?.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-semibold text-ink-900 tabular-nums">
                    {r.rating}
                    <span className="text-sm text-ink-500">/5</span>
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-ink-900">
                      {r.name || r.email}
                    </span>
                    <Link
                      href={`/admin/eventy/${r.workspace_slug}/${r.event_slug}/zpetne-vazby`}
                      className="text-xs text-ink-500 hover:text-ink-900"
                    >
                      {r.event_title} →
                    </Link>
                  </div>
                </div>
                <span className="text-xs text-ink-500">
                  {new Date(r.updated_at).toLocaleDateString("cs-CZ", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              {r.went_well && (
                <div className="rounded-md bg-surface-muted/50 px-3 py-2 text-sm text-ink-700">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                    Co se povedlo
                  </p>
                  <p className="mt-1 whitespace-pre-line">{r.went_well}</p>
                </div>
              )}
              {r.could_improve && (
                <div className="rounded-md bg-surface-muted/30 px-3 py-2 text-sm text-ink-600">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                    Co příště jinak (soukromé)
                  </p>
                  <p className="mt-1 whitespace-pre-line">{r.could_improve}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={r.is_public}
                    onChange={() => togglePublish(r)}
                    disabled={busyIds.has(r.id)}
                    className="size-4 accent-brand"
                  />
                  <span>
                    Zveřejnit jako referenci
                    {r.consented_to_publish ? (
                      <span className="ml-2 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
                        se souhlasem
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">
                        anonymizované jméno
                      </span>
                    )}
                  </span>
                </label>
                {r.is_public && (
                  <span className="text-xs text-ink-500">
                    Zobrazí se jako{" "}
                    <strong className="text-ink-700">
                      „{r.public_display_name}"
                    </strong>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
