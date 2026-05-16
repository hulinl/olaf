"use client";

import { Input } from "@/components/ui/field";
import type { StatsBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: StatsBlockPayload;
  onChange: (p: StatsBlockPayload) => void;
}

export function StatsForm({ payload, onChange }: Props) {
  const tiles = payload.tiles ?? [];

  function update(i: number, key: "label" | "value", value: string) {
    onChange({
      ...payload,
      tiles: tiles.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)),
    });
  }

  function add() {
    onChange({ ...payload, tiles: [...tiles, { value: "", label: "" }] });
  }

  function remove(i: number) {
    onChange({ ...payload, tiles: tiles.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-2 text-sm text-ink-900">
        <input
          type="checkbox"
          checked={Boolean(payload.dark)}
          onChange={(e) => onChange({ ...payload, dark: e.target.checked })}
          className="mt-0.5 size-4 accent-brand"
        />
        Tmavé pozadí (světlý text na ink-900)
      </label>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink-900">Dlaždice</p>
          <button
            type="button"
            onClick={add}
            className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
          >
            + Přidat
          </button>
        </div>
        {tiles.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
            Přidej alespoň jednu dlaždici (např. „4 dny" / „39 km").
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tiles.map((t, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_2fr_auto] gap-2 rounded-md border border-border bg-surface p-3"
              >
                <Input
                  value={t.value}
                  placeholder="4"
                  onChange={(e) => update(i, "value", e.target.value)}
                />
                <Input
                  value={t.label}
                  placeholder="denní trek"
                  onChange={(e) => update(i, "label", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-xs text-ink-500 hover:text-danger"
                >
                  Odstranit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
