import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /admin landing → komunity. A bare server-component redirect() in
      // app/(app)/admin/page.tsx triggers a Next.js 16 dev instrumentation
      // warning ("Performance.measure(): cannot have a negative time stamp")
      // because the root server component throws NEXT_REDIRECT before
      // performance.mark fires. Doing it at the config level sidesteps
      // both the warning and a wasted request.
      {
        source: "/admin",
        destination: "/admin/komunity",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
