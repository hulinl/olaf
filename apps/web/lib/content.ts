/**
 * MDX content loaders for the marketing site.
 *
 * The manual and blog both follow the same shape: a directory full of
 * `.mdx` files with YAML frontmatter, listed + searched in an index
 * page and rendered individually under `/<section>/[slug]`.
 *
 * We read directly from the filesystem at build/render time — Next
 * caches the result so the disk read happens once per build. No DB,
 * no API; the source is the repo and edits ship as PRs.
 */
import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

const ROOT = path.join(process.cwd(), "content");

export interface ManualFrontmatter {
  title: string;
  excerpt: string;
  category: string;
  /** Higher = shows first within its category. Defaults to 0. */
  order?: number;
  /** Optional tags used for search + related links. */
  tags?: string[];
  /** ISO date — when the article was last meaningfully updated. */
  updatedAt?: string;
}

export interface BlogFrontmatter {
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  author?: string;
  tags?: string[];
}

export interface MdxDoc<T> {
  slug: string;
  frontmatter: T;
  content: string;
}

function listMdx(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

function readMdx<T>(dir: string, slug: string): MdxDoc<T> | null {
  const file = path.join(ROOT, dir, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = matter(raw);
  return {
    slug,
    frontmatter: parsed.data as T,
    content: parsed.content,
  };
}

export function listManualArticles(): MdxDoc<ManualFrontmatter>[] {
  return listMdx("manual")
    .map((slug) => readMdx<ManualFrontmatter>("manual", slug))
    .filter((doc): doc is MdxDoc<ManualFrontmatter> => doc !== null)
    .sort((a, b) => {
      // First by category as defined in MANUAL_CATEGORIES (not done
      // here — caller groups), then by explicit order DESC, then
      // alphabetical title.
      const ao = a.frontmatter.order ?? 0;
      const bo = b.frontmatter.order ?? 0;
      if (ao !== bo) return bo - ao;
      return a.frontmatter.title.localeCompare(b.frontmatter.title, "cs");
    });
}

export function getManualArticle(
  slug: string,
): MdxDoc<ManualFrontmatter> | null {
  return readMdx<ManualFrontmatter>("manual", slug);
}

export function listBlogPosts(): MdxDoc<BlogFrontmatter>[] {
  return listMdx("blog")
    .map((slug) => readMdx<BlogFrontmatter>("blog", slug))
    .filter((doc): doc is MdxDoc<BlogFrontmatter> => doc !== null)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.publishedAt).getTime() -
        new Date(a.frontmatter.publishedAt).getTime(),
    );
}

export function getBlogPost(slug: string): MdxDoc<BlogFrontmatter> | null {
  return readMdx<BlogFrontmatter>("blog", slug);
}
