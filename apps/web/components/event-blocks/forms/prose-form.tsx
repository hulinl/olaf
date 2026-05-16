"use client";

import { Field, Input } from "@/components/ui/field";
import type { ProseBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: ProseBlockPayload;
  onChange: (p: ProseBlockPayload) => void;
}

export function ProseForm({ payload, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow" hint="Drobný kapitálkový text nad nadpisem">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) => onChange({ ...payload, eyebrow: e.target.value })}
            placeholder="O výpravě"
          />
        </Field>
        <Field label="Nadpis sekce">
          <Input
            value={payload.heading ?? ""}
            onChange={(e) => onChange({ ...payload, heading: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Tělo" hint="Oddělej odstavce dvěma novými řádky">
        <textarea
          rows={6}
          value={payload.body ?? ""}
          onChange={(e) => onChange({ ...payload, body: e.target.value })}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="URL obrázku (volitelné)">
          <Input
            value={payload.image_url ?? ""}
            onChange={(e) =>
              onChange({ ...payload, image_url: e.target.value })
            }
            placeholder="https://…/foto.jpg"
          />
        </Field>
        <Field label="Strana obrázku">
          <div className="flex gap-2">
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => onChange({ ...payload, image_side: side })}
                className={[
                  "h-11 flex-1 rounded-md border text-sm font-medium transition-colors focus-ring",
                  (payload.image_side ?? "right") === side
                    ? "border-brand bg-brand text-brand-ink"
                    : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
                ].join(" ")}
              >
                {side === "left" ? "Vlevo" : "Vpravo"}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}
