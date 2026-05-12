"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

interface AppHeaderProps {
  user: { first_name: string; last_name: string; email: string };
  onSignOut: () => void;
  signingOut?: boolean;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/communities", label: "Communities" },
  { href: "/events", label: "Events" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppHeader({ user, onSignOut, signingOut }: AppHeaderProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring sm:hidden"
            >
              <HamburgerIcon />
            </button>

            <Link
              href="/dashboard"
              className="ml-1 text-ink-900 transition-opacity hover:opacity-80 sm:ml-0"
              aria-label="olaf — dashboard"
            >
              <Logo size={26} />
            </Link>

            <nav
              aria-label="Primary"
              className="ml-6 hidden items-center gap-1 sm:flex"
            >
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={[
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive(pathname, item.href)
                      ? "bg-surface-muted text-ink-900"
                      : "text-ink-500 hover:bg-surface-muted hover:text-ink-900",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <UserMenu
            user={user}
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
        </div>
      </header>

      {drawerOpen && (
        <MobileDrawer
          pathname={pathname}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}

function MobileDrawer({
  pathname,
  onClose,
}: {
  pathname: string;
  onClose: () => void;
}) {
  // Lock body scroll while drawer is open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 sm:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-canvas shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <Logo size={24} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            <CloseIcon />
          </button>
        </div>
        <nav aria-label="Primary mobile" className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={[
                "rounded-md px-3 py-2.5 text-sm font-medium",
                isActive(pathname, item.href)
                  ? "bg-surface-muted text-ink-900"
                  : "text-ink-500 hover:bg-surface-muted hover:text-ink-900",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 5 H17 M3 10 H17 M3 15 H17"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 5 L15 15 M15 5 L5 15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
