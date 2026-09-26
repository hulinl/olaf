import type { Metadata } from "next";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { AppFooter } from "@/components/ui/app-footer";
import { SITE } from "@/lib/site-config";

import { CalendarClient } from "./CalendarClient";

export const metadata: Metadata = {
  title: `Kalendář závodů — ${SITE.name}`,
  description:
    "Ultra a horské závody napříč Evropou a světem. UTMB World Series, World Trail Majors, skyrunning i nezávislé klasiky. Přihlášeným ★ oblíbené si drží svůj bucket-list.",
  alternates: { canonical: `${SITE.url}/kalendar` },
};

export default function KalendarPage() {
  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col bg-canvas">
        <div className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 topo-bg opacity-40"
          />
          <div
            aria-hidden
            className="sunrise-glow pointer-events-none absolute -right-24 top-8 h-[380px] w-[380px]"
            style={{
              background:
                "radial-gradient(circle, rgba(255,199,25,0.28) 0%, rgba(255,199,25,0.06) 45%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <p className="mono-tag text-brand">Kalendář závodů</p>
            <h1
              className="mt-3 font-semibold text-ink-900"
              style={{
                fontSize: "clamp(34px, 5vw, 64px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
              }}
            >
              Top ultramaratony a horské závody{" "}
              <span className="text-amber-glow">letos i sezónu dopředu</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-700 sm:text-lg">
              Přes 250 závodů napříč Evropou i světem — UTMB World Series,
              World Trail Majors, skyrunning, skialpinismus, ČSUT i nezávislé
              české a slovenské klasiky. Nakoukni bez registrace, a když jsi
              přihlášen/a, hvězdičkou si stavíš svůj bucket-list.
            </p>
          </div>
        </div>

        <CalendarClient />

        <AppFooter variant="framed" />
      </main>
    </>
  );
}
