import Link from "next/link";
import type { Metadata } from "next";

import { FeatureSection } from "@/components/marketing/feature-section";
import { FeatureToc } from "@/components/marketing/feature-toc";
import { HeroCta } from "@/components/marketing/hero-cta";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  BrowserBar,
  LaptopFrame,
  PhoneFrame,
} from "@/components/marketing/mockups/chrome";
import { AdminCockpitScreen } from "@/components/marketing/mockups/screens/AdminCockpitScreen";
import { EventLandingScreen } from "@/components/marketing/mockups/screens/EventLandingScreen";
import { FeedTopicScreen } from "@/components/marketing/mockups/screens/FeedTopicScreen";
import { PaymentScreen } from "@/components/marketing/mockups/screens/PaymentScreen";
import { WorkspaceProfileScreen } from "@/components/marketing/mockups/screens/WorkspaceProfileScreen";
import { Reveal } from "@/components/marketing/reveal";
import { RevealMount } from "@/components/marketing/reveal-mount";
import { AppFooter } from "@/components/ui/app-footer";
import { LinkButton } from "@/components/ui/button";
import { FEATURES, SITE } from "@/lib/site-config";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: SITE.url },
};

// Registry: feature.id → který mockup ho ilustruje. Definované per-feature
// aby FeatureSection zůstal pure-presentational a design decision (co je
// v Laptop, co v Phone) žila u data.
const FEATURE_VISUALS: Record<string, ReactNode> = {
  komunita: (
    <LaptopFrame>
      <BrowserBar url="olaf.events/olaf-adventures" />
      <div className="relative flex-1">
        <WorkspaceProfileScreen />
      </div>
    </LaptopFrame>
  ),
  "landing-builder": (
    <LaptopFrame>
      <BrowserBar url="olaf.events/olaf-adventures/e/spring-camp-beskydy" />
      <div className="relative flex-1">
        <EventLandingScreen />
      </div>
    </LaptopFrame>
  ),
  prihlasky: (
    <LaptopFrame>
      <BrowserBar url="olaf.events/tvurce/akce/olaf-adventures/spring-camp-beskydy" />
      <div className="relative flex-1">
        <AdminCockpitScreen />
      </div>
    </LaptopFrame>
  ),
  platby: (
    <div className="mx-auto max-w-[260px]">
      <PhoneFrame>
        <PaymentScreen />
      </PhoneFrame>
    </div>
  ),
  cockpit: (
    <LaptopFrame>
      <BrowserBar url="olaf.events/tvurce/akce/olaf-adventures/spring-camp-beskydy" />
      <div className="relative flex-1">
        <AdminCockpitScreen />
      </div>
    </LaptopFrame>
  ),
  nastenka: (
    <div className="mx-auto max-w-[260px]">
      <PhoneFrame>
        <FeedTopicScreen />
      </PhoneFrame>
    </div>
  ),
  audit: (
    <LaptopFrame>
      <BrowserBar url="olaf.events/tvurce/akce/olaf-adventures/spring-camp-beskydy" />
      <div className="relative flex-1">
        <AdminCockpitScreen />
      </div>
    </LaptopFrame>
  ),
};

