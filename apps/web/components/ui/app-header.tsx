"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { type Workspace, workspaces as workspacesApi } from "@/lib/api";

import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

interface AppHeaderProps {
  user: { first_name: string; last_name: string; email: string };
  onSignOut: () => void;
  signingOut?: boolean;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Lazy-loaded list of the user's workspaces. Cached for the whole AppHeader
 * lifetime; the only mutation that invalidates this is creating a new
 * workspace, which we don't have UI for yet in V1.
 */
function useWorkspaces() {
  const [items, setItems] = useState<Workspace[] | null>(null);
  const [loading, setLoading] = useState(false);
  const requested = useRef(false);

  function load() {
    if (requested.current) return;
    requested.current = true;
    setLoading(true);
    workspacesApi
      .mine()
      .then((ws) => setItems(ws))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }
  return { items, loading, load };
}

export function AppHeader({ user, onSignOut, signingOut }: AppHeaderProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ws = useWorkspaces();

  // Load workspaces on mount so the "Tvůrce" pill in the top-right is
  // visible from the very first paint of /dashboard, not only after the
  // user opens a dropdown that triggers ws.load().
  useEffect(() => {
    ws.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <NavLink href="/dashboard" pathname={pathname}>
                Dashboard
              </NavLink>

              <NavLink href="/events" pathname={pathname}>
                Akce
              </NavLink>

              <NavDropdown
                label="Komunity"
                pathname={pathname}
                activeWhenStartsWith="/workspaces"
                onOpen={ws.load}
              >
                {ws.loading && !ws.items ? (
                  <DropdownNote>Načítám…</DropdownNote>
                ) : ws.items && ws.items.length === 0 ? (
                  <DropdownNote>Zatím žádná komunita</DropdownNote>
                ) : (
                  ws.items?.map((w) => (
                    <DropdownLink
                      key={w.slug}
                      href={`/workspaces/${w.slug}`}
                    >
                      {w.name}
                    </DropdownLink>
                  ))
                )}
                <DropdownDivider />
                <DropdownLink href="/workspaces">
                  Všechny komunity
                </DropdownLink>
              </NavDropdown>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className={[
                "hidden items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-ring sm:inline-flex",
                pathname.startsWith("/admin")
                  ? "border-brand bg-brand text-brand-ink"
                  : "border-border bg-surface text-ink-700 hover:bg-surface-muted hover:text-ink-900",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={
                  pathname.startsWith("/admin") ? "text-brand-ink" : "text-brand"
                }
                style={{ fontSize: "0.7em", lineHeight: 1 }}
              >
                ●
              </span>
              Tvůrce
            </Link>
            <UserMenu
              user={user}
              onSignOut={onSignOut}
              signingOut={signingOut}
            />
          </div>
        </div>
      </header>

      {drawerOpen && (
        <MobileDrawer
          pathname={pathname}
          workspaces={ws.items}
          onMount={ws.load}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}

function NavLink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string;
  children: React.ReactNode;
}) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-surface-muted text-ink-900"
          : "text-ink-500 hover:bg-surface-muted hover:text-ink-900",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function NavDropdown({
  label,
  pathname,
  activeWhenStartsWith,
  onOpen,
  children,
}: {
  label: string;
  pathname: string;
  activeWhenStartsWith: string;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function toggle() {
    if (!open && onOpen) onOpen();
    setOpen((o) => !o);
  }

  const active = isActive(pathname, activeWhenStartsWith);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          active || open
            ? "bg-surface-muted text-ink-900"
            : "text-ink-500 hover:bg-surface-muted hover:text-ink-900",
        ].join(" ")}
      >
        {label}
        <ChevronDown open={open} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-1 min-w-[14rem] origin-top-left overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block truncate px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900"
    >
      {children}
    </Link>
  );
}

function DropdownDivider() {
  return <div className="my-1 border-t border-border" />;
}

function DropdownNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-2 text-sm text-ink-500">{children}</p>
  );
}

function MobileDrawer({
  pathname,
  workspaces,
  onMount,
  onClose,
}: {
  pathname: string;
  workspaces: Workspace[] | null;
  onMount: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    onMount();
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
  }, [onClose, onMount]);

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

        <nav
          aria-label="Primary mobile"
          className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
        >
          <DrawerLink
            href="/dashboard"
            pathname={pathname}
            onClose={onClose}
          >
            Dashboard
          </DrawerLink>

          <DrawerSection label="Akce">
            <DrawerSubLink
              href="/events"
              pathname={pathname}
              onClose={onClose}
            >
              Moje akce
            </DrawerSubLink>
          </DrawerSection>

          <DrawerSection label="Komunity">
            {workspaces?.map((w) => (
              <DrawerSubLink
                key={w.slug}
                href={`/workspaces/${w.slug}`}
                pathname={pathname}
                onClose={onClose}
              >
                {w.name}
              </DrawerSubLink>
            ))}
            <DrawerSubLink
              href="/workspaces"
              pathname={pathname}
              onClose={onClose}
            >
              Všechny komunity
            </DrawerSubLink>
          </DrawerSection>

          <DrawerSection label="Tvůrce">
            <DrawerSubLink
              href="/admin"
              pathname={pathname}
              onClose={onClose}
            >
              Otevřít sekci tvůrce
            </DrawerSubLink>
          </DrawerSection>
        </nav>
      </div>
    </div>
  );
}

function DrawerLink({
  href,
  pathname,
  onClose,
  children,
}: {
  href: string;
  pathname: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-md px-3 py-2.5 text-sm font-medium",
        active
          ? "bg-surface-muted text-ink-900"
          : "text-ink-500 hover:bg-surface-muted hover:text-ink-900",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function DrawerSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-col">
      <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function DrawerSubLink({
  href,
  pathname,
  onClose,
  children,
}: {
  href: string;
  pathname: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-md px-3 py-2 text-sm",
        active
          ? "bg-surface-muted text-ink-900"
          : "text-ink-700 hover:bg-surface-muted hover:text-ink-900",
      ].join(" ")}
    >
      {children}
    </Link>
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

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={[
        "shrink-0 transition-transform",
        open ? "rotate-180" : "",
      ].join(" ")}
    >
      <path
        d="M5 8 L10 13 L15 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
