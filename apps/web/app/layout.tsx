import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { UpdateBanner } from "@/components/update-banner";
import { SITE } from "@/lib/site-config";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    "olaf",
    "outdoor",
    "komunita",
    "akce",
    "kemp",
    "expedice",
    "přihlášky",
    "QR Platba",
    "faktury",
    "Česko",
    "Slovensko",
  ],
  authors: [{ name: "Lubomír Hulín" }],
  creator: "Lubomír Hulín",
  publisher: "olaf.events",
  alternates: {
    canonical: SITE.url,
  },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [
      {
        url: SITE.ogImage,
        width: 1200,
        height: 630,
        alt: `${SITE.name} — ${SITE.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [SITE.ogImage],
  },
  // Lets iOS Safari treat Add-to-Home-Screen as a real PWA: launches
  // standalone, dark status bar matches the brand. Without this the
  // installed app opens with a generic white status bar + browser
  // chrome around it.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE.name,
  },
};

// Without this Next.js 16 doesn't inject `<meta name="viewport">`,
// which is why the whole app rendered at desktop width on phones and
// users had to pinch-zoom out.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000000",
};

// Opt every route out of Next.js's default static prerender. Static
// pages get `Cache-Control: s-maxage=31536000` which Azure SWA's CDN
// edge respects — meaning a deployed PWA on iPhone happily served
// month-old HTML even after clearing Safari data. Forcing dynamic
// makes every response carry no-cache and the edge stops holding
// stale shells. Public pages we still want cached can opt back in
// per-route via `export const revalidate = N`.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="cs"
      data-theme="paper"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink-900">
        {children}
        <UpdateBanner />
      </body>
    </html>
  );
}
