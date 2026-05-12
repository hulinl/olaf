"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/account", label: "Account" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-8">
          <p className="text-sm font-medium text-brand">Settings</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Account &amp; preferences
          </h1>
        </header>

        <div className="flex flex-col gap-6 md:flex-row md:gap-10">
          <nav
            aria-label="Settings navigation"
            className="flex flex-row gap-1 overflow-x-auto md:w-56 md:flex-col"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  isActive(pathname, item.href) ? "page" : undefined
                }
                className={[
                  "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(pathname, item.href)
                    ? "bg-surface-muted text-ink-900"
                    : "text-ink-500 hover:bg-surface-muted hover:text-ink-900",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <section className="min-w-0 flex-1">{children}</section>
        </div>
      </section>
    </main>
  );
}
