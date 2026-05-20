import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { assetUrl, type PublicGearList } from "@/lib/api";
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

  // Group entries by category for clean visual grouping.
  const byCategory = new Map<string, PublicGearList["entries"]>();
  for (const e of list.entries) {
    const cat = e.item.category || "Ostatní";
    const arr = byCategory.get(cat) ?? [];
    arr.push(e);
    byCategory.set(cat, arr);
  }

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

          {/* By-category breakdown chart — same horizontal-bar treatment
              as the owner's admin dashboard (PR #75), ported to public
              so visitors see at a glance where the pack weight lives. */}
          {list.entries.length > 0 && (
            <PublicCategoryChart entries={list.entries} totalG={list.total_weight_g} />
          )}
        </section>

        <section className="mx-auto w-full max-w-3xl px-4 pb-16">
          {byCategory.size === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-center text-sm text-ink-500">
              Tento list je zatím prázdný.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {[...byCategory.entries()].map(([cat, entries]) => (
                <div key={cat}>
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                    {cat}
                  </h2>
                  <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
                    {entries.map((e) => {
                      // Outbound through our redirect so we can count
                      // clicks. The redirect re-applies the affiliate
                      // params server-side, so we don't need display_url
                      // here — only knowing whether *some* URL exists.
                      const hasUrl = Boolean(e.item.url);
                      const href = hasUrl
                        ? assetUrl(`/api/gear/g/${list.slug}/${e.id}/`)
                        : null;
                      const weightLabel =
                        e.item.weight_g != null
                          ? e.quantity > 1
                            ? `${e.quantity}× ${e.item.weight_g} g`
                            : `${e.item.weight_g} g`
                          : null;
                      return (
                        <li
                          key={e.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="flex flex-col">
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                                className="font-medium text-ink-900 hover:text-brand"
                              >
                                {e.item.name} ↗
                              </a>
                            ) : (
                              <span className="font-medium text-ink-900">
                                {e.item.name}
                              </span>
                            )}
                            {e.item.note && (
                              <span className="text-xs text-ink-500">
                                {e.item.note}
                              </span>
                            )}
                          </div>
                          {weightLabel && (
                            <span className="font-mono text-xs tabular-nums text-ink-700">
                              {weightLabel}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
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

        <footer className="border-t border-border bg-canvas">
          <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-8 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
            <span>
              © {new Date().getFullYear()}{" "}
              <Link href="/" className="hover:text-ink-900">
                olaf
              </Link>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}

/** Horizontal-bar chart broken down by gear category. Reuses the
 *  shape of the owner-side ListDashboard so the public view feels
 *  like the same product the creator built the list in. Pure CSS — no
 *  chart library, sub-1kb on the wire. */
function PublicCategoryChart({
  entries,
  totalG,
}: {
  entries: PublicGearList["entries"];
  totalG: number;
}) {
  const byCategory = new Map<string, { weight: number; count: number }>();
  let weightedItems = 0;
  for (const e of entries) {
    const cat = (e.item.category || "Bez kategorie").trim();
    const w = (e.item.weight_g ?? 0) * e.quantity;
    if (e.item.weight_g != null) weightedItems += e.quantity;
    const prev = byCategory.get(cat) ?? { weight: 0, count: 0 };
    byCategory.set(cat, {
      weight: prev.weight + w,
      count: prev.count + e.quantity,
    });
  }
  const rows = [...byCategory.entries()].sort(
    (a, b) => b[1].weight - a[1].weight,
  );
  const maxWeight = Math.max(1, ...rows.map(([, v]) => v.weight));
  const missingWeight = entries.reduce((n, e) => n + e.quantity, 0) - weightedItems;

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900">
          Váha podle kategorií
        </h2>
        {missingWeight > 0 && (
          <span className="text-xs text-warning">
            {missingWeight} {missingWeight === 1 ? "položka" : missingWeight < 5 ? "položky" : "položek"} bez váhy
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map(([cat, { weight, count }]) => {
          const pct = (weight / maxWeight) * 100;
          const sharePct = totalG ? (weight / totalG) * 100 : 0;
          return (
            <div key={cat} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-ink-900">{cat}</span>
                <span className="font-mono tabular-nums text-ink-500">
                  {count} ks ·{" "}
                  {weight > 0 ? `${(weight / 1000).toFixed(2)} kg` : "—"}
                  {weight > 0 && (
                    <span className="ml-1 text-ink-300">
                      ({sharePct.toFixed(0)} %)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-surface-muted">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.max(pct, weight > 0 ? 3 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
