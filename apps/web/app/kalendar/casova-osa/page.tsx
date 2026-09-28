import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { AppFooter } from "@/components/ui/app-footer";
import { SITE } from "@/lib/site-config";

import { TimelineCanvasClient } from "./TimelineCanvasClient";

export const metadata: Metadata = {
  title: `Časová osa — ${SITE.name}`,
  description:
    "Vizuální plátno kalendáře — race calendar překrytý s tvojí osobní obsazeností. Uvidíš průnik možností × reality × volného času.",
  alternates: { canonical: `${SITE.url}/kalendar/casova-osa` },
};

export default function TimelinePage() {
  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col bg-canvas">
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-8 pb-4 sm:pt-12">
          <header className="grid gap-4 border-b-[3px] border-ink-900 pb-5 sm:grid-cols-[1fr_auto] sm:gap-8">
            <div>
              <p className="mono-tag text-ink-500">Plánovací plátno</p>
              <h1
                className="font-condensed mt-2 font-bold text-ink-900"
                style={{
                  fontSize: "clamp(36px, 6vw, 64px)",
                  letterSpacing: "-0.01em",
                  lineHeight: 0.9,
                }}
              >
                Časová <span className="text-brand">osa</span>
              </h1>
              <p className="mt-3 max-w-[64ch] text-ink-500">
                Race kalendář překrytý s tvojí osobní obsazeností a plány
                lidí z komunity. Porovnej svůj čas s tím, co můžeš zažít.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href="/kalendar"
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-canvas px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-surface-muted focus-ring"
              >
                Seznam závodů →
              </Link>
              <Link
                href="/settings/kalendare"
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-canvas px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-surface-muted focus-ring"
              >
                ⚙ Připojit kalendář
              </Link>
            </div>
          </header>
        </div>

        <TimelineCanvasClient />

        <AppFooter variant="framed" />
      </main>
    </>
  );
}
