import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "olaf — where adventures begin",
  description:
    "A community-and-event platform for adventure organizers, sports communities, and corporate event hosts.",
};

// Without this Next.js 16 doesn't inject `<meta name="viewport">`,
// which is why the whole app rendered at desktop width on phones and
// users had to pinch-zoom out.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="paper"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink-900">
        {children}
      </body>
    </html>
  );
}
