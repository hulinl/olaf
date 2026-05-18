"use client";

import { Field, Input } from "@/components/ui/field";
import type { GalleryBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: GalleryBlockPayload;
  onChange: (p: GalleryBlockPayload) => void;
}

export function GalleryForm({ payload, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-dashed border-border bg-surface-muted/40 px-3 py-2 text-sm text-ink-500">
        Galerie zobrazí všechny obrázky nahrané v sekci <strong>Galerie</strong>{" "}
        v cockpitu akce. Tady jen ovlivníš nadpis sekce a kam se v pořadí
        bloků zařadí.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow" hint="Drobný kapitálkový text">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) => onChange({ ...payload, eyebrow: e.target.value })}
            placeholder="Galerie"
          />
        </Field>
        <Field label="Nadpis sekce">
          <Input
            value={payload.title ?? ""}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            placeholder="Z minulých kempů"
          />
        </Field>
      </div>
    </div>
  );
}
