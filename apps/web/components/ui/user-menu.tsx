"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "./avatar";

interface UserMenuProps {
  user: { first_name: string; last_name: string; email: string };
  onSignOut: () => void;
  signingOut?: boolean;
}

/** Top-right dropdown — Profile settings / Notifications / Account / Sign out. */
export function UserMenu({ user, onSignOut, signingOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

  function close() {
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open user menu"
        className="rounded-full focus-ring transition-opacity hover:opacity-80"
      >
        <Avatar
          firstName={user.first_name}
          lastName={user.last_name}
          size={36}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 origin-top-right overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-ink-900">
              {user.first_name} {user.last_name}
            </p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
          <MenuLink href="/settings/profile" onClick={close}>
            Profile settings
          </MenuLink>
          <MenuLink href="/settings/notifications" onClick={close}>
            Notifications
          </MenuLink>
          <MenuLink href="/settings/account" onClick={close}>
            Account
          </MenuLink>
          <div className="border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onSignOut();
            }}
            disabled={signingOut}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="block px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900"
    >
      {children}
    </Link>
  );
}
