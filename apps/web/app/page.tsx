import Link from "next/link";
import type { Metadata } from "next";

import { FeatureSection } from "@/components/marketing/feature-section";
import { FeatureToc } from "@/components/marketing/feature-toc";
import { HeroCta } from "@/components/marketing/hero-cta";
import { HeroMockup } from "@/components/marketing/hero-mockup";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { Reveal } from "@/components/marketing/reveal";
import { RevealMount } from "@/components/marketing/reveal-mount";
import { StatsBar } from "@/components/marketing/stats-bar";
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
      {/* Mount observer pro `[data-reveal]` — sleduje celý dokument
          po klientovém mountu, takže per-element reveals fungují napříč
          hero + stats + CTA bez per-section wrap komponentů. */}
      <RevealMount />

      <main className="flex flex-1 flex-col">
        {/* HERO — split copy vlevo, „telefon" mockup vpravo. Nad tím
            dva ambient amber blobs, které pomalu driftí (drift-a/b)
            a dávají sekci hloubku bez toho, aby soutěžily s obsahem. */}
        <section className="relative isolate overflow-hidden bg-canvas">
          {/* Ambient blobs — pozadí, aria-hidden */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-40 h-[500px] w-[500px] animate-drift-a rounded-full bg-brand/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-16 h-[420px] w-[420px] animate-drift-b rounded-full bg-brand-soft/60 blur-3xl"
          />
          {/* Subtle grid overlay pro depth */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "linear-gradient(var(--ink-900) 1px, transparent 1px), linear-gradient(90deg, var(--ink-900) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-24 sm:pt-24 sm:pb-32">
            <div className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr] md:gap-14">
              {/* Levý sloupec — copy */}
              <div className="max-w-xl">
                <span
                  data-reveal
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-[11px] font-medium text-ink-700 backdrop-blur"
                >
                  <span className="live-dot" aria-hidden />
                  Živá platforma · Pro outdoor party
                </span>

                <h1
                  data-reveal
                  style={{
                    ["--reveal-delay" as string]: "80ms",
                    fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
                    letterSpacing: "-0.035em",
                    lineHeight: 1.05,
                  }}
                  className="mt-5 font-semibold text-ink-900"
                >
                  Kde začíná{" "}
                  <span className="gradient-text">dobrodružství</span>.
                </h1>

                <p
                  data-reveal
                  style={{ ["--reveal-delay" as string]: "160ms" }}
                  className="mt-6 text-lg leading-relaxed text-ink-700"
                >
                  <span className="text-ink-900">olaf</span> je domov pro tvoji
                  outdoor partu, sportovní komunitu nebo firemní tým. Komunita
                  má profil, akce mají{" "}
                  <span className="hl-glow">vlastní landing</span>, přihlášky
                  mají pořádek a tvůrce má cockpit, kde to celé řídí.
                </p>

                <div
                  data-reveal
                  style={{ ["--reveal-delay" as string]: "240ms" }}
                  className="mt-8"
                >
                  <HeroCta />
                </div>

                <ul
                  data-reveal
                  style={{ ["--reveal-delay" as string]: "320ms" }}
                  className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-500"
                >
                  <li className="inline-flex items-center gap-1.5">
                    <CheckMark />
                    Zdarma, bez karty
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <CheckMark />
                    Data v EU
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <CheckMark />
                    Bez limitů členů
                  </li>
                </ul>
              </div>

              {/* Pravý sloupec — HTML mockup */}
              <div
                data-reveal
                style={{ ["--reveal-delay" as string]: "180ms" }}
                className="relative"
              >
                <HeroMockup />
              </div>
            </div>
          </div>
        </section>

        {/* Proof-points řádek */}
        <StatsBar />

        {/* FEATURE TOUR — 7 sekcí z FEATURES config, alternating layout
            + sticky TOC vpravo na lg+. Každá sekce dostává jednorázový
            fade-up přes Reveal wrapper. */}
        <div className="bg-canvas">
          <div className="mx-auto max-w-7xl gap-10 px-4 lg:flex lg:items-start">
            <div className="min-w-0 lg:flex-1 lg:[&>div:last-child_section]:pb-0">
              {FEATURES.map((feature) => (
                <Reveal key={feature.id}>
                  <FeatureSection feature={feature} />
                </Reveal>
              ))}
            </div>
            <FeatureToc features={FEATURES} />
          </div>
        </div>

        {/* SAMPLE community */}
        <Reveal>
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
                    pro multi-day kempy, víkendovky a tréninky. Klikni a mrkni,
                    jak vypadá živý profil komunity + landing akce.
                  </p>
                </div>
                <div className="shrink-0">
                  <Link
                    href="/olaf-adventures"
                    className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-7 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
                  >
                    Olaf Adventures →
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* FINAL CTA */}
        <Reveal>
          <section className="bg-canvas">
            <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
                Pojďme do toho
              </p>
              <h2
                className="mt-3 text-4xl font-semibold text-ink-900 sm:text-5xl"
                style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
              >
                Celá aplikace je{" "}
                <span className="gradient-text">zdarma</span>.
              </h2>
              <p className="mt-5 mx-auto max-w-xl text-balance text-lg text-ink-700">
                Od outdoor nadšenců pro outdoor nadšence. Postavený s láskou v{" "}
                <a
                  href="https://bifactory.cz"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="BIfactory"
                  className="inline-flex h-7 w-7 items-center justify-center align-middle transition-opacity hover:opacity-80 focus-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/bifactory-logo.png"
                    alt="BIfactory"
                    className="h-6 w-6"
                  />
                </a>
                .
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <LinkButton
                  href="/signup"
                  variant="primary"
                  size="lg"
                  className="btn-brand-glow"
                >
                  Vytvořit účet
                </LinkButton>
                <LinkButton href="/manual" variant="secondary" size="lg">
                  Projít návody
                </LinkButton>
              </div>
            </div>
          </section>
        </Reveal>

        <AppFooter variant="framed" />
      </main>
    </>
  );
}

function CheckMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-brand"
    >
      <polyline points="4 10.5 8 14.5 16 6" />
    </svg>
  );
}