export default function Home() {
  return (
    <>
      <MarketingHeader />
      <RevealMount />

      <main className="flex flex-1 flex-col">
        {/* HERO — split layout: copy vlevo, layered device mockup vpravo
            (LaptopFrame(cockpit) main + PhoneFrame(event landing) overlay
            + 2 toast cards). OA design DNA — sharp corners, amber-glow
            accent, topo pattern, cubic-bezier easing. */}
        <section className="relative isolate overflow-hidden bg-canvas">
          {/* Ambient topo pattern — velmi jemné hory na pozadí */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 topo-bg opacity-40"
          />
          {/* Sunrise glow ambient — amber orb za mockupem (top-right) */}
          <div
            aria-hidden
            className="sunrise-glow pointer-events-none absolute -right-24 top-16 h-[520px] w-[520px]"
            style={{
              background:
                "radial-gradient(circle, rgba(255,199,25,0.32) 0%, rgba(255,199,25,0.08) 45%, transparent 70%)",
            }}
          />
          {/* Secondary glow (bottom-left) pro asymetrickou hloubku */}
          <div
            aria-hidden
            className="sunrise-glow pointer-events-none absolute -left-16 bottom-0 h-[420px] w-[420px]"
            style={{
              background:
                "radial-gradient(circle, rgba(255,199,25,0.18) 0%, rgba(255,199,25,0.04) 50%, transparent 75%)",
              animationDelay: "3s",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-24 sm:pt-24 sm:pb-28 lg:pt-28">
            <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
              {/* LEVÝ SLOUPEC — copy stack */}
              <div className="max-w-xl">
                {/* Eyebrow — mono uppercase, amber square dot */}
                <div
                  data-reveal
                  className="mb-6 inline-flex items-center gap-2"
                >
                  <span aria-hidden className="inline-block h-2 w-2 bg-brand" />
                  <span className="mono-tag text-ink-700">
                    Live · Pro outdoor party a sport komunity
                  </span>
                </div>

                {/* H1 display — clamp() sizing per OA */}
                <h1
                  data-reveal
                  style={{
                    ["--reveal-delay" as string]: "80ms",
                    fontSize: "clamp(38px, 5.2vw, 68px)",
                    letterSpacing: "-0.025em",
                    lineHeight: 1.05,
                  }}
                  className="font-semibold text-ink-900"
                >
                  Kde začíná{" "}
                  <span className="text-amber-glow">dobrodružství</span>.
                </h1>

                {/* Lead */}
                <p
                  data-reveal
                  style={{
                    ["--reveal-delay" as string]: "160ms",
                    fontSize: "clamp(17px, 1.5vw, 20px)",
                    lineHeight: 1.55,
                  }}
                  className="mt-6 max-w-lg text-ink-700"
                >
                  <span className="font-medium text-ink-900">olaf</span> je
                  domov pro tvoji outdoor partu, sportovní komunitu nebo
                  firemní tým. Komunita má profil, akce mají vlastní landing,
                  přihlášky mají pořádek a tvůrce má cockpit, kde to celé
                  řídí.
                </p>

                {/* CTA stack */}
                <div
                  data-reveal
                  style={{ ["--reveal-delay" as string]: "240ms" }}
                  className="mt-8"
                >
                  <HeroCta />
                </div>

                {/* Trust bullets — mono, amber dots */}
                <ul
                  data-reveal
                  style={{ ["--reveal-delay" as string]: "320ms" }}
                  className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2"
                >
                  {[
                    "Zdarma, bez karty",
                    "Data v EU",
                    "Bez limitů členů",
                    "PWA na mobilu",
                  ].map((label) => (
                    <li
                      key={label}
                      className="inline-flex items-center gap-1.5 text-[12px] text-ink-500"
                    >
                      <span className="inline-block h-1 w-1 rounded-full bg-brand" />
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* PRAVÝ SLOUPEC — layered device kompozice. Na mobilu jen
                  laptop centrovaný, na lg+ celá kompozice s phone overlay
                  a toast cards. */}
              <div
                data-reveal
                style={{ ["--reveal-delay" as string]: "200ms" }}
                className="relative mx-auto w-full max-w-[600px] lg:mx-0 lg:max-w-none"
              >
                {/* Main laptop mockup */}
                <div className="relative">
                  <LaptopFrame>
                    <BrowserBar url="olaf.events/tvurce/akce/olaf-adventures/spring-camp-beskydy" />
                    <div className="relative flex-1">
                      <AdminCockpitScreen />
                    </div>
                  </LaptopFrame>
                </div>

                {/* Floating phone — overlay bottom-left, jen na lg+ kde je
                    v grid layoutu dost místa. Šířka podle system-21 přibližně
                    175 px = w-44. */}
                <div
                  className="pointer-events-none absolute -bottom-10 -left-8 hidden w-40 lg:block lg:-bottom-14 lg:-left-14 lg:w-44"
                  aria-hidden
                >
                  <PhoneFrame>
                    <EventLandingScreen />
                  </PhoneFrame>
                </div>

                {/* Toast — nová přihláška (top-right) */}
                <div
                  className="chrome-toast pointer-events-none absolute -top-3 -right-3 hidden max-w-[200px] lg:flex"
                  aria-hidden
                >
                  <span
                    className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm bg-brand text-[10px] font-bold text-brand-ink"
                  >
                    ✓
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-ink-900 leading-tight">
                      Nová přihláška
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-500 leading-tight">
                      Marta Nová · před 12 min
                    </p>
                  </div>
                </div>

                {/* Toast — platba spárována (bottom-right) */}
                <div
                  className="chrome-toast pointer-events-none absolute -bottom-4 right-4 hidden max-w-[210px] lg:flex"
                  style={{ animationDelay: "2s" }}
                  aria-hidden
                >
                  <span
                    className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm border border-success/40 bg-success/10 text-[10px] font-bold text-success"
                  >
                    ⇢
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-ink-900 leading-tight">
                      Platba spárována
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-500 leading-tight">
                      1 800 Kč · VS 2600018
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll cue — sub-hero amber tick drop */}
          <a
            href="#komunita"
            className="absolute inset-x-0 bottom-4 z-10 mx-auto hidden w-fit flex-col items-center gap-1 text-ink-500 hover:text-ink-900 md:flex"
            aria-label="Přejít na první sekci"
          >
            <span className="mono-tag text-[9px]">Scroll</span>
            <span aria-hidden className="scroll-cue-line" />
          </a>
        </section>

        {/* STATS BAR — 4 proof-points, sharp corners, mono labels */}
        <section
          aria-label="Klíčové vlastnosti"
          className="border-y border-border bg-surface-muted"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4 sm:gap-10 sm:py-14">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 80}ms` }}
                className="flex flex-col"
              >
                <p
                  className="text-ink-900"
                  style={{
                    fontSize: "clamp(28px, 3.5vw, 44px)",
                    fontWeight: 600,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {s.value}
                </p>
                <p className="mono-tag mt-3 text-brand">{s.label}</p>
                <p className="mt-1 text-sm leading-snug text-ink-500">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURE TOUR — 7 sekcí, každá se svým real HTML mockupem
            wrapped v odpovídajícím device chromu. Sticky TOC vpravo
            na lg+. Reveal wrap per sekci. */}
        <div className="bg-canvas">
          <div className="mx-auto max-w-7xl gap-10 px-4 lg:flex lg:items-start">
            <div className="min-w-0 lg:flex-1 lg:[&>div:last-child_section]:pb-0">
              {FEATURES.map((feature) => (
                <Reveal key={feature.id}>
                  <FeatureSection
                    feature={feature}
                    visual={FEATURE_VISUALS[feature.id]}
                  />
                </Reveal>
              ))}
            </div>
            <FeatureToc features={FEATURES} />
          </div>
        </div>

        {/* SAMPLE community — dark section, topo-bg-amber, real link ke
            live Olaf Adventures */}
        <Reveal>
          <section className="relative overflow-hidden bg-ink-900 text-canvas">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 topo-bg-amber opacity-40"
            />
            <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-24">
              <div className="grid items-center gap-10 sm:grid-cols-[1fr_auto] sm:gap-14">
                <div>
                  <p className="mono-tag text-brand">Live ukázka</p>
                  <h2
                    className="mt-4 max-w-2xl font-semibold text-canvas"
                    style={{
                      fontSize: "clamp(28px, 3.5vw, 44px)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.1,
                    }}
                  >
                    Mrkni, jak to vypadá{" "}
                    <span className="text-amber-glow">v praxi</span>
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-canvas/75">
                    Olaf Adventures — outdoor komunita z Beskyd — používá
                    olaf pro multi-day kempy, víkendovky a tréninky. Klikni
                    a mrkni na živý profil komunity + landing akce.
                  </p>
                </div>
                <div className="shrink-0">
                  <Link
                    href="/olaf-adventures"
                    className="inline-flex h-12 items-center justify-center rounded-sm bg-brand px-7 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring btn-brand-glow"
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
            <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-24">
              <p className="mono-tag text-brand">Pojďme do toho</p>
              <h2
                className="mt-4 font-semibold text-ink-900"
                style={{
                  fontSize: "clamp(32px, 4.2vw, 56px)",
                  letterSpacing: "-0.025em",
                  lineHeight: 1.05,
                }}
              >
                Celá aplikace je{" "}
                <span className="text-amber-glow">zdarma</span>.
              </h2>
              <p className="mt-5 mx-auto max-w-xl text-lg text-ink-700">
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

const STATS: { value: string; label: string; body: string }[] = [
  {
    value: "9+",
    label: "Typů bloků",
    body: "Skládáš landing z hero, programu, mapy, FAQ, galerie a dalších.",
  },
  {
    value: "QR",
    label: "Platba",
    body: "Česká QR Platba se stabilním VS, faktura PDF v jednom kroku.",
  },
  {
    value: "PWA",
    label: "Mobil",
    body: "Přidej si olaf na plochu, push notifikace o dění na akcích.",
  },
  {
    value: "EU",
    label: "Data v EU",
    body: "Vše hostované v Evropě, audit log, soft-delete s 30denní retencí.",
  },
];
