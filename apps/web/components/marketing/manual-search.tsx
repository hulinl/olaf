"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ManualFrontmatter, MdxDoc } from "@/lib/content";
import { MANUAL_CATEGORIES } from "@/lib/site-config";

interface Props {
  articles: { slug: string; frontmatter: ManualFrontmatter }[];
}

/**
 * Klient-side search + category filter over the manual index. Plain
 * substring match for V1 — fast, no extra deps, fits ~7 articles.
 * Swap to fuse.js / minisearch once the catalogue exceeds 30 articles.
 */
export function ManualSearch({ articles }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (activeCategory && a.frontmatter.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        a.frontmatter.title,
        a.frontmatter.excerpt,
        ...(a.frontmatter.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, activeCategory, articles]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const a of filtered) {
      const arr = map.get(a.frontmatter.category) ?? [];
      arr.push(a);
      map.set(a.frontmatter.category, arr);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-8">
      {/* Search input */}
      <div>
        <label htmlFor="manual-search" className="sr-only">
          Hledat v návodech
        </label>
        <div className="relative">
          <input
            id="manual-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hledat v návodech…"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 pl-11 text-base text-ink-900 placeholder:text-ink-300 focus-ring"
          />
          <svg
            aria-hidden
            className="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={[
            "rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.1em] focus-ring",
            activeCategory === null
              ? "border-ink-900 bg-ink-900 text-ink-inverse"
              : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
          ].join(" ")}
        >
          Vše ({articles.length})
        </button>
        {MANUAL_CATEGORIES.map((cat) => {
          const count = articles.filter(
            (a) => a.frontmatter.category === cat.id,
          ).length;
          if (count === 0) return null;
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(active ? null : cat.id)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.1em] focus-ring",
                active
                  ? "border-brand bg-brand text-brand-ink"
                  : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
              ].join(" ")}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/30 p-10 text-center">
          <p className="text-ink-700">
            Nenašli jsme nic, co by sedělo na „{query}".
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {MANUAL_CATEGORIES.map((cat) => {
            const items = grouped.get(cat.id);
            if (!items || items.length === 0) return null;
            return (
              <section key={cat.id}>
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-ink-900">
                      {cat.label}
                    </h2>
                    <p className="text-sm text-ink-500">{cat.description}</p>
                  </div>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {items.map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/manual/${a.slug}`}
                        className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand hover:shadow-md focus-ring"
                      >
                        <span className="font-medium text-ink-900">
                          {a.frontmatter.title}
                        </span>
                        <span className="text-sm leading-relaxed text-ink-500">
                          {a.frontmatter.excerpt}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
