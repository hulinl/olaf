import type { MetadataRoute } from "next";

import { listManualArticles } from "@/lib/content";
import { SITE } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Blog je dočasně schovaný — ne v sitemap, ne v robots; routy
  // pořád fungují přes přímý URL, ale neindexují se. Až bude
  // obsah kurátovaný, přidáme zpět.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, lastModified: now, priority: 1, changeFrequency: "weekly" },
    { url: `${SITE.url}/manual`, lastModified: now, priority: 0.9, changeFrequency: "weekly" },
  ];

  const manual = listManualArticles().map((doc) => ({
    url: `${SITE.url}/manual/${doc.slug}`,
    lastModified: doc.frontmatter.updatedAt
      ? new Date(doc.frontmatter.updatedAt)
      : now,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  return [...staticPages, ...manual];
}
