"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  /** Future agenda — renders muted with "Brzy" pill, no click navigation. */
  comingSoon?: boolean;
}

// Order matters: events are first-class in OLAF, so Akce gets the
// top slot. Komunity is the optional grouping container. NAV is also
// consumed by the mobile drawer (see ui/app-header.tsx) so the order
// stays consistent across surfaces.
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/eventy", label: "Akce" },
  { href: "/admin/komunity", label: "Komunity" },
  { href: "/admin/lide", label: "Lidé" },
  { href: "/admin/vybaveni", label: "Vybavení" },
  { href: "/admin/platby", label: "Platby" },
  { href: "/admin/audit", label: "Aktivita" },
  { href: "/admin/dokumenty", label: "Dokumenty", comingSoon: true },
  { href: "/admin/smlouvy", label: "Smlouvy", comingSoon: true },
];

/**
 * Tvůrce shell.
 *
 * On lg+ we render a sticky vertical sidebar for one-click switching
 * between agendas. On mobile we deliberately omit any in-page nav —
 * the agenda set lives inside the hamburger drawer (Tvůrce section
 * with sub-links). Keeping mobile chrome down to "just a header bar"
 * gives the actual content the full viewport.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* DESKTOP SIDEBAR — lg+ only */}
          <aside className="hidden lg:block lg:w-60 lg:shrink-0">
            <div className="sticky top-20 flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3 shadow-sm">
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-500">
                Tvůrce
              </p>
              <nav className="flex flex-col gap-0.5" aria-label="Admin sections">
                {ADMIN_NAV.map((item) =>
                  item.comingSoon ? (
                    <span
                      key={item.href}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-ink-300"
                    >
                      {item.label}
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] text-ink-500">
                        Brzy
                      </span>
                    </span>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-ring",
                        isActive(item.href)
                          ? "bg-brand text-brand-ink"
                          : "text-ink-700 hover:bg-surface-muted hover:text-ink-900",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  ),
                )}
              </nav>
            </div>
          </aside>

          {/* MAIN — overflow-x-clip is a defensive net so a wide
              child (large image preview, long URL, table) can't push
              the whole viewport wide. min-w-0 is what lets the
              flex child actually shrink below its content width. */}
          <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
        </div>
      </div>
    </div>
  );
}
