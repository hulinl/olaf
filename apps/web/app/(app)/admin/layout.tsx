"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  /** Future agenda — renders muted with "Brzy" pill, no click navigation. */
  comingSoon?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin/komunity", label: "Komunity" },
  { href: "/admin/eventy", label: "Eventy" },
  { href: "/admin/platby", label: "Platby", comingSoon: true },
  { href: "/admin/dokumenty", label: "Dokumenty", comingSoon: true },
  { href: "/admin/smlouvy", label: "Smlouvy", comingSoon: true },
  { href: "/admin/clenove", label: "Členové", comingSoon: true },
];

/**
 * Správce shell — left sidebar tree + main content. The user can drill into
 * each agenda from the sidebar; content area routes handle list → detail.
 * No "back to user view" link here — the top header is sticky and already
 * carries Dashboard / Komunity / Akce, which serves as the way back.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* SIDEBAR */}
          <aside className="lg:w-60 lg:shrink-0">
            <div className="sticky top-20 flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3 shadow-sm">
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-500">
                Správce
              </p>
              <nav className="flex flex-col gap-0.5" aria-label="Admin sections">
                {NAV.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  if (item.comingSoon) {
                    return (
                      <span
                        key={item.href}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-ink-300"
                      >
                        {item.label}
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] text-ink-500">
                          Brzy
                        </span>
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-ring",
                        active
                          ? "bg-brand text-brand-ink"
                          : "text-ink-700 hover:bg-surface-muted hover:text-ink-900",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* MAIN */}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
