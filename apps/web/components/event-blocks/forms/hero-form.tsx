"use client";

import { Field, Input } from "@/components/ui/field";
import type { HeroBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: HeroBlockPayload;
  onChange: (p: HeroBlockPayload) => void;
}

export function HeroForm({ payload, onChange }: Props) {
  const meta = payload.meta ?? [];

  function updateMeta(idx: number, key: "k" | "v", value: string) {
    const next = meta.map((m, i) => (i === idx ? { ...m, [key]: value } : m));
    onChange({ ...payload, meta: next });
  }

  function addMeta() {
    onChange({ ...payload, meta: [...meta, { k: "", v: "" }] });
  }

  function removeMeta(idx: number) {
    onChange({ ...payload, meta: meta.filter((_, i) => i !== idx) });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Cover URL"
        hint="Plnobarevná fotka na pozadí hero sekce. Prázdné = jen tmavé pozadí."
      >
        <Input
          value={payload.cover_url ?? ""}
          onChange={(e) => onChange({ ...payload, cover_url: e.target.value })}
          placeholder="https://…/cover.jpg"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow" hint="Nad nadpisem, drobný kapitálkový text">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) => onChange({ ...payload, eyebrow: e.target.value })}
            placeholder="Rakousko · Tyrolské Alpy · 2026"
          />
        </Field>
        <Field
          label="Vlastní titulek (volitelné)"
          hint="Když prázdné, použije se název akce."
        >
          <Input
            value={payload.title_override ?? ""}
            onChange={(e) =>
              onChange({ ...payload, title_override: e.target.value })
            }
          />
        </Field>
      </div>
      <Field label="Podtitulek" hint="1–2 věty pod nadpisem">
        <textarea
          rows={2}
          value={payload.subtitle ?? ""}
          onChange={(e) => onChange({ ...payload, subtitle: e.target.value })}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="CTA label" hint='Když prázdné: "Přihlásit na akci"'>
          <Input
            value={payload.cta_label ?? ""}
            onChange={(e) =>
              onChange({ ...payload, cta_label: e.target.value })
            }
          />
        </Field>
        <Field label="CTA cíl URL" hint="Když prázdné: vede na RSVP form">
          <Input
            value={payload.cta_href ?? ""}
            onChange={(e) =>
              onChange({ ...payload, cta_href: e.target.value })
            }
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink-900">
            Meta dlaždice (řada pod CTA)
          </p>
          <button
            type="button"
            onClick={addMeta}
            className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
          >
            + Přidat dlaždici
          </button>
        </div>
        {meta.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
            Žádné dlaždice — např. Délka / Vzdálenost / Náročnost.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {meta.map((m, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_2fr_auto] gap-2 rounded-md border border-border bg-surface p-3"
              >
                <Input
                  value={m.k}
                  placeholder="Termín"
                  onChange={(e) => updateMeta(i, "k", e.target.value)}
                />
                <Input
                  value={m.v}
                  placeholder="16.–19. dubna 2026"
                  onChange={(e) => updateMeta(i, "v", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeMeta(i)}
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
