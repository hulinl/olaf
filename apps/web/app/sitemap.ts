import type { MetadataRoute } from "next";

import { listBlogPosts, listManualArticles } from "@/lib/content";
import { SITE } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, lastModified: now, priority: 1, changeFrequency: "weekly" },
    { url: `${SITE.url}/manual`, lastModified: now, priority: 0.9, changeFrequency: "weekly" },
    { url: `${SITE.url}/blog`, lastModified: now, priority: 0.8, changeFrequency: "weekly" },
  ];

  const manual = listManualArticles().map((doc) => ({
    url: `${SITE.url}/manual/${doc.slug}`,
    lastModified: doc.frontmatter.updatedAt
      ? new Date(doc.frontmatter.updatedAt)
      : now,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  const blog = listBlogPosts().map((doc) => ({
    url: `${SITE.url}/blog/${doc.slug}`,
    lastModified: new Date(doc.frontmatter.publishedAt),
    priority: 0.7,
    changeFrequency: "yearly" as const,
  }));

  return [...staticPages, ...manual, ...blog];
}
