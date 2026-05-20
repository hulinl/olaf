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
      .catch(() => setError("Nepodařilo se načíst tvoje gear listy."));
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
        label="Gear list"
        hint={
          lists && lists.length === 0
            ? "Zatím nemáš žádný gear list. Vytvoř si ho v Tvůrce → Vybavení."
            : "Vyber list z tvého katalogu. Doporučujeme jeho viditelnost přepnout na Nelistované nebo Veřejné."
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
            <option value="">— vyber list —</option>
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
          Vybraný list je <strong>soukromý</strong> — na public landing se
          nezobrazí, dokud ho nepřepneš na Nelistované nebo Veřejné v
          Tvůrce → Vybavení.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
