import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ArticleToc } from "@/components/marketing/article-toc";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MdxContent } from "@/components/marketing/mdx-content";
import { AppFooter } from "@/components/ui/app-footer";
import {
  extractMdxHeadings,
  getBlogPost,
  listBlogPosts,
} from "@/lib/content";
import { BLOG_CATEGORIES, SITE } from "@/lib/site-config";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listBlogPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getBlogPost(slug);
  if (!doc) return {};
  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.excerpt,
    alternates: { canonical: `${SITE.url}/blog/${slug}` },
    openGraph: {
      title: doc.frontmatter.title,
      description: doc.frontmatter.excerpt,
      type: "article",
      publishedTime: doc.frontmatter.publishedAt,
      authors: doc.frontmatter.author ? [doc.frontmatter.author] : undefined,
    },
  };
}

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

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const doc = getBlogPost(slug);
  if (!doc) notFound();

  const cat = BLOG_CATEGORIES.find((c) => c.id === doc.frontmatter.category);
  const headings = extractMdxHeadings(doc.content);

  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-7xl gap-10 px-4">
          <article className="min-w-0 flex-1 py-12 sm:py-16 lg:max-w-3xl">
          <nav aria-label="Breadcrumbs" className="mb-6 text-sm text-ink-500">
            <Link href="/blog" className="hover:text-brand focus-ring">
              Blog
            </Link>
            <span aria-hidden className="mx-2">/</span>
            <span>{cat?.label ?? doc.frontmatter.category}</span>
          </nav>

          <header className="border-b border-border pb-8">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-ink-500">
              <span className="font-medium text-brand">
                {cat?.label ?? doc.frontmatter.category}
              </span>
              <span aria-hidden>·</span>
              <time className="font-mono" dateTime={doc.frontmatter.publishedAt}>
                {formatDate(doc.frontmatter.publishedAt)}
              </time>
              {doc.frontmatter.author && (
                <>
                  <span aria-hidden>·</span>
                  <span>{doc.frontmatter.author}</span>
                </>
              )}
            </div>
            <h1
              className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl"
              style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
            >
              {doc.frontmatter.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-700">
              {doc.frontmatter.excerpt}
            </p>
          </header>

          <div className="mt-2">
            <MdxContent source={doc.content} />
          </div>

          <div className="mt-12 border-t border-border pt-8">
            <Link
              href="/blog"
              className="text-sm text-brand hover:text-brand-hover focus-ring"
            >
              ← Zpět na všechny články
            </Link>
          </div>
        </article>
        <ArticleToc headings={headings} />
        </div>
        <AppFooter variant="framed" />
      </main>
    </>
  );
}
