import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MDX articles are rendered via `next-mdx-remote/rsc` at request
  // time (see lib/content.ts + components/marketing/mdx-content.tsx).
  // We deliberately do NOT register the @next/mdx webpack loader —
  // Turbopack + that loader currently doesn't serialise remark plugin
  // options correctly, and we don't need routes-as-mdx anyway.
  async redirects() {
    return [
      // Vybavení moved from the settings shell into the Tvůrce shell on
      // 2026-05-20 so it lives next to Akce / Komunity / Lidé.
      {
        source: "/settings/gear",
        destination: "/admin/vybaveni",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
