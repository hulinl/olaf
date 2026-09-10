"use client";

import { useRef, useState } from "react";

import { Field } from "@/components/ui/field";
import { assetUrl } from "@/lib/api";

/** Viewport guide překrývá editor náhled obdélníkem reprezentujícím,
 *  co bude z fotky vidět na daném breakpointu / device. Aspect ratio je
 *  width/height reálného render surface (např. desktop hero 2.3, mobile
 *  hero 0.85). User pak vidí přímo, jestli mu důležitý element padne do
 *  bezpečné oblasti pro každý breakpoint. */
export interface ViewportGuide {
  label: string;
  aspectRatio: number;
  /** Barva rámečku — HEX / tailwind color. Overlay je vždy dashed. */
  colorClass?: string;
}

interface Props {
  /** URL obrázku k editaci — absolutní i relativní zpracuje assetUrl. */
  imageUrl: string;
  /** Focal point v procentech (0–100), CSS object-position style. */
  focalX: number;
  focalY: number;
  /** Zoom v procentech (100–300), aplikuje se přes transform:scale
   *  kolem focal-point pivotu. */
  zoom: number;
  /** Rozměr náhledu — hero = 16/9, avatar = 1, cover = 3/1. */
  aspectRatio?: "16/9" | "1/1" | "3/1" | "4/3";
  /** Zaoblení náhledu — full = kruh (avatar), lg = rounded-lg
   *  (cover / hero). */
  previewShape?: "rect" | "circle";
  /** Nejšíří box náhledu; default `max-w-lg`. Ovlivňuje jen editor,
   *  ne uložená data. */
  maxWidthClass?: string;
  /** Popis nad editorem (viditelný label + hint). */
  label?: string;
  hint?: string;
  /** Volitelné viewport guides — obdélníky uvnitř náhledu ukazující,
   *  co bude vidět na desktop / mobil breakpointu. Není-li set, žádný
   *  overlay se nekreslí (default pro avatar/cover). */
  viewportGuides?: ViewportGuide[];
  onChange: (next: { focal_x: number; focal_y: number; zoom: number }) => void;
}

const ZOOM_MIN = 100;
const ZOOM_MAX = 300;

const ASPECT_TO_NUMBER: Record<
  NonNullable<Props["aspectRatio"]>,
  number
> = {
  "16/9": 16 / 9,
  "1/1": 1,
  "3/1": 3,
  "4/3": 4 / 3,
};

/**
 * Notion-style focal-point + zoom editor. Reusable napříč hero
 * blokem, avatar uploadem a (V2) workspace cover uploadem. Extracted
 * 2026-09-10 z apps/web/components/event-blocks/forms/hero-form.tsx —
 * původně tam žila jako private FocalPointPicker. Chování drží 1:1
 * (drag = posun s inverzním zoom kompenzačním faktorem, kolečko myši
 * = zoom, dvojklik = reset, rule-of-thirds mřížka během dragu),
 * jenom je přidán prop `aspectRatio` + `previewShape`.
 */
