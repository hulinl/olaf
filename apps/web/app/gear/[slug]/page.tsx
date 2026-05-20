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
          {list.description && (
            <p className="mt-3 whitespace-pre-wrap text-ink-700">
              {list.description}
            </p>
          )}
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
