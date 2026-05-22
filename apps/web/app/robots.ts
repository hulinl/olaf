import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated areas behind login — no point indexing them.
        disallow: [
          "/admin/",
          "/dashboard",
          "/settings/",
          "/login",
          "/signup",
          "/verify-email/",
          "/reset-password/",
          "/forgot-password",
          "/invitations/",
          "/join/",
          "/workspaces/",
          // Blog je dočasně neveřejný (žádné odkazy z nav/footer
          // ani sitemap); search engines ho neindexují.
          "/blog",
          "/blog/",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
