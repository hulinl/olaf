"use client";

import { useEffect } from "react";

/**
 * Scroll-triggered reveal — cheap náhrada za framer-motion pro
 * marketing landing. Označ element `data-reveal`, tenhle hook mu
 * přidá `.is-visible` jakmile ho IntersectionObserver zahlédne, a
 * CSS v `globals.css` už řeší fade-up přechod.
 *
 * Stagger se dělá inline stylem: `style={{ ["--reveal-delay"]: "80ms" }}`.
 *
 * Mount hook v client root wrapperu — nemusí být per-element. Sleduje
 * všechny `[data-reveal]` v dokumentu.
 */
export function useReveal(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Prefers-reduced-motion respektujeme přímo v CSS (element je
    // rovnou visible bez tranzice). Tady jen na jistotu preflight:
    // pokud reduce-motion, netrackujeme observer vůbec.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            // Element ožil — od teď je vidět, sledovat ho už není
            // třeba (unobserve šetří main-thread práci).
            observer.unobserve(entry.target);
          }
        }
      },
      {
        // Aktivuj o kousek dřív, než je element plně ve viewportu —
        // -8% od dolní hrany aby fade doběhl přesně když ho uživatel
        // vidí, ne až po tom.
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.05,
      },
    );

    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);
}
