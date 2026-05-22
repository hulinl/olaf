import type { Metadata } from "next";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ManualSearch } from "@/components/marketing/manual-search";
import { AppFooter } from "@/components/ui/app-footer";
import { listManualArticles } from "@/lib/content";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Návody",
  description:
    "Návody k aplikaci olaf — komunita, akce, přihlášky, platby, nástěnka, audit. Vše ve struktuře, vyhledávatelné.",
  alternates: { canonical: `${SITE.url}/manual` },
};

export const dynamic = "force-static";
export const revalidate = 3600;

export default function ManualIndexPage() {
  const articles = listManualArticles().map((a) => ({
    slug: a.slug,
    frontmatter: a.frontmatter,
  }));

  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col">
        <section className="border-b border-border bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
              Návody
            </p>
            <h1
              className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              Jak používat olaf
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-ink-700">
              Stručné, konkrétní návody pro každou funkci aplikace. Hledej
              fulltextem nebo proklikávej kategoriemi.
            </p>
          </div>
        </section>

        <section className="bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
            <ManualSearch articles={articles} />
          </div>
        </section>

        <AppFooter variant="framed" />
      </main>
    </>
  );
}
