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
import { AuditLogScreen } from "@/components/marketing/mockups/screens/AuditLogScreen";
import { CockpitChecklistScreen } from "@/components/marketing/mockups/screens/CockpitChecklistScreen";
import { EventLandingScreen } from "@/components/marketing/mockups/screens/EventLandingScreen";
import { FeedTopicScreen } from "@/components/marketing/mockups/screens/FeedTopicScreen";
import { LandingBuilderScreen } from "@/components/marketing/mockups/screens/LandingBuilderScreen";
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
      <BrowserBar url="olaf.events/tvurce/akce/olaf-adventures/spring-camp-beskydy/edit/obsah" />
      <div className="relative flex-1">
        <LandingBuilderScreen />
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
        <CockpitChecklistScreen />
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
      <BrowserBar url="olaf.events/tvurce/admin/audit" />
      <div className="relative flex-1">
        <AuditLogScreen />
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

          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-32 sm:pt-24 sm:pb-40 lg:pt-28">
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

                {/* Toasts (2026-09-26 sweep 6): odstraněny úplně. User
                    report: Nová přihláška toast přetékal viewport
                    pravou hranou, Platba spárována se ztrácela pod
                    laptopem. Hero teď = laptop-only clean composition,
                    žádné plovoucí kartičky křížící bezel. Animovaný
                    dojem dostane feature tour níž. */}
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

        {/* KALENDÁŘ CTA — samostatná sekce po hero. Vede na veřejný
            /kalendar (ne OLAF-hosted, ale celá kalendáře ultra závodů).
            Signalizuje že OLAF není jen platforma pro pořadatele, ale
            i public discovery layer pro outdoor scénu. */}
        <Reveal>
          <section className="border-t border-border bg-ink-900 text-canvas">
            <div
              aria-hidden
              className="pointer-events-none relative overflow-hidden"
            >
              <div
                aria-hidden
                className="absolute inset-0 topo-bg-amber opacity-35"
              />
            </div>
            <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-16">
              <div className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="mono-tag text-brand">Novinka</p>
                  <h2
                    className="mt-3 font-semibold text-canvas"
                    style={{
                      fontSize: "clamp(24px, 3vw, 36px)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.15,
                    }}
                  >
                    Kalendář ultra závodů —{" "}
                    <span className="text-amber-glow">
                      nakoukni bez registrace
                    </span>
                    .
                  </h2>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-canvas/75">
                    Top ultramaratony a horské závody napříč Evropou i světem.
                    Klasiky, UTMB World Series, WTM. Přihlášeným zvládne
                    hvězdička držet vlastní bucket-list.
                  </p>
                </div>
                <div>
                  <Link
                    href="/kalendar"
                    className="inline-flex h-12 items-center justify-center rounded-sm bg-brand px-7 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-hover btn-brand-glow"
                  >
                    Otevřít kalendář →
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* JAK TO FUNGUJE — 3-step horizontal timeline pod hero. Dává
            narrative flow před feature tour, uživatel vidí „takhle to
            celé chodí" než rozklikne detail per feature. */}
        <section
          aria-label="Jak olaf funguje"
          className="border-t border-border bg-canvas"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <div data-reveal className="mb-12 max-w-2xl">
              <p className="mono-tag text-brand">Jak to funguje</p>
              <h2
                className="mt-3 font-semibold text-ink-900"
                style={{
                  fontSize: "clamp(28px, 3.2vw, 44px)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                Od nápadu k první přihlášce{" "}
                <span className="text-amber-glow">za deset minut</span>.
              </h2>
            </div>

            {/* 3 kroky — grid, mezi nimi dotted line connector na md+ */}
            <div className="relative grid gap-8 md:grid-cols-3 md:gap-6">
              {/* Connector line — jen na md+ */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 top-6 hidden h-px md:block"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, var(--brand) 0%, var(--brand) 50%, transparent 100%)",
                  backgroundSize: "8px 1px",
                  backgroundRepeat: "repeat-x",
                  opacity: 0.35,
                }}
              />
              {STEPS.map((step, i) => (
                <div
                  key={step.number}
                  data-reveal
                  style={{ ["--reveal-delay" as string]: `${i * 120}ms` }}
                  className="relative"
                >
                  {/* Number circle */}
                  <div className="relative mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink-900 bg-canvas text-lg font-semibold text-ink-900">
                    <span aria-hidden>{step.number}</span>
                  </div>
                  <p className="mono-tag text-brand">{step.eyebrow}</p>
                  <h3 className="mt-2 text-lg font-semibold leading-tight text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
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

        {/* PULL-QUOTE — emocionální těžiště landingu. Skutečný důvod, proč
            OLAF vznikl, řečený osobně. */}
        <Reveal>
          <section className="relative overflow-hidden border-y border-border bg-canvas">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 topo-bg opacity-30"
            />
            <div
              aria-hidden
              className="sunrise-glow pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,199,25,0.28) 0%, rgba(255,199,25,0.06) 45%, transparent 70%)",
              }}
            />
            <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:py-24">
              <span
                aria-hidden
                className="mono-tag inline-flex items-center gap-2 text-ink-500"
              >
                <span className="inline-block h-1 w-8 bg-brand" />
                Proč olaf
              </span>
              <blockquote
                className="mt-6 text-ink-900"
                style={{
                  fontSize: "clamp(22px, 2.8vw, 34px)",
                  letterSpacing: "-0.015em",
                  lineHeight: 1.25,
                  fontWeight: 500,
                }}
              >
                „Nikdy jsem nechtěl, aby účastník přišel na místo{" "}
                <span className="text-amber-glow">a já o něm nevěděl</span>.
                Přesně proto teď každou novou přihlášku ihned vidím v mailu,
                aplikaci i na mobilu."
              </blockquote>
              <p className="mt-8 mono-tag text-ink-500">
                — Olaf Hulín, zakladatel · Olaf Adventures
              </p>
            </div>
          </section>
        </Reveal>

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

        {/* PRICING — Free vs Premium. Základ zdarma, pokročilé funkce
            pro tvůrce za 190 Kč/rok. Vzor převzatý z family-hub, sharp
            OA styl (žádný gradient-emerald), dvě karty side-by-side. */}
        <Reveal>
          <section
            id="cena"
            className="relative overflow-hidden border-y border-border bg-surface-muted/60"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 topo-bg opacity-30"
            />
            <div
              aria-hidden
              className="sunrise-glow pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[560px] -translate-x-1/2 -translate-y-1/2"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(255,199,25,0.24) 0%, rgba(255,199,25,0.06) 45%, transparent 70%)",
              }}
            />
            <div className="relative mx-auto max-w-5xl px-4 py-20 sm:py-24">
              <div data-reveal className="text-center">
                <p className="mono-tag text-brand">Férová cena</p>
                <h2
                  className="mt-3 font-semibold text-ink-900"
                  style={{
                    fontSize: "clamp(28px, 3.6vw, 48px)",
                    letterSpacing: "-0.025em",
                    lineHeight: 1.05,
                  }}
                >
                  Free navždy.{" "}
                  <span className="text-amber-glow">
                    Premium za cenu oběda.
                  </span>
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-700">
                  Základ je zdarma a bez omezení času. Premium odemče
                  pokročilé nástroje pro pořadatele — víc integrací, víc
                  automatizace, míň klikání.
                </p>
              </div>

              <div className="mt-14 grid gap-5 md:grid-cols-2 md:gap-6">
                <PriceCard
                  name="Free"
                  price="0 Kč"
                  unit="navždy"
                  desc="Pro komunity a pořadatele, kteří si vystačí s tím, co potřebují k první akci."
                  features={FREE_FEATURES}
                  cta="Vytvořit účet"
                  ctaHref="/signup"
                  highlight={false}
                />
                <PriceCard
                  name="Premium"
                  price="190 Kč"
                  unit="ročně"
                  desc="Pokročilé nástroje pro tvůrce — integrace, automatizace, custom brand."
                  features={PREMIUM_FEATURES}
                  cta="Zkusit Premium"
                  ctaHref="/signup?tier=premium"
                  highlight
                />
              </div>

              <p
                data-reveal
                className="mt-6 text-center text-xs text-ink-500"
              >
                Bez smlouvy, bez skrytých poplatků. Platí se ročně,
                kdykoliv se dá zrušit.
              </p>
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

