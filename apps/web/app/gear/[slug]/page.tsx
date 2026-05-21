import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicGearBody } from "@/components/public-gear-body";
import { AppFooter } from "@/components/ui/app-footer";
import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { type PublicGearList } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchList(slug: string): Promise<PublicGearList | null> {
  return serverFetch<PublicGearList>(`/api/gear/lists/by-slug/${slug}/`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const list = await fetchList(slug);
  if (!list) return { title: "Not found — olaf" };
  return {
    title: `${list.name} — gear list · ${list.owner_name}`,
    description:
      list.description ||
      `Gear list ${list.name} od ${list.owner_name} na olafu.`,
    openGraph: {
      title: list.name,
      description: list.description || `${list.owner_name} · gear list`,
      type: "website",
    },
  };
}

export default async function PublicGearListPage({ params }: Props) {
  const { slug } = await params;
  const list = await fetchList(slug);
  if (!list) notFound();

  const totalKg = list.total_weight_g / 1000;

  return (
    <div data-theme="paper" className="flex min-h-screen flex-col bg-canvas text-ink-900">
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
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

      <main className="flex flex-1 flex-col overflow-x-clip">
        <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Gear list · {list.owner_name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {list.name}
          </h1>
          {(() => {
            // The Notion-import flow stashes a `[import:<uuid>]` marker
            // in the description for re-import idempotency. Strip it
            // before showing the description publicly — anyone reading
            // the shared link shouldn't see internal plumbing.
            const clean = (list.description || "")
              .replace(/\[import:[^\]]+\]/g, "")
              .trim();
            if (!clean) return null;
            return (
              <p className="mt-3 whitespace-pre-wrap text-ink-700">
                {clean}
              </p>
            );
          })()}
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-ink-500">
            <span>
              <strong className="text-ink-900">{list.item_count}</strong>{" "}
              {list.item_count === 1 ? "položka" : list.item_count < 5 ? "položky" : "položek"}
            </span>
            {list.total_weight_g > 0 && (
              <span>
                ·{" "}
                <strong className="text-ink-900 tabular-nums">
                  {totalKg.toFixed(2)} kg
                </strong>{" "}
                celkem
              </span>
            )}
          </div>

          {/* Chart + filterable items table (client component — chart
              labels are buttons that filter the table below). */}
          <PublicGearBody list={list} />
        </section>

        {/* Cross-sell CTA — when a friend opens a shared list, give
            them a one-tap path into the app. Plain prose, no
            screaming banner; the gear list is the star, this is the
            footnote that says "this is built on something you could
            use too". */}
        <section className="border-t border-border bg-surface-muted/40">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                olaf · komunita + akce + gear
              </p>
              <h2 className="mt-1 text-xl font-semibold text-ink-900 sm:text-2xl">
                Líbí se ti tenhle list? Pojď si vyzkoušet olaf.
              </h2>
              <p className="mt-2 max-w-md text-sm text-ink-500">
                Sestav si vlastní gear listy, organizuj akce s kamarády,
                veď komunitu — všechno v jedné aplikaci.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink hover:opacity-90 focus-ring"
              >
                Začít na olafu
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
              >
                Více info
              </Link>
            </div>
          </div>
        </section>

        <AppFooter />
      </main>
    </div>
  );
}
