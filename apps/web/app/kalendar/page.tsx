import type { Metadata } from "next";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { AppFooter } from "@/components/ui/app-footer";
import { SITE } from "@/lib/site-config";

import { CalendarClient } from "./CalendarClient";

export const metadata: Metadata = {
  title: `Kalendář závodů — ${SITE.name}`,
  description:
    "Přes 250 ultra a horských závodů napříč Evropou a světem — UTMB, WTM, skyrunning, skialpinismus i české a slovenské klasiky. Nakoukni bez registrace, hvězdička ti drží bucket-list.",
  alternates: { canonical: `${SITE.url}/kalendar` },
};

export default function KalendarPage() {
  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col bg-canvas">
        <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 pb-4 sm:pt-12 sm:pb-6">
          {/* Header pillar — Ultra kalendář style: eyebrow s trail
              markerem, big condensed H1, stats bar right. Border-bottom
              3px silná linka jako v referenci. */}
          <header className="grid gap-4 border-b-[3px] border-ink-900 pb-5 sm:grid-cols-[1fr_auto] sm:gap-8">
            <div>
              <p className="mono-tag flex items-center gap-2.5 text-ink-500">
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-[18px] shrink-0 rounded-sm border border-border-strong"
                  style={{
                    background:
                      "linear-gradient(#fff 0 33%, var(--brand) 33% 67%, #fff 67%)",
                  }}
                />
                <span>Ultra trail · 40 km a víc · sezóny 2027+</span>
              </p>
              <h1
                className="font-condensed mt-2 font-bold text-ink-900"
                style={{
                  fontSize: "clamp(40px, 7vw, 76px)",
                  letterSpacing: "-0.01em",
                  lineHeight: 0.9,
                }}
              >
                Kalendář{" "}
                <span className="text-brand">závodů</span>
              </h1>
              <p className="mt-3 max-w-[64ch] text-ink-500">
                Top výběr velkých závodů, které stojí za cestu, a kompletní
                seznam zajímavých ultramaratonů po Evropě s bonusem z
                ostrovů (Madeira, Kanáry, Azory) a ze světa. UTMB World
                Series, World Trail Majors, skyrunning i nezávislé klasiky.
                Hvězdičkou si stavíš svůj bucket list.
              </p>
            </div>
            {/* Stats — vyplní se z klientu (initial empty pro SSR).
                Klient dovyplní jakmile načte races. Kotvíme se přes
                id-selektor pro čistší server/client boundary. */}
            <div
              id="kalendar-stats"
              className="grid grid-cols-2 items-end gap-x-6 gap-y-2 sm:grid-cols-4 sm:gap-x-8"
              aria-label="Statistiky kalendáře"
            />
          </header>
        </div>

        <CalendarClient />

        <AppFooter variant="framed" />
      </main>
    </>
  );
}
