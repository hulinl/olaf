"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { type User, auth } from "@/lib/api";

import { Avatar } from "./avatar";
import { UserMenu } from "./user-menu";

/**
 * Auth state indicator for PUBLIC pages (marketing landing, workspace profile,
 * event landing). When logged in: renders the standard UserMenu so the
 * participant can jump to /dashboard. When anonymous: a tidy "Sign in" link.
 *
 * Public pages are otherwise pure Server Components; this is the one client
 * island they include.
 */
export function PublicAuthIndicator() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "anon" } | { kind: "auth"; user: User }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    auth
      .me()
      .then((u) => {
        if (!cancelled) setState({ kind: "auth", user: u });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "anon" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    // Reserve space so layout doesn't shift on resolve.
    return (
      <div className="inline-flex h-9 w-9 items-center justify-center">
        <Avatar firstName="" lastName="" size={36} />
      </div>
    );
  }

  if (state.kind === "anon") {
    return (
      <Link
        href="/login"
        className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
      >
        Přihlásit
      </Link>
    );
  }

  async function handleSignOut() {
    try {
      await auth.logout();
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm sm:gap-3">
      {/* Dashboard chip is hidden on the cramped mobile public header.
          UserMenu (the avatar) is the universal entry-point — opens a
          dropdown that includes "Dashboard" + sign-out. */}
      <Link
        href="/dashboard"
        className="hidden rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring sm:inline-block"
      >
        Dashboard
      </Link>
      <UserMenu user={state.user} onSignOut={handleSignOut} />
    </div>
  );
}
