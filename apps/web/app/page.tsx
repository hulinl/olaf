import Link from "next/link";

import { TopographyBg } from "@/components/marketing/topography-bg";
import { LinkButton } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { SectionHead } from "@/components/ui/section-head";

const FEATURES = [
  {
    eyebrow: "Komunita",
    title: "Domov pro vaši partu",
    body: "Veřejný profil komunity s vaším logem, popisem a všemi akcemi na jednom místě. Bez Facebooku, bez plovoucích e-mailů.",
  },
  {
    eyebrow: "Akce",
    title: "Landing page bez vývojáře",
    body: "Skládáš stránku akce z bloků — hero, program, mapa, fotky, cena, FAQ. Co dáš dovnitř, to lidi vidí venku.",
  },
  {
    eyebrow: "Registrace",
    title: "RSVP, jak ho chceš mít",
    body: "Vlastní otázky podle typu akce (kondice, dieta, tričko, …), waitlist, schvalování. Profil účastníka se předvyplní sám.",
  },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
            aria-label="olaf"
          >
            <Logo size={26} />
          </Link>
          <PublicAuthIndicator />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* HERO */}
        <section className="relative isolate overflow-hidden">
          <TopographyBg />
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:py-32">
            <span className="mb-6 inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-ink-900">
              <span
                aria-hidden
                className="text-brand"
                style={{ fontSize: "0.85em", lineHeight: 1 }}
              >
                ●
              </span>
              Komunity a jejich akce na jedné stránce
            </span>
            <h1
              className="text-balance text-5xl font-semibold leading-[1.05] text-ink-900 sm:text-6xl md:text-7xl"
              style={{ letterSpacing: "-0.035em" }}
            >
              Kde začíná dobrodružství.
            </h1>
            <p className="mt-6 max-w-xl text-balance text-lg text-ink-700 sm:text-xl">
              olaf je domov pro vaši outdoor partu, sportovní komunitu nebo
              firemní tým. Komunita má profil, akce mají landing page,
              registrace má pořádek.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/signup" variant="primary" size="lg">
                Vytvořit účet
              </LinkButton>
              <LinkButton href="/login" variant="secondary" size="lg">
                Mám už účet
              </LinkButton>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
            <SectionHead
              eyebrow="Co umí olaf"
              title="Tři věci, které jsi dosud řešil/a v deseti nástrojích"
              lead="Postaveno pro outdoor pořadatele, sportovní komunity a firemní akce. Bez plovoucích Google Sheetů."
            />
            <div className="grid gap-5 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <article
                  key={f.eyebrow}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-7 shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-900">
                    <span
                      aria-hidden
                      className="text-brand"
                      style={{ fontSize: "0.85em", lineHeight: 1 }}
                    >
                      ●
                    </span>
                    {f.eyebrow}
                  </p>
                  <h3
                    className="text-lg font-semibold text-ink-900 sm:text-xl"
                    style={{ letterSpacing: "-0.02em", lineHeight: 1.2 }}
                  >
                    {f.title}
                  </h3>
                  <p
                    className="text-ink-700"
                    style={{ fontSize: 15, lineHeight: 1.6 }}
                  >
                    {f.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* SAMPLE */}
        <section className="bg-ink-900 text-ink-inverse">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
            <div className="grid items-center gap-10 sm:grid-cols-[1fr_auto] sm:gap-14">
              <div>
                <p className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-white/80">
                  <span
                    aria-hidden
                    className="text-brand"
                    style={{ fontSize: "0.85em", lineHeight: 1 }}
                  >
                    ●
                  </span>
                  Ukázka
                </p>
                <h2
                  className="mt-3 max-w-2xl text-3xl font-semibold text-ink-inverse sm:text-4xl"
                  style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
                >
                  Podívej se, jak to vypadá v praxi
                </h2>
                <p
                  className="mt-4 max-w-xl text-white/70"
                  style={{ fontSize: 16, lineHeight: 1.6 }}
                >
                  Olaf Adventures — outdoor komunita z Beskyd — používá olaf
                  pro multi-day kempy, víkendovky a tréninky. Mrkni na jejich
                  profil a aktuální akce.
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
          <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-24">
            <h2
              className="text-4xl font-semibold text-ink-900 sm:text-5xl"
              style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
            >
              Začni stejně, jako začala tvoje parta — venku.
            </h2>
            <p className="mt-5 max-w-xl text-balance text-lg text-ink-700 mx-auto">
              Účet zdarma. Žádná kreditka. První akce za pár minut.
            </p>
            <div className="mt-8">
              <LinkButton href="/signup" variant="primary" size="lg">
                Vytvořit účet
              </LinkButton>
            </div>
          </div>
        </section>

        <footer className="bg-canvas">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 border-t border-border px-4 py-10 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} olaf</span>
            <span>EU-hosted · GDPR-clean · PWA-first</span>
          </div>
        </footer>
      </main>
    </>
  );
}
