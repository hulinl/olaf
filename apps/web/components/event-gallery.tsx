"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SectionHead } from "@/components/ui/section-head";
import { assetUrl, type EventImage } from "@/lib/api";
import type { BlockTone } from "@/lib/event-blocks";

interface Props {
  images: EventImage[];
  /** False = render only the grid+lightbox (no section/SectionHead). Used
   *  when wrapped by GalleryBlock which already provides its own chrome. */
  chrome?: boolean;
  tone?: BlockTone;
}

/**
 * Public gallery — responsive grid of square thumbnails with a fullscreen
 * lightbox (ESC closes, arrows navigate). Single client island, no external
 * lightbox library.
 */
export function EventGallery({ images, chrome = true, tone = "canvas" }: Props) {
  const dark = tone === "ink";
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const next = useCallback(() => {
    setOpenIndex((i) => (i == null ? null : (i + 1) % images.length));
  }, [images.length]);
  const prev = useCallback(() => {
    setOpenIndex((i) =>
      i == null ? null : (i - 1 + images.length) % images.length,
    );
  }, [images.length]);

  useEffect(() => {
    if (openIndex == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [openIndex, close, next, prev]);

  if (images.length === 0) return null;

  // Pitztal-style mosaic: first image takes a tall 2-row column on the left,
  // remaining images fill a 2×2 grid on the right. Falls back to a plain grid
  // when there are fewer than 5 images (mosaic looks broken with gaps).
  const useMosaic = images.length >= 5;

  const grid = useMosaic ? (
    <div className="grid h-[412px] grid-cols-1 grid-rows-[160px_160px_160px] gap-3 sm:h-[412px] sm:grid-cols-[2fr_1fr_1fr] sm:grid-rows-[200px_200px]">
      {images.slice(0, 5).map((img, i) => {
        const src = assetUrl(img.url);
        if (!src) return null;
        const isHero = i === 0;
        return (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className={[
              "group relative overflow-hidden rounded-xl border focus-ring",
              isHero
                ? "sm:row-span-2"
                : "",
              dark
                ? "border-white/10 bg-white/[0.04]"
                : "border-border bg-surface",
            ].join(" ")}
            aria-label={img.alt_text || `Obrázek ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={img.alt_text}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {img.alt_text && (
              <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {img.alt_text}
              </span>
            )}
          </button>
        );
      })}
      {images.length > 5 && (
        <button
          type="button"
          onClick={() => setOpenIndex(5)}
          className="hidden items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-muted/40 text-sm font-medium text-ink-700 hover:bg-surface-muted focus-ring"
          aria-label={`Zobrazit dalších ${images.length - 5} obrázků`}
        >
          + {images.length - 5} dalších
        </button>
      )}
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((img, i) => {
        const src = assetUrl(img.url);
        if (!src) return null;
        return (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className={[
              "group relative aspect-square overflow-hidden rounded-xl border focus-ring",
              dark
                ? "border-white/10 bg-white/[0.04]"
                : "border-border bg-surface",
            ].join(" ")}
            aria-label={img.alt_text || `Obrázek ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={img.alt_text}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </button>
        );
      })}
    </div>
  );

  const lightbox = openIndex != null && (
    <Lightbox
      image={images[openIndex]}
      index={openIndex}
      total={images.length}
      onClose={close}
      onNext={next}
      onPrev={prev}
    />
  );

  if (!chrome) {
    return (
      <>
        {grid}
        {lightbox}
      </>
    );
  }

  return (
    <section
      className={[
        "",
        dark ? "bg-ink-900" : "bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <SectionHead
          eyebrow="Galerie"
          title="Fotky"
          tone={dark ? "dark" : "light"}
        />
        {grid}
      </div>
      {lightbox}
    </section>
  );
}

function Lightbox({
  image,
  index,
  total,
  onClose,
  onNext,
  onPrev,
}: {
  image: EventImage;
  index: number;
  total: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const src = assetUrl(image.url);

  // Touch-swipe support — on phones the chevron buttons get covered
  // by the image at max-w-[92vw], so users couldn't tap them.
  // Track the first touch and decide left/right on touchend.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD = 50;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    touchStart.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) onPrev();
    else onNext();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
    >
      {/* Image first so the buttons render on top of it without
          needing explicit z-index. Without this the chevrons sat
          behind the image at narrow widths and were untappable. */}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={image.alt_text}
          className="max-h-[90vh] max-w-[92vw] object-contain"
        />
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Zavřít"
        className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-2xl text-white shadow-lg ring-1 ring-white/20 hover:bg-black/90 focus-ring"
      >
        ×
      </button>
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            aria-label="Předchozí"
            className="absolute left-2 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-3xl text-white shadow-lg ring-1 ring-white/20 hover:bg-black/90 focus-ring sm:left-6"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Další"
            className="absolute right-2 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-3xl text-white shadow-lg ring-1 ring-white/20 hover:bg-black/90 focus-ring sm:right-6"
          >
            ›
          </button>
        </>
      )}

      <p className="absolute bottom-4 z-10 rounded-full bg-black/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white">
        {index + 1} / {total}
      </p>
    </div>
  );
}
