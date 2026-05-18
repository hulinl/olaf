"use client";

import { useCallback, useEffect, useState } from "react";

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

  const grid = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {images.map((img, i) => {
        const src = assetUrl(img.url);
        if (!src) return null;
        return (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className={[
              "group relative aspect-square overflow-hidden rounded-md border focus-ring",
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
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
        "border-t",
        dark ? "border-transparent bg-ink-900" : "border-border bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-24 sm:py-28">
        <SectionHead
          eyebrow="Galerie"
          title="Z minulých kempů"
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Zavřít"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 focus-ring"
      >
        ×
      </button>
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            aria-label="Předchozí"
            className="absolute left-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 focus-ring sm:left-8"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Další"
            className="absolute right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 focus-ring sm:right-8"
          >
            ›
          </button>
        </>
      )}

      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={image.alt_text}
          className="max-h-[90vh] max-w-[92vw] object-contain"
        />
      )}

      <p className="absolute bottom-4 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70">
        {index + 1} / {total}
      </p>
    </div>
  );
}
