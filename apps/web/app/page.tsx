import Link from "next/link";
import type { Metadata } from "next";

import { FeatureSection } from "@/components/marketing/feature-section";
import { HeroCta } from "@/components/marketing/hero-cta";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { StatsStrip } from "@/components/marketing/stats-strip";
import { TopographyBg } from "@/components/marketing/topography-bg";
import { AppFooter } from "@/components/ui/app-footer";
import { LinkButton } from "@/components/ui/button";
import { FEATURES, SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: SITE.url },
};

export default function Home() {
  return (
    <>
      <MarketingHeader />

      <main className="flex flex-1 flex-col">
        {/* HERO */}
        <section className="relative isolate overflow-hidden">
          <TopographyBg />
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:py-28">
            <h1
              className="text-balance text-5xl font-semibold leading-[1.05] text-ink-900 sm:text-6xl md:text-7xl"
              style={{ letterSpacing: "-0.035em" }}
            >
              Kde začíná dobrodružství.
            </h1>
            <p className="mt-6 max-w-xl text-balance text-lg text-ink-700 sm:text-xl">
              olaf je domov pro vaši outdoor partu, sportovní komunitu nebo
              firemní tým. Komunita má profil, akce mají landing page,
              přihlášky mají pořádek a tvůrce má cockpit, kde to všechno řídí.
            </p>
            <div className="mt-10">
              <HeroCta />
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs uppercase tracking-[0.16em] text-ink-500">
              <span>účet zdarma</span>
              <span aria-hidden>·</span>
              <span>bez kreditky</span>
              <span aria-hidden>·</span>
              <span>první akce za pár minut</span>
            </div>
          </div>
        </section>

        <StatsStrip />

        {/* TOC strip — visible jump targets for the long-scroll feature tour */}
        <section className="border-b border-border-strong/20 bg-canvas">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-sm text-ink-700">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink-500">
              Prohlídka
            </span>
            {FEATURES.map((f) => (
              <Link
                key={f.id}
                href={`#${f.id}`}
                className="font-medium hover:text-brand focus-ring"
              >
                {f.tag}
              </Link>
            ))}
          </div>
        </section>

        {/* FEATURE TOUR */}
        {FEATURES.map((feature) => (
          <FeatureSection key={feature.id} feature={feature} />
        ))}

        {/* SAMPLE community */}
        <section className="bg-ink-900 text-ink-inverse">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <div className="grid items-center gap-10 sm:grid-cols-[1fr_auto] sm:gap-14">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
                  Live ukázka
                </p>
                <h2
                  className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl"
                  style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
                >
                  Mrkni, jak to vypadá v praxi
                </h2>
                <p
                  className="mt-4 max-w-xl text-white/70"
                  style={{ fontSize: 16, lineHeight: 1.6 }}
                >
                  Olaf Adventures — outdoor komunita z Beskyd — používá olaf
                  pro multi-day kempy, víkendovky a tréninky.
                </p>
              </div>
              <div className="shrink-0">
                <Link
                  href="/olafadventures"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-7 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
                >
                  Olaf Adventures →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="bg-canvas">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
            <h2
              className="text-4xl font-semibold text-ink-900 sm:text-5xl"
              style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
            >
              Začni stejně, jako začala tvoje parta — venku.
            </h2>
            <p className="mt-5 mx-auto max-w-xl text-balance text-lg text-ink-700">
              Účet zdarma. Žádná kreditka. První akce za pár minut.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href="/signup" variant="primary" size="lg">
                Vytvořit účet
              </LinkButton>
              <LinkButton href="/manual" variant="secondary" size="lg">
                Projít návody
              </LinkButton>
            </div>
          </div>
        </section>

        <AppFooter variant="framed" />
      </main>
    </>
  );
}
