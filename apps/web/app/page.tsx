import Link from "next/link";
import type { Metadata } from "next";

import { FeatureSection } from "@/components/marketing/feature-section";
import { FeatureToc } from "@/components/marketing/feature-toc";
import { HeroBg } from "@/components/marketing/hero-bg";
import { HeroCta } from "@/components/marketing/hero-cta";
import { MarketingHeader } from "@/components/marketing/marketing-header";
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
          <HeroBg />
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:py-28">
            <h1
              className="hero-rise text-balance text-5xl font-semibold leading-[1.05] text-ink-900 sm:text-6xl md:text-7xl"
              style={{ letterSpacing: "-0.035em", animationDelay: "100ms" }}
            >
              Kde začíná dobrodružství.
            </h1>
            <p
              className="hero-rise mt-6 max-w-xl text-balance text-lg text-ink-700 sm:text-xl"
              style={{ animationDelay: "280ms" }}
            >
              olaf je domov pro vaši outdoor partu, sportovní komunitu nebo
              firemní tým. Komunita má profil, akce mají landing page,
              přihlášky mají pořádek a tvůrce má cockpit, kde to všechno řídí.
            </p>
            <div className="hero-rise mt-10" style={{ animationDelay: "460ms" }}>
              <HeroCta />
            </div>
          </div>
        </section>

        {/* FEATURE TOUR — sticky right-side TOC on lg+ follows the
            scroll and highlights the active section. On mobile we
            drop the TOC entirely (burger menu + long scroll is
            enough; a horizontal strip would steal space). */}
        <div className="border-t border-border-strong/20 bg-canvas">
          <div className="mx-auto flex max-w-7xl gap-10 px-4 py-2 lg:py-0">
            <div className="min-w-0 flex-1">
              {FEATURES.map((feature) => (
                <FeatureSection key={feature.id} feature={feature} />
              ))}
            </div>
            <FeatureToc features={FEATURES} />
          </div>
        </div>

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

        {/* FINAL CTA — emphasises "free + by-athletes-for-athletes +
            powered by BIfactory" instead of the generic "start like
            your party did" line. */}
        <section className="bg-canvas">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
              Pojďme do toho
            </p>
            <h2
              className="mt-3 text-4xl font-semibold text-ink-900 sm:text-5xl"
              style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
            >
              Celá aplikace je zdarma.
            </h2>
            <p className="mt-5 mx-auto max-w-xl text-balance text-lg text-ink-700">
              Od outdoor nadšenců pro outdoor nadšence. Postavený s láskou v{" "}
              <a
                href="https://bifactory.cz"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink-900 underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
              >
                BIfactory
              </a>
              .
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
