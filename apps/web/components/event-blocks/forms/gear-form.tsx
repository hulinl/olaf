"use client";

import { useEffect, useState } from "react";

import { Field, Input } from "@/components/ui/field";
import { type GearList, gear } from "@/lib/api";
import type { GearBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: GearBlockPayload;
  onChange: (p: GearBlockPayload) => void;
}

/**
 * Editor for the gear-list block. Owner picks one of their own lists
 * from a dropdown; the block stores the list's slug so the public
 * landing can embed the slim public payload at render time.
 *
 * Lists that are still "private" are listed but flagged — the public
 * landing will quietly hide the block until visibility flips to
 * unlisted or public. Better than denying selection: the owner can
 * pre-stage the block and toggle visibility when ready.
 */
export function GearForm({ payload, onChange }: Props) {
  const [lists, setLists] = useState<GearList[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gear
      .listLists()
      .then(setLists)
      .catch(() => setError("Nepodařilo se načíst tvoje gear seznamy."));
  }, []);

  const selected = lists?.find((l) => l.slug === payload.list_slug);
  const isPrivate = selected?.visibility === "private";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) =>
              onChange({ ...payload, eyebrow: e.target.value })
            }
            placeholder="Vybavení"
          />
        </Field>
        <Field label="Nadpis sekce">
          <Input
            value={payload.title ?? ""}
            onChange={(e) =>
              onChange({ ...payload, title: e.target.value })
            }
            placeholder="Co si vzít"
          />
        </Field>
      </div>

      <Field
        label="Gear seznam"
        hint={
          lists && lists.length === 0
            ? "Zatím nemáš žádný gear seznam. Vytvoř si ho v Tvůrce → Vybavení."
            : "Vyber seznam z tvého katalogu. Doporučujeme jeho viditelnost přepnout na Nelistované nebo Veřejné."
        }
      >
        {lists === null ? (
          <p className="rounded-md border border-border bg-surface-muted/30 px-3 py-2 text-sm text-ink-500">
            Načítám…
          </p>
        ) : (
          <select
            value={payload.list_slug || ""}
            onChange={(e) =>
              onChange({ ...payload, list_slug: e.target.value })
            }
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
          >
            <option value="">— vyber seznam —</option>
            {lists.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
                {l.visibility === "private" ? " · soukromé" : ""}
                {" · "}
                {(l.total_weight_g / 1000).toFixed(2)} kg
              </option>
            ))}
          </select>
        )}
      </Field>

      {isPrivate && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Vybraný seznam je <strong>soukromý</strong> — na public landing se
          nezobrazí, dokud ho nepřepneš na Nelistované nebo Veřejné v
          Tvůrce → Vybavení.
        </p>
      )}

      {selected && selected.entries.length > 0 && (
        <FeaturedPicker selected={selected} payload={payload} onChange={onChange} />
      )}

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Curated subset picker — owner toggles which entries from the
 *  selected gear list will appear on the public landing. Empty
 *  selection means "show all" (same as before this feature).
 *  Per-category checkboxes match the rendering grouping so the owner
 *  can quickly include / exclude whole sections. */
function FeaturedPicker({
  selected,
  payload,
  onChange,
}: {
  selected: GearList;
  payload: GearBlockPayload;
  onChange: (p: GearBlockPayload) => void;
}) {
  const featured = new Set(payload.featured_entry_ids ?? []);
  const showAll = featured.size === 0;

  function setFeatured(next: Set<number>) {
    onChange({ ...payload, featured_entry_ids: [...next] });
  }

  function toggleEntry(entryId: number) {
    const next = new Set(featured);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setFeatured(next);
  }

  function selectAll() {
    setFeatured(new Set());
  }

  function clearAll() {
    // "Empty array" still means "show none" in our convention only if
    // we render the block conditionally — but the block returns null
    // when featuredEntries ends up empty AND featured.length > 0. So
    // we treat an explicit empty-array as "owner wants empty" — we
    // just hide the block. To revert to "show all" the owner clicks
    // selectAll above. Make this clear in the hint text below.
    const all = new Set(selected.entries.map((e) => e.id));
    // Toggle off — pick one entry to "unfeature" the rest? Simpler:
    // setting featured to a marker {-1} would be confusing. Reset to
    // empty (= show all) on this button.
    if (all.size === featured.size) setFeatured(new Set());
    else setFeatured(new Set());
  }
  void clearAll; // keep linter happy if unused

  // Group entries by category for the checkbox list.
  const byCategory = new Map<string, GearList["entries"]>();
  for (const e of selected.entries) {
    const cat = e.item.category || "Ostatní";
    const arr = byCategory.get(cat) ?? [];
    arr.push(e);
    byCategory.set(cat, arr);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-muted/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            TOP výběr pro public
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {showAll
              ? "Zobrazují se všechny položky. Zaškrtni jen ty, které chceš ukázat na veřejné stránce — typicky 5–10 klíčových věcí."
              : `Zobrazí se ${featured.size} z ${selected.entries.length} položek.`}
          </p>
        </div>
        {!showAll && (
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            Zobrazit vše
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {[...byCategory.entries()].map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              {cat}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {items.map((e) => {
                const on = featured.has(e.id);
                return (
                  <li key={e.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleEntry(e.id)}
                        className="size-4 accent-brand"
                      />
                      <span className="flex-1 text-ink-900">
                        {e.item.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
