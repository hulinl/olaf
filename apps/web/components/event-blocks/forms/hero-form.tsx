"use client";

import { Field, Input } from "@/components/ui/field";
import { PhotoEditor } from "@/components/ui/photo-editor";
import {
  type HeroBlockPayload,
  formatCzDateRange,
  formatCzTimeRange,
} from "@/lib/event-blocks";

import { ImageUploadField } from "./_image-upload";

interface Props {
  payload: HeroBlockPayload;
  onChange: (p: HeroBlockPayload) => void;
  workspaceSlug?: string;
  eventSlug?: string;
  /** Event-level lokace + termíny pro preview toggle-ů. Hero je čte
   *  přímo z eventu (location_text, meeting_point_text, location_url,
   *  starts_at, ends_at); tady je ukazujeme pod checkboxem, aby user
   *  viděl, co se v hero objeví, aniž by musel skákat mezi Nastavením
   *  a Obsahem. */
  eventLocationText?: string;
  eventMeetingPointText?: string;
  eventLocationUrl?: string;
  eventStartsAt?: string;
  eventEndsAt?: string;
  eventTz?: string;
}

export function HeroForm({
  payload,
  onChange,
  workspaceSlug,
  eventSlug,
  eventLocationText = "",
  eventMeetingPointText = "",
  eventLocationUrl = "",
  eventStartsAt = "",
  eventEndsAt = "",
  eventTz = "",
}: Props) {
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
      <ImageUploadField
        label="Úvodní obrázek"
        hint="Velká fotka na pozadí hero sekce. Prázdné = jen tmavé pozadí."
        value={payload.cover_url ?? ""}
        onChange={(url) => onChange({ ...payload, cover_url: url })}
        workspaceSlug={workspaceSlug}
        eventSlug={eventSlug}
      />
      {payload.cover_url && (
        <PhotoEditor
          imageUrl={payload.cover_url}
          focalX={payload.focal_x ?? 50}
          focalY={payload.focal_y ?? 50}
          zoom={payload.zoom ?? 100}
          aspectRatio="16/9"
          hint="Přetáhni fotku a slider dole zoomni. Rámečky ukazují, co bude vidět na desktopu a na mobilu — mobil bere úzký vertikální pás uprostřed. Nic se nekropuje — celá fotka zůstává v úložišti (share card i mail používají originál)."
          viewportGuides={[
            // Desktop hero na public landing má min-h 520px + full
            // width viewport. Aspect ~ 2.3 (širokoúhlý pás).
            { label: "Desktop", aspectRatio: 2.3, colorClass: "border-brand" },
            // Mobile hero má min-h 440px + viewport šířka 375-414.
            // Aspect ~ 0.85 (skoro na výšku).
            {
              label: "Mobil",
              aspectRatio: 0.85,
              colorClass: "border-warning",
            },
          ]}
          onChange={(next) => onChange({ ...payload, ...next })}
        />
      )}
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

      <div className="rounded-md border border-border bg-surface-muted/40 p-3">
        <p className="text-sm font-medium text-ink-900">
          Systémové dlaždice
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Připnou se před tvoje vlastní meta dlaždice a berou data
          přímo z Nastavení akce — žádná duplikace, změny se propíšou
          automaticky.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex items-start gap-3 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={payload.show_dates === true}
              onChange={(e) =>
                onChange({ ...payload, show_dates: e.target.checked })
              }
              className="mt-0.5 size-4 shrink-0 accent-brand"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Termín</span>
              <span className="text-xs text-ink-500">
                {eventStartsAt ? (
                  <>
                    Zobrazí se:{" "}
                    <strong>
                      {formatCzDateRange(eventStartsAt, eventEndsAt)}
                    </strong>
                    {formatCzTimeRange(eventStartsAt, eventEndsAt, eventTz) && (
                      <>
                        {" "}
                        · {formatCzTimeRange(eventStartsAt, eventEndsAt, eventTz)}
                      </>
                    )}
                  </>
                ) : (
                  <span className="italic">
                    Nastav datum v Detailech akce, ať se dá zobrazit.
                  </span>
                )}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={payload.show_location === true}
              onChange={(e) =>
                onChange({ ...payload, show_location: e.target.checked })
              }
              className="mt-0.5 size-4 shrink-0 accent-brand"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Místo</span>
              <span className="text-xs text-ink-500">
                {eventLocationText || eventMeetingPointText ? (
                  <>
                    Zobrazí se:{" "}
                    <strong>
                      {eventLocationText || eventMeetingPointText}
                    </strong>
                    {eventLocationText && eventMeetingPointText && (
                      <>
                        {" "}(sraz: {eventMeetingPointText})
                      </>
                    )}
                    {eventLocationUrl && " · klikatelné na mapu"}
                  </>
                ) : (
                  <span className="italic">
                    Vyplň Lokalitu nebo Místo srazu v Detailech.
                  </span>
                )}
              </span>
            </span>
          </label>
        </div>
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

