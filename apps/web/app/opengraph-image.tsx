import { ImageResponse } from "next/og";

import { SITE } from "@/lib/site-config";

export const runtime = "edge";
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dynamic Open Graph image for the homepage. Rendered with Next's
 * `ImageResponse` (Satori under the hood), so the canvas is just JSX
 * styled with inline Tailwind-ish style props.
 *
 * The Sunrise brand mark is recreated as inline SVG instead of being
 * loaded from /public — edge runtime can't read the filesystem.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, #fafaf7 0%, #f4f1ea 50%, #fff7ea 100%)",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg
            width="56"
            height="56"
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#1a1a1a"
              strokeWidth="2.5"
            />
            <circle cx="24" cy="24" r="9" fill="#f59e0b" />
            <path
              d="M 8 30 L 18 16 L 26 26 L 34 18 L 40 26"
              stroke="#1a1a1a"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              fontSize: 38,
              fontWeight: 600,
              color: "#1a1a1a",
              letterSpacing: "-0.02em",
            }}
          >
            olaf
          </span>
        </div>

        {/* Hero copy */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 600,
              color: "#1a1a1a",
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              maxWidth: 980,
            }}
          >
            Kde začíná dobrodružství.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#525252",
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            Komunita má profil, akce má landing page, přihlášky mají pořádek
            a tvůrce má cockpit, kde to všechno řídí.
          </div>
        </div>

        {/* URL footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#737373",
            fontFamily: "monospace",
          }}
        >
          <span>{SITE.domain}</span>
          <span>komunita · akce · přihlášky · platby</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
