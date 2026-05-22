import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MdxContent } from "@/components/marketing/mdx-content";
import { AppFooter } from "@/components/ui/app-footer";
import {
  getManualArticle,
  listManualArticles,
} from "@/lib/content";
import { MANUAL_CATEGORIES, SITE } from "@/lib/site-config";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listManualArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getManualArticle(slug);
  if (!doc) return {};
  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.excerpt,
    alternates: { canonical: `${SITE.url}/manual/${slug}` },
    openGraph: {
      title: doc.frontmatter.title,
      description: doc.frontmatter.excerpt,
      type: "article",
    },
  };
}

export const dynamic = "force-static";
export const revalidate = 3600;

export default async function ManualArticlePage({ params }: Props) {
  const { slug } = await params;
  const doc = getManualArticle(slug);
  if (!doc) notFound();

  const cat = MANUAL_CATEGORIES.find(
    (c) => c.id === doc.frontmatter.category,
  );

  // Related: same category, exclude self, top 4.
  const related = listManualArticles()
    .filter(
      (a) =>
        a.frontmatter.category === doc.frontmatter.category && a.slug !== slug,
    )
    .slice(0, 4);

  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col">
        <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
          <nav aria-label="Breadcrumbs" className="mb-6 text-sm text-ink-500">
            <Link href="/manual" className="hover:text-brand focus-ring">
              Návody
            </Link>
            {cat && (
              <>
                <span aria-hidden className="mx-2">/</span>
                <span>{cat.label}</span>
              </>
            )}
          </nav>

          <header className="border-b border-border pb-8">
            {cat && (
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
                {cat.label}
              </p>
            )}
            <h1
              className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl"
              style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
            >
              {doc.frontmatter.title}
            </h1>
            <p className="mt-4 text-lg text-ink-700">{doc.frontmatter.excerpt}</p>
            {doc.frontmatter.updatedAt && (
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-ink-500">
                aktualizováno {doc.frontmatter.updatedAt}
              </p>
            )}
          </header>

          <div className="mt-2">
            <MdxContent source={doc.content} />
          </div>

          {related.length > 0 && (
            <aside className="mt-16 border-t border-border pt-8">
              <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-ink-500">
                Související
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/manual/${r.slug}`}
                      className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-sm hover:border-brand focus-ring"
                    >
                      <span className="font-medium text-ink-900">
                        {r.frontmatter.title}
                      </span>
                      <span className="text-xs text-ink-500">
                        {r.frontmatter.excerpt}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <div className="mt-12">
            <Link
              href="/manual"
              className="text-sm text-brand hover:text-brand-hover focus-ring"
            >
              ← Zpět na všechny návody
            </Link>
          </div>
        </article>
        <AppFooter variant="framed" />
      </main>
    </>
  );
}
