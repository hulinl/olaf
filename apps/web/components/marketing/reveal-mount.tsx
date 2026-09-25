"use client";

import { useReveal } from "@/lib/use-reveal";

/**
 * Mount-only client komponent, který na klientu spustí IntersectionObserver
 * pro všechny `[data-reveal]` elementy na stránce. Nerendruje žádný markup —
 * jen aktivuje reveal chování z globals.css. Do server komponenty (page.tsx)
 * ho vlož jednou, kdekoli. `useReveal` sleduje `document.querySelectorAll` po
 * mountu, takže elementy nemusí být uvnitř tohoto komponentu.
 */
export function RevealMount() {
  useReveal();
  return null;
}
