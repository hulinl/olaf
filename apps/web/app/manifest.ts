import type { MetadataRoute } from "next";

/**
 * PWA manifest. Picked up by Next.js app router at the /manifest.webmanifest
 * route automatically. With this in place + apple-icon.png in app/,
 * "Add to Home Screen" on iOS Safari renders the B·Sunrise mark with
 * a proper standalone window (no Safari chrome) instead of the
 * generic page-screenshot fallback.
 *
 * Phase 2 (Web Push) will hang off the same install — iOS only grants
 * push permission to PWAs installed via Add to Home Screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "olaf — where adventures begin",
    short_name: "olaf",
    description:
      "Komunita, akce a registrace na jednom místě pro outdoor party.",
    start_url: "/",
    display: "standalone",
    background_color: "#fefcf6",
    theme_color: "#000000",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
