"use client";

import { Field, Input } from "@/components/ui/field";
import type { MapBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: MapBlockPayload;
  onChange: (p: MapBlockPayload) => void;
}

export function MapForm({ payload, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="URL mapy *"
        hint="Mapy.cz / Mapy.com nebo Google Maps odkaz (i krátký share link). Embed přidáme automaticky."
      >
        <Input
          required
          value={payload.map_url ?? ""}
          onChange={(e) => onChange({ ...payload, map_url: e.target.value })}
          placeholder="https://mapy.com/… nebo https://maps.app.goo.gl/…"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) => onChange({ ...payload, eyebrow: e.target.value })}
            placeholder="Mapa"
          />
        </Field>
        <Field label="Nadpis sekce">
          <Input
            value={payload.title ?? ""}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            placeholder="Kudy poběžíme"
          />
        </Field>
      </div>
      <Field label="Popisek pod mapou (volitelné)">
        <Input
          value={payload.caption ?? ""}
          onChange={(e) => onChange({ ...payload, caption: e.target.value })}
          placeholder="Cca 12 km, převýšení 350 m"
        />
      </Field>
    </div>
  );
}
