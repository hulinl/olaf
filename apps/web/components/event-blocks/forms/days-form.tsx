"use client";

import { Field, Input } from "@/components/ui/field";
import type { BlockDay, DaysBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: DaysBlockPayload;
  onChange: (p: DaysBlockPayload) => void;
}

export function DaysForm({ payload, onChange }: Props) {
  const days = payload.days ?? [];

  function update(i: number, patch: Partial<BlockDay>) {
    onChange({
      ...payload,
      days: days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
    });
  }

  function add() {
    onChange({
      ...payload,
      days: [
        ...days,
        {
          label: "",
          num: String(days.length + 1).padStart(2, "0"),
          title: "",
          route: "",
          body: "",
          time: "",
          distance: "",
          ascent: "",
          descent: "",
          map_url: "",
          image_url: "",
        },
      ],
    });
  }

  function remove(i: number) {
    onChange({ ...payload, days: days.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Úvodní věta" hint="Krátký lead nad seznamem dní">
        <textarea
          rows={2}
          value={payload.lead ?? ""}
          onChange={(e) => onChange({ ...payload, lead: e.target.value })}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
        />
      </Field>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink-900">Dny programu</p>
          <button
            type="button"
            onClick={add}
            className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
          >
            + Přidat den
          </button>
        </div>
        {days.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
            Zatím prázdné. Přidej první den.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {days.map((d, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-surface p-4"
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Den {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-xs text-ink-500 hover:text-danger"
                  >
                    Odstranit
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Den 1 / Čtvrtek"
                    value={d.label ?? ""}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                  <Input
                    placeholder="01"
                    value={d.num ?? ""}
                    onChange={(e) => update(i, { num: e.target.value })}
                  />
                  <Input
                    placeholder="Příjezd a zahájení"
                    value={d.title ?? ""}
                    onChange={(e) => update(i, { title: e.target.value })}
                  />
                </div>

                <Input
                  className="mt-3"
                  placeholder="Plangeroß → Taschachhaus · 1 612 m → 2 434 m"
                  value={d.route ?? ""}
                  onChange={(e) => update(i, { route: e.target.value })}
                />

                <textarea
                  className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                  rows={3}
                  placeholder="Co se v daný den děje. Krátký odstavec."
                  value={d.body ?? ""}
                  onChange={(e) => update(i, { body: e.target.value })}
                />

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Input
                    placeholder="6,5 h"
                    value={d.time ?? ""}
                    onChange={(e) => update(i, { time: e.target.value })}
                  />
                  <Input
                    placeholder="11,2 km"
                    value={d.distance ?? ""}
                    onChange={(e) => update(i, { distance: e.target.value })}
                  />
                  <Input
                    placeholder="+ 825 m"
                    value={d.ascent ?? ""}
                    onChange={(e) => update(i, { ascent: e.target.value })}
                  />
                  <Input
                    placeholder="- 18 m"
                    value={d.descent ?? ""}
                    onChange={(e) => update(i, { descent: e.target.value })}
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Odkaz na Mapy.cz"
                    hint="Když z mapy.com / mapy.cz, embeduje se jako iframe"
                  >
                    <Input
                      placeholder="https://mapy.com/cs/turisticka?…"
                      value={d.map_url ?? ""}
                      onChange={(e) => update(i, { map_url: e.target.value })}
                    />
                  </Field>
                  <Field label="URL obrázku (volitelné)">
                    <Input
                      placeholder="https://…/den1.jpg"
                      value={d.image_url ?? ""}
                      onChange={(e) =>
                        update(i, { image_url: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
