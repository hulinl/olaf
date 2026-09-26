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
          {PUBLIC_NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
                  active
                    ? "text-ink-900"
                    : "text-ink-500 hover:text-ink-900",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {/* Active indicator — 2 px amber underline pod textem
                    (per OA design DNA). Signalizuje kde uživatel je. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-0.5 h-[2px] bg-brand"
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <PublicAuthIndicator />
      </div>
    </header>
  );
}
