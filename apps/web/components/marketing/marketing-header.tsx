"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { PUBLIC_NAV } from "@/lib/site-config";

/**
 * Marketing-site header — Logo + Navody/Blog + auth indicator on the right.
 *
 * Distinct from the app shell (`components/ui/app-header.tsx`) which
 * carries the in-app navigation. This one stays on `/`, `/manual/*`,
 * `/blog/*` and is intentionally lightweight.
 */
export function MarketingHeader() {
  const pathname = usePathname() ?? "/";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-ink-900 transition-opacity hover:opacity-80"
          aria-label="olaf"
        >
          <Logo size={26} />
        </Link>
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Marketing nav"
        >
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
                isActive(item.href)
                  ? "text-ink-900"
                  : "text-ink-500 hover:text-ink-900",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <PublicAuthIndicator />
      </div>
    </header>
  );
}
