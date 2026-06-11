"use client";

import { useState } from "react";

interface Props {
  src: string;
  title: string;
  dark: boolean;
  /** OSM / Mapy.cz embed nereaguje na `gestureHandling` — touchpad
   *  scroll uvnitř iframe zoomne mapu místo stránku. Tady proto držíme
   *  iframe `pointer-events:none` dokud user neklikne na overlay;
   *  pak interakce povolíme. Google Embed API tohle umí sám (param
   *  `gestureHandling=cooperative`), tam overlay nepotřebujeme. */
  needsScrollGuard: boolean;
}

export function MapEmbedShell({ src, title, dark, needsScrollGuard }: Props) {
  const [interactive, setInteractive] = useState(!needsScrollGuard);

  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-md border",
        dark
          ? "border-white/10 bg-white/[0.04]"
          : "border-border bg-surface",
      ].join(" ")}
      // overflow-anchor: none vypne browser scroll-anchoring, který
      // při změně výšky iframe obsahu (mapa, dlaždice) jinak posunul
      // viewport k tomuto bloku.
      style={{ aspectRatio: "16 / 9", overflowAnchor: "none" }}
    >
      <iframe
        loading="lazy"
        src={src}
        title={title}
        // tabIndex=-1 vyřadí iframe z tab orderu — když Mapy / Google
        // uvnitř volají focus() na svůj canvas, prohlížeč už nemá
        // důvod scrollovat parent stránku k iframe-u.
        tabIndex={-1}
        referrerPolicy="no-referrer-when-downgrade"
        className={[
          "absolute inset-0 h-full w-full border-0",
          interactive ? "" : "pointer-events-none",
        ].join(" ")}
      />
      {!interactive && (
        <button
          type="button"
          onClick={() => setInteractive(true)}
          aria-label="Aktivovat interakci s mapou"
          className={[
            "absolute inset-0 flex items-end justify-center bg-transparent transition-colors focus-ring",
            "hover:bg-black/5",
          ].join(" ")}
        >
          <span
            className={[
              "mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium tracking-wide shadow-sm",
              dark
                ? "bg-ink-900/85 text-white"
                : "bg-canvas/95 text-ink-900",
            ].join(" ")}
          >
            <span aria-hidden>👆</span>
            Klikni pro interakci s mapou
          </span>
        </button>
      )}
    </div>
  );
}
