"use client";

import { Field, Input } from "@/components/ui/field";
import type { PracticalBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: PracticalBlockPayload;
  onChange: (p: PracticalBlockPayload) => void;
}

export function PracticalForm({ payload, onChange }: Props) {
  const lvl = payload.difficulty_level ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) => onChange({ ...payload, eyebrow: e.target.value })}
            placeholder="Praktické info"
          />
        </Field>
        <Field label="Nadpis sekce">
          <Input
            value={payload.title ?? ""}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            placeholder="Doprava, ubytování, výbava"
          />
        </Field>
      </div>

      <Field label="Doprava" hint="Jak se na akci dostat + doprava během akce.">
        <textarea
          value={payload.transport ?? ""}
          onChange={(e) => onChange({ ...payload, transport: e.target.value })}
          rows={3}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
        />
      </Field>

      <Field label="Ubytování a strava" hint="Kde se spí, polopenze/snídaně, co je v ceně.">
        <textarea
          value={payload.accommodation ?? ""}
          onChange={(e) =>
            onChange({ ...payload, accommodation: e.target.value })
          }
          rows={3}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
        />
      </Field>

      <Field label="Výbava" hint="Co si vzít, povinná vs. doporučená výbava.">
        <textarea
          value={payload.gear ?? ""}
          onChange={(e) => onChange({ ...payload, gear: e.target.value })}
          rows={3}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
        />
      </Field>

      <Field label="Náročnost" hint="0 = nezadáno, 1-5 = lehké → velmi náročné.">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ...payload, difficulty_level: n })}
                className={[
                  "h-9 w-9 rounded-md border text-sm font-semibold focus-ring",
                  n === lvl
                    ? "border-brand bg-brand text-brand-ink"
                    : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
                ].join(" ")}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field
        label="Náročnost — poznámka"
        hint="Co konkrétně náročnost znamená (km/den, převýšení, kondice)."
      >
        <textarea
          value={payload.difficulty_note ?? ""}
          onChange={(e) =>
            onChange({ ...payload, difficulty_note: e.target.value })
          }
          rows={3}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
        />
      </Field>
    </div>
  );
}