const FREE_FEATURES = [
  "Neomezené komunity a členové",
  "Neomezené akce",
  "Vlastní landing page akce (9+ typů bloků)",
  "Přihlášky s vlastním formulářem + waitlist",
  "QR Platba + PDF faktury s brandingem",
  "Cockpit + roadmap checklist + audit log",
  "Nástěnka + push notifikace",
  "Notion + AI import akcí",
  "30denní retence koše",
];

const PREMIUM_FEATURES = [
  "Vše z Free",
  "Vlastní doména (akce.tvojekomunita.cz)",
  "Fio bank webhook + auto-matching plateb",
  "iDoklad API — auto-faktury do účetnictví",
  "Pokročilé statistiky (attribution, funnel, retention)",
  "Vlastní e-mail brand (SPF/DKIM, custom sender)",
  "Bulk operace nad rosterem + exports",
  "Priority support (odpověď do 48 h)",
];

function PriceCard({
  name,
  price,
  unit,
  desc,
  features,
  cta,
  ctaHref,
  highlight,
}: {
  name: string;
  price: string;
  unit: string;
  desc: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight: boolean;
}) {
  return (
    <div
      data-reveal
      className={`relative flex flex-col rounded-sm border p-6 sm:p-8 ${
        highlight
          ? "border-ink-900 bg-canvas"
          : "border-border bg-canvas"
      }`}
      style={
        highlight
          ? {
              boxShadow:
                "0 30px 60px -22px rgb(255 199 25 / 0.35), 0 0 0 1px rgb(255 199 25 / 0.25)",
            }
          : undefined
      }
    >
      {highlight && (
        <span className="mono-tag absolute -top-3 right-6 rounded-sm bg-brand px-2.5 py-1 text-brand-ink">
          Doporučeno
        </span>
      )}
      <div>
        <h3 className="text-2xl font-semibold text-ink-900">{name}</h3>
        <div className="mt-3 flex items-baseline gap-1">
          <span
            className="font-semibold tracking-tight text-ink-900 tabular-nums"
            style={{
              fontSize: "clamp(36px, 5vw, 56px)",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {price}
          </span>
          <span className="text-sm text-ink-500">/ {unit}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">{desc}</p>
      </div>

      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-brand-ink ${
                highlight ? "bg-brand" : "border border-brand bg-brand-soft"
              }`}
            >
              <svg
                aria-hidden
                viewBox="0 0 12 12"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={highlight ? "text-brand-ink" : "text-brand"}
              >
                <polyline points="2 6.5 5 9.5 10 3.5" />
              </svg>
            </span>
            <span className="text-ink-900">{f}</span>
          </li>
        ))}
      </ul>

      <a
        href={ctaHref}
        className={`mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-sm px-6 text-sm font-semibold transition-colors focus-ring ${
          highlight
            ? "bg-brand text-brand-ink hover:bg-brand-hover btn-brand-glow"
            : "border border-border bg-surface text-ink-900 hover:bg-surface-muted"
        }`}
      >
        {cta} <span aria-hidden>→</span>
      </a>
    </div>
  );
}

const STEPS: {
  number: string;
  eyebrow: string;
  title: string;
  body: string;
}[] = [
  {
    number: "1",
    eyebrow: "30 sekund",
    title: "Založ komunitu",
    body: "Jméno, logo, popis, veřejná URL. Instant profil se seznamem akcí, členy a nástěnkou.",
  },
  {
    number: "2",
    eyebrow: "10 minut",
    title: "Přidej akci s obsahem",
    body: "Skládáš landing z bloků — hero, program po dnech, mapa, cena, otázky formuláře. Publikuješ jedním klikem.",
  },
  {
    number: "3",
    eyebrow: "Průběžně",
    title: "Přijímej přihlášky",
    body: "Každá RSVP ti dojde mailem, do zvonečku i na mobil. Roster, platby, feedback — vše na jednom místě.",
  },
];

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
    value: "0",
    label: "Cena za start",
    body: "Vše zdarma. Premium tarif jen za pokročilé nástroje pro tvůrce.",
  },
];
