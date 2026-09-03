"use client";

import { useRef, useState } from "react";

import { Field, Input } from "@/components/ui/field";
import { assetUrl } from "@/lib/api";
import type { HeroBlockPayload } from "@/lib/event-blocks";

import { ImageUploadField } from "./_image-upload";

interface Props {
  payload: HeroBlockPayload;
  onChange: (p: HeroBlockPayload) => void;
  workspaceSlug?: string;
  eventSlug?: string;
}

export function HeroForm({
  payload,
  onChange,
  workspaceSlug,
  eventSlug,
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
        <FocalPointPicker
          coverUrl={payload.cover_url}
          focalX={payload.focal_x ?? 50}
          focalY={payload.focal_y ?? 50}
          onChange={(x, y) => onChange({ ...payload, focal_x: x, focal_y: y })}
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

interface FocalPointPickerProps {
  coverUrl: string;
  focalX: number;
  focalY: number;
  onChange: (x: number, y: number) => void;
}

/** Notion-style cover reposition. User grabs the image and drags — like moving
 *  a paper photo behind a window. Preview aspect matches the real hero (~16:9)
 *  so what you see IS what participants see. */
function FocalPointPicker({
  coverUrl,
  focalX,
  focalY,
  onChange,
}: FocalPointPickerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef<
    { pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null
  >(null);
  const [dragging, setDragging] = useState(false);
  const preview = assetUrl(coverUrl);
  if (!preview) return null;

  function clamp(v: number): number {
    return Math.max(0, Math.min(100, v));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const box = boxRef.current;
    if (!box) return;
    // Only primary button (mouse) / any touch/pen contact.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    box.setPointerCapture(e.pointerId);
    dragOriginRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: focalX,
      baseY: focalY,
    };
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const origin = dragOriginRef.current;
    const box = boxRef.current;
    if (!origin || !box || origin.pointerId !== e.pointerId) return;
    const rect = box.getBoundingClientRect();
    const dxPct = ((e.clientX - origin.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - origin.startY) / rect.height) * 100;
    // Drag-right reveals more of the LEFT of the photo → focal_x moves LEFT
    // (decreases). Same for vertical. Matches "drag the paper behind a
    // window" intuition — the underlying image tracks the pointer.
    onChange(
      Math.round(clamp(origin.baseX - dxPct)),
      Math.round(clamp(origin.baseY - dyPct)),
    );
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== e.pointerId) return;
    const box = boxRef.current;
    if (box && box.hasPointerCapture(e.pointerId)) {
      box.releasePointerCapture(e.pointerId);
    }
    dragOriginRef.current = null;
    setDragging(false);
  }

  return (
    <Field
      label="Výřez / pozice"
      hint="Přetáhni fotku, aby v hero rámu seděl ten pravý výřez. Nic se nekropuje — celá fotka zůstává v úložišti (share card i mail používají originál)."
    >
      <div className="flex flex-col gap-2">
        <div
          ref={boxRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onDoubleClick={() => onChange(50, 50)}
          className={[
            "relative aspect-[16/9] w-full max-w-lg touch-none select-none overflow-hidden rounded-md border border-border bg-surface-muted",
            dragging ? "cursor-grabbing" : "cursor-grab",
          ].join(" ")}
          style={{
            backgroundImage: `url(${preview})`,
            backgroundSize: "cover",
            backgroundPosition: `${focalX}% ${focalY}%`,
          }}
          role="slider"
          aria-label="Přetáhni fotku pro úpravu pozice"
          aria-valuetext={`Střed ${Math.round(focalX)} % × ${Math.round(focalY)} %`}
        >
          {/* Rule-of-thirds guides — zapnuté jen během dragu, ať to nerušilo statický náhled. */}
          {dragging && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <span>
            Střed: {Math.round(focalX)} % × {Math.round(focalY)} %
          </span>
          <button
            type="button"
            onClick={() => onChange(50, 50)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
          >
            Vycentrovat
          </button>
          <span className="text-ink-400">Dvojklikem taky vycentruješ.</span>
        </div>
      </div>
    </Field>
  );
}
