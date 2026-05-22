import Link from "next/link";
import type { Metadata } from "next";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { AppFooter } from "@/components/ui/app-footer";
import { listBlogPosts } from "@/lib/content";
import { BLOG_CATEGORIES, SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Případovky, novinky a úvahy ze stavby olafu i provozu reálných outdoor camps.",
  alternates: { canonical: `${SITE.url}/blog` },
};

export const dynamic = "force-static";
export const revalidate = 3600;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BlogIndexPage() {
  const posts = listBlogPosts();
  const byCategory = (cat: string) =>
    posts.find((p) => p.frontmatter.category === cat);

  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col">
        <section className="border-b border-border bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
              Blog
            </p>
            <h1
              className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              Případovky, novinky, úvahy
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-ink-700">
              Co jsme se naučili při stavbě olafu, jak ho používají reálné
              party, novinky z release-notes a občas zamyšlení nad
              architekturou produktu.
            </p>
          </div>
        </section>

        {posts.length === 0 ? (
          <section className="mx-auto w-full max-w-5xl px-4 py-16">
            <p className="text-ink-700">Zatím tu nic není — vrať se brzy.</p>
          </section>
        ) : (
          <>
            {/* Lead article: most recent */}
            <section className="bg-canvas">
              <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
                <Link
                  href={`/blog/${posts[0].slug}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-brand hover:shadow-lg sm:p-10 focus-ring"
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-ink-500">
                    <span className="font-medium text-brand">
                      {BLOG_CATEGORIES.find(
                        (c) => c.id === posts[0].frontmatter.category,
                      )?.label ?? posts[0].frontmatter.category}
                    </span>
                    <span aria-hidden>·</span>
                    <time className="font-mono" dateTime={posts[0].frontmatter.publishedAt}>
                      {formatDate(posts[0].frontmatter.publishedAt)}
                    </time>
                  </div>
                  <h2
                    className="text-2xl font-semibold text-ink-900 sm:text-3xl group-hover:text-brand"
                    style={{ letterSpacing: "-0.02em", lineHeight: 1.2 }}
                  >
                    {posts[0].frontmatter.title}
                  </h2>
                  <p className="max-w-3xl text-lg leading-relaxed text-ink-700">
                    {posts[0].frontmatter.excerpt}
                  </p>
                  <span className="text-sm font-medium text-brand">
                    Číst dál →
                  </span>
                </Link>
              </div>
            </section>

            {/* Rest in grid */}
            {posts.length > 1 && (
              <section className="bg-canvas">
                <div className="mx-auto max-w-5xl px-4 pb-16">
                  <ul className="grid gap-5 sm:grid-cols-2">
                    {posts.slice(1).map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/blog/${p.slug}`}
                          className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-brand hover:shadow-md focus-ring"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-ink-500">
                            <span className="font-medium text-brand">
                              {BLOG_CATEGORIES.find(
                                (c) => c.id === p.frontmatter.category,
                              )?.label ?? p.frontmatter.category}
                            </span>
                            <span aria-hidden>·</span>
                            <time className="font-mono" dateTime={p.frontmatter.publishedAt}>
                              {formatDate(p.frontmatter.publishedAt)}
                            </time>
                          </div>
                          <h3 className="text-lg font-semibold text-ink-900">
                            {p.frontmatter.title}
                          </h3>
                          <p className="text-sm leading-relaxed text-ink-500">
                            {p.frontmatter.excerpt}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
          </>
        )}
        <AppFooter variant="framed" />
      </main>
    </>
  );
}
