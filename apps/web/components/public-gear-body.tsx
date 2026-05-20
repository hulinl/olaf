"use client";

import { useState } from "react";

import { assetUrl, type PublicGearList } from "@/lib/api";

interface Props {
  list: PublicGearList;
}

/**
 * Client component that owns the dashboard chart + items table on the
 * public /gear/<slug> page. Lives separately from the page shell so
 * the SSR'd shell can render OG metadata + headings without dragging
 * the whole React tree client-side; only the interactive bottom half
 * hydrates.
 *
 * UX:
 * - Chart category labels are buttons. Clicking applies a single-
 *   category filter to the items table below.
 * - Items render as a 4-column table matching the owner's catalog
 *   (Položka / Kategorie / Váha / Odkaz). Mobile collapses Kategorie
 *   + Odkaz columns; category appears under the name instead.
 * - A standalone category filter dropdown sits above the table so the
 *   visitor can pick any category without using the chart.
 */
export function PublicGearBody({ list }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Aggregate per-category for the chart.
  const byCategory = new Map<string, { weight: number; count: number }>();
  let weightedItems = 0;
  for (const e of list.entries) {
    const cat = (e.item.category || "Bez kategorie").trim();
    const w = (e.item.weight_g ?? 0) * e.quantity;
    if (e.item.weight_g != null) weightedItems += e.quantity;
    const prev = byCategory.get(cat) ?? { weight: 0, count: 0 };
    byCategory.set(cat, {
      weight: prev.weight + w,
      count: prev.count + e.quantity,
    });
  }
  const chartRows = [...byCategory.entries()].sort(
    (a, b) => b[1].weight - a[1].weight,
  );
  const maxWeight = Math.max(1, ...chartRows.map(([, v]) => v.weight));
  const missingWeight =
    list.entries.reduce((n, e) => n + e.quantity, 0) - weightedItems;

  const categories = [...byCategory.keys()];

  // Filter then keep the category grouping in the items table — same
  // structure the owner sees in /admin/vybaveni list-card view.
  const filteredEntries =
    categoryFilter == null
      ? list.entries
      : list.entries.filter(
          (e) =>
            (e.item.category || "Bez kategorie").trim() === categoryFilter,
        );

  return (
    <>
      {/* Chart */}
      {list.entries.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900">
              Váha podle kategorií
            </h2>
            {missingWeight > 0 && (
              <span className="text-xs text-warning">
                {missingWeight}{" "}
                {missingWeight === 1
                  ? "položka"
                  : missingWeight < 5
                    ? "položky"
                    : "položek"}{" "}
                bez váhy
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {chartRows.map(([cat, { weight, count }]) => {
              const pct = (weight / maxWeight) * 100;
              const sharePct = list.total_weight_g
                ? (weight / list.total_weight_g) * 100
                : 0;
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(active ? null : cat)}
                  className={[
                    "group flex flex-col gap-0.5 rounded-sm px-1 py-0.5 text-left transition-colors focus-ring",
                    active ? "bg-brand/10" : "hover:bg-surface-muted",
                  ].join(" ")}
                  aria-pressed={active}
                  title={
                    active
                      ? "Klikem zrušíš filtr"
                      : `Zobrazit jen kategorii ${cat}`
                  }
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span
                      className={[
                        "font-medium",
                        active ? "text-brand" : "text-ink-900",
                      ].join(" ")}
                    >
                      {cat}
                    </span>
                    <span className="font-mono tabular-nums text-ink-500">
                      {count} ks ·{" "}
                      {weight > 0 ? `${(weight / 1000).toFixed(2)} kg` : "—"}
                      {weight > 0 && (
                        <span className="ml-1 text-ink-300">
                          ({sharePct.toFixed(0)} %)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-sm bg-surface-muted">
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${Math.max(pct, weight > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="mt-8" id="items">
        {list.entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-center text-sm text-ink-500">
            Tento list je zatím prázdný.
          </p>
        ) : (
          <>
            {categories.length > 1 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Filtr
                </span>
                <select
                  value={categoryFilter ?? ""}
                  onChange={(e) =>
                    setCategoryFilter(e.target.value || null)
                  }
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-700 focus-ring"
                >
                  <option value="">Všechny kategorie</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {categoryFilter != null && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter(null)}
                      className="text-xs font-medium text-ink-500 hover:text-ink-900"
                    >
                      Vymazat filtr
                    </button>
                    <span className="text-xs text-ink-500">
                      ({filteredEntries.length} z {list.entries.length})
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="overflow-x-auto rounded-md border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2">Položka</th>
                    <th className="hidden px-3 py-2 sm:table-cell">
                      Kategorie
                    </th>
                    <th className="px-3 py-2 text-right">Váha</th>
                    <th className="hidden px-3 py-2 text-right lg:table-cell">
                      Odkaz
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredEntries.map((e) => {
                    const hasUrl = Boolean(e.item.url);
                    const href = hasUrl
                      ? assetUrl(`/api/gear/g/${list.slug}/${e.id}/`)
                      : null;
                    const weightLabel =
                      e.item.weight_g == null
                        ? "—"
                        : e.quantity > 1
                          ? `${e.quantity}× ${e.item.weight_g} g`
                          : e.item.weight_g >= 1000
                            ? `${(e.item.weight_g / 1000).toFixed(2)} kg`
                            : `${e.item.weight_g} g`;
                    return (
                      <tr key={e.id} className="align-top">
                        <td className="px-4 py-2">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                              className="font-medium text-ink-900 hover:text-brand"
                            >
                              {e.item.name} ↗
                            </a>
                          ) : (
                            <span className="font-medium text-ink-900">
                              {e.item.name}
                            </span>
                          )}
                          {/* Mobile fallback for the hidden Kategorie
                              + Odkaz columns. */}
                          <span className="ml-2 text-xs text-ink-500 sm:hidden">
                            {e.item.category && <>{e.item.category}</>}
                          </span>
                          {e.item.note && (
                            <div className="text-xs text-ink-500">
                              {e.item.note}
                            </div>
                          )}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-ink-700 sm:table-cell">
                          {e.item.category ? (
                            <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                              {e.item.category}
                            </span>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-ink-700">
                          {weightLabel}
                        </td>
                        <td className="hidden max-w-[1px] px-3 py-2 text-right lg:table-cell">
                          {e.item.url ? (
                            <a
                              href={e.item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-brand hover:underline"
                              title={e.item.url}
                            >
                              {new URL(e.item.url).hostname.replace(
                                /^www\./,
                                "",
                              )}{" "}
                              ↗
                            </a>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
