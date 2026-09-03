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
          zoom={payload.zoom ?? 100}
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
  zoom: number;
  onChange: (next: { focal_x: number; focal_y: number; zoom: number }) => void;
}

const ZOOM_MIN = 100;
const ZOOM_MAX = 300;

/** Notion-style cover reposition + zoom. User grabs the image and drags to
 *  reposition; slider or scroll-wheel zooms in on the focal point. Preview
 *  aspect matches desktop hero (~16:9). Mobile hero is taller, but focal
 *  point translates to CSS object-position so the same "important bit"
 *  stays centered regardless of viewport aspect. */
function FocalPointPicker({
  coverUrl,
  focalX,
  focalY,
  zoom,
  onChange,
}: FocalPointPickerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef<
    { pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null
  >(null);
  const [dragging, setDragging] = useState(false);
  const preview = assetUrl(coverUrl);
  if (!preview) return null;

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
  }

  function update(next: Partial<{ focal_x: number; focal_y: number; zoom: number }>) {
    onChange({
      focal_x: next.focal_x ?? focalX,
      focal_y: next.focal_y ?? focalY,
      zoom: next.zoom ?? zoom,
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const box = boxRef.current;
    if (!box) return;
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
    // Zoomované fotce odpovídá menší % pohyb za pixel — kompenzujeme,
    // aby drag vždycky sledoval kurzor 1:1 bez ohledu na zoom.
    const zoomFactor = zoom / 100;
    const dxPct = ((e.clientX - origin.startX) / rect.width) * 100 / zoomFactor;
    const dyPct = ((e.clientY - origin.startY) / rect.height) * 100 / zoomFactor;
    update({
      focal_x: Math.round(clamp(origin.baseX - dxPct, 0, 100)),
      focal_y: Math.round(clamp(origin.baseY - dyPct, 0, 100)),
    });
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

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    // Kolečko myši = přiblížit/oddálit kolem focal-pointu. Nepředáváme
    // dál (preventDefault v React WheelEvent-u), ať se stránka nescrolluje
    // když user zoomuje v pickeru.
    e.preventDefault();
    const step = e.deltaY < 0 ? 10 : -10;
    update({ zoom: clamp(Math.round(zoom + step), ZOOM_MIN, ZOOM_MAX) });
  }

  return (
    <Field
      label="Výřez / pozice"
      hint="Přetáhni fotku a slider dole zoomni. Nic se nekropuje — celá fotka zůstává v úložišti (share card i mail používají originál)."
    >
      <div className="flex flex-col gap-3">
        <div
          ref={boxRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onDoubleClick={() => update({ focal_x: 50, focal_y: 50, zoom: 100 })}
          onWheel={handleWheel}
          className={[
            "relative aspect-[16/9] w-full max-w-lg touch-none select-none overflow-hidden rounded-md border border-border bg-surface-muted",
            dragging ? "cursor-grabbing" : "cursor-grab",
          ].join(" ")}
          role="slider"
          aria-label="Přetáhni fotku pro úpravu pozice, kolečkem zoomni"
          aria-valuetext={`Střed ${Math.round(focalX)} % × ${Math.round(focalY)} %, zoom ${Math.round(zoom)} %`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
            style={{
              objectPosition: `${focalX}% ${focalY}%`,
              transform: `scale(${zoom / 100})`,
              transformOrigin: `${focalX}% ${focalY}%`,
            }}
          />
          {/* Rule-of-thirds guides — zapnuté jen během dragu, ať nerušily statický náhled. */}
          {dragging && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-1 items-center gap-2 text-xs text-ink-500">
            <span className="w-10 shrink-0 font-mono text-ink-700">Zoom</span>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={5}
              value={Math.round(zoom)}
              onChange={(e) =>
                update({ zoom: clamp(Number(e.target.value), ZOOM_MIN, ZOOM_MAX) })
              }
              className="flex-1 accent-brand"
              aria-label="Zoom fotky"
            />
            <span className="w-12 shrink-0 text-right font-mono tabular-nums text-ink-700">
              {Math.round(zoom)} %
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <span>
            Střed: {Math.round(focalX)} % × {Math.round(focalY)} %
          </span>
          <button
            type="button"
            onClick={() => update({ focal_x: 50, focal_y: 50, zoom: 100 })}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
          >
            Resetovat
          </button>
          <span className="text-ink-400">
            Přetáhni pro posun · kolečkem / sliderem přiblíž · dvojklik = reset.
          </span>
        </div>
      </div>
    </Field>
  );
}
