import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
