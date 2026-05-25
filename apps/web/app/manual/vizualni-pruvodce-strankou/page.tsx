import Link from "next/link";
import type { Metadata } from "next";

import { BuilderGuide } from "@/components/manual/builder-guide";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { AppFooter } from "@/components/ui/app-footer";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Vizuální průvodce — stránka akce",
  description:
    "Interaktivní průvodce skládáním stránky akce. Klikni na blok ve vzorové stránce a uvidíš, kdy ho použít, co do něj patří, a jak vypadá výsledek.",
  alternates: {
    canonical: `${SITE.url}/manual/vizualni-pruvodce-strankou`,
  },
};

export const dynamic = "force-static";
export const revalidate = 3600;

export default function VisualBuilderGuidePage() {
  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col bg-canvas">
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
            <nav aria-label="Breadcrumbs" className="text-sm text-ink-500">
              <Link href="/manual" className="hover:text-brand focus-ring">
                Návody
              </Link>
              <span aria-hidden className="mx-2">
                /
              </span>
              <span>Akce</span>
            </nav>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.16em] text-brand">
              Akce · vizuální průvodce
            </p>
            <h1
              className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl"
              style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
            >
              Sestav si stránku akce
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-ink-700">
              Vzorová stránka 4denního treku, klikatelná po blocích. U každého
              bloku najdeš, kdy ho použít, co do něj patří, a jak vypadá
              výsledek na živé stránce akce.
            </p>
          </div>
        </section>

        <section className="bg-canvas">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
            <BuilderGuide />
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:py-14">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-500">
              Co dál
            </p>
            <h2
              className="mt-3 text-2xl font-semibold tracking-tight text-ink-900"
              style={{ letterSpacing: "-0.02em" }}
            >
              Otevři si Cockpit a začni skládat
            </h2>
            <p className="mt-3 max-w-2xl text-base text-ink-700">
              Builder najdeš v cockpitu akce pod záložkou <strong>Obsah</strong>.
              Bloky přidáváš z levého sidebaru, kliknutím se otevře inline
              formulář. Změny se ukládají autosave.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/manual/skladani-landing-page"
                className="rounded-lg border border-border bg-canvas px-4 py-2 text-sm font-medium text-ink-900 hover:border-brand focus-ring"
              >
                Princip skládání →
              </Link>
              <Link
                href="/manual/cockpit-poradatele"
                className="rounded-lg border border-border bg-canvas px-4 py-2 text-sm font-medium text-ink-900 hover:border-brand focus-ring"
              >
                Cockpit pořadatele →
              </Link>
              <Link
                href="/manual"
                className="rounded-lg border border-border bg-canvas px-4 py-2 text-sm font-medium text-ink-900 hover:border-brand focus-ring"
              >
                Všechny návody
              </Link>
            </div>
          </div>
        </section>

        <AppFooter variant="framed" />
      </main>
    </>
  );
}
