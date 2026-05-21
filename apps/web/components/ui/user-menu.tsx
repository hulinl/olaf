"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "./avatar";

interface ProfileCompletion {
  is_complete: boolean;
  missing: { key: string; label: string }[];
}

interface UserMenuProps {
  user: {
    first_name: string;
    last_name: string;
    email: string;
    profile_completion?: ProfileCompletion;
  };
  onSignOut: () => void;
  signingOut?: boolean;
}

/** Top-right dropdown — Profile settings / Notifications / Account / Sign out.
 *
 *  Renders a small amber "!" dot on the avatar when the user's profile
 *  is missing the V1 required fields (name / phone / address). The
 *  dot is decorative — actually fixing the profile means opening the
 *  menu and tapping "Profile settings", where the same shortfall is
 *  surfaced as a banner. */
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
        aria-label={
          user.profile_completion && !user.profile_completion.is_complete
            ? "Open user menu (profile incomplete)"
            : "Open user menu"
        }
        className="relative rounded-full focus-ring transition-opacity hover:opacity-80"
      >
        <Avatar
          firstName={user.first_name}
          lastName={user.last_name}
          size={36}
        />
        {user.profile_completion &&
          !user.profile_completion.is_complete && (
            <span
              aria-hidden
              title="Doplň profil"
              className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-canvas bg-warning text-[9px] font-bold text-ink-900"
            >
              !
            </span>
          )}
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
          {user.profile_completion &&
            !user.profile_completion.is_complete && (
              <Link
                href="/settings/profile"
                role="menuitem"
                onClick={close}
                className="flex items-baseline gap-2 border-b border-border bg-warning/10 px-4 py-2.5 text-xs font-medium text-ink-900 transition-colors hover:bg-warning/15"
              >
                <span aria-hidden className="text-warning">
                  !
                </span>
                <span>
                  Doplň profil — chybí{" "}
                  {user.profile_completion.missing
                    .map((m) => m.label.toLowerCase())
                    .join(", ")}
                  .
                </span>
              </Link>
            )}
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
