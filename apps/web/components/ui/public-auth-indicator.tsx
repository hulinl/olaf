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
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/login"
          className="rounded-md px-3 py-1.5 font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
        >
          Přihlásit
        </Link>
        <Link
          href="/signup"
          className="inline-flex h-9 items-center justify-center rounded-md bg-ink-900 px-3 text-xs font-medium text-ink-inverse hover:bg-ink-700 focus-ring"
        >
          Vytvořit účet
        </Link>
      </div>
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
    <div className="flex items-center gap-3 text-sm">
      <Link
        href="/dashboard"
        className="hidden text-ink-700 hover:text-ink-900 sm:inline"
      >
        Můj dashboard
      </Link>
      <UserMenu user={state.user} onSignOut={handleSignOut} />
    </div>
  );
}