export function PhotoEditor({
  imageUrl,
  focalX,
  focalY,
  zoom,
  aspectRatio = "16/9",
  previewShape = "rect",
  maxWidthClass = "max-w-lg",
  label = "Výřez / pozice",
  hint = "Přetáhni fotku a slider dole zoomni. Nic se nekropuje — celá fotka zůstává v úložišti.",
  viewportGuides,
  onChange,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const preview = assetUrl(imageUrl);
  if (!preview) return null;

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
  }

  function update(
    next: Partial<{ focal_x: number; focal_y: number; zoom: number }>,
  ) {
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
    const dxPct =
      ((e.clientX - origin.startX) / rect.width) * 100 / zoomFactor;
    const dyPct =
      ((e.clientY - origin.startY) / rect.height) * 100 / zoomFactor;
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
    e.preventDefault();
    const step = e.deltaY < 0 ? 10 : -10;
    update({ zoom: clamp(Math.round(zoom + step), ZOOM_MIN, ZOOM_MAX) });
  }

  const aspectClass = {
    "16/9": "aspect-[16/9]",
    "1/1": "aspect-square",
    "3/1": "aspect-[3/1]",
    "4/3": "aspect-[4/3]",
  }[aspectRatio];
  const shapeClass = previewShape === "circle" ? "rounded-full" : "rounded-md";

  return (
    <Field label={label} hint={hint}>
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
            "relative w-full touch-none select-none overflow-hidden border border-border bg-surface-muted",
            aspectClass,
            shapeClass,
            maxWidthClass,
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
          {/* Rule-of-thirds vodítka — jen během dragu, ať nekazí
              statický náhled. Kruhový avatar preview vodítka nemá
              smysl, jsou pro rect only. */}
          {dragging && previewShape === "rect" && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
            </div>
          )}
          {/* Viewport guides — dashed obdélníky s labelem, centered
              kolem focal pointu, sizes odpovídají target aspect ratio
              vůči editor náhledu. */}
          {viewportGuides &&
            viewportGuides.length > 0 &&
            !dragging && (
              <ViewportOverlay
                editorAspect={ASPECT_TO_NUMBER[aspectRatio]}
                guides={viewportGuides}
              />
            )}
        </div>

        <label className="flex w-full max-w-xs items-center gap-2 text-xs text-ink-500">
          <span className="w-10 shrink-0 font-mono text-ink-700">Zoom</span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={5}
            value={Math.round(zoom)}
            onChange={(e) =>
              update({
                zoom: clamp(Number(e.target.value), ZOOM_MIN, ZOOM_MAX),
              })
            }
            className="flex-1 accent-brand"
            aria-label="Zoom fotky"
          />
          <span className="w-12 shrink-0 text-right font-mono tabular-nums text-ink-700">
            {Math.round(zoom)} %
          </span>
        </label>

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
        {viewportGuides && viewportGuides.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-[11px] text-ink-500">
            <span className="font-medium text-ink-700">Náhled:</span>
            {viewportGuides.map((g) => (
              <span
                key={g.label}
                className="inline-flex items-center gap-1.5"
              >
                <span
                  aria-hidden
                  className={[
                    "inline-block h-2 w-4 rounded-sm border-2 border-dashed",
                    g.colorClass ?? "border-brand",
                  ].join(" ")}
                />
                <span>{g.label}</span>
              </span>
            ))}
            <span className="text-ink-400">
              Obsah uvnitř rámečku bude vidět; okraje se ořežou.
            </span>
          </div>
        )}
      </div>
    </Field>
  );
}

/** Vykreslí uvnitř editor náhledu obdélníky reprezentující, co bude
 *  vidět na daném target aspectu. Centrované kolem středu náhledu —
 *  focal point sedí uprostřed, takže obdélníky jsou centered.
 *
 *  Matematika: image je do editor náhledu vsazen přes `object-fit:
 *  cover` a editor má fixní aspect. Když target ratio > editor ratio,
 *  target zobrazí horizontální pás (menší výška, plná šířka). Když
 *  target ratio < editor ratio, target zobrazí vertikální pás. Overlay
 *  je vždy vsazen do editor náhledu, centered. */
function ViewportOverlay({
  editorAspect,
  guides,
}: {
  editorAspect: number;
  guides: ViewportGuide[];
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {guides.map((g) => {
        let widthPct = 100;
        let heightPct = 100;
        if (g.aspectRatio > editorAspect) {
          // Target širší -> viditelný pás má plnou šířku editoru,
          // sníženou výšku.
          heightPct = (editorAspect / g.aspectRatio) * 100;
        } else if (g.aspectRatio < editorAspect) {
          // Target vyšší -> plná výška, snížená šířka.
          widthPct = (g.aspectRatio / editorAspect) * 100;
        }
        const colorClass = g.colorClass ?? "border-brand";
        // Explicit paired classes — Tailwind CSS musí border-* i
        // text-* najít v souboru pro tree-shake. Dynamic replace by
        // build necustomizoval.
        const textClass =
          colorClass === "border-warning"
            ? "text-warning"
            : "text-brand";
        return (
          <div
            key={g.label}
            className={[
              "absolute rounded-sm border-2 border-dashed",
              colorClass,
            ].join(" ")}
            style={{
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              left: `${(100 - widthPct) / 2}%`,
              top: `${(100 - heightPct) / 2}%`,
            }}
          >
            <span
              className={[
                "absolute -top-2.5 left-1 rounded px-1 text-[10px] font-semibold uppercase tracking-wide",
                "bg-canvas/90",
                textClass,
              ].join(" ")}
            >
              {g.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
