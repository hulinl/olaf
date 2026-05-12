import Link from "next/link";

import { Logo } from "./logo";

interface AppHeaderProps {
  user?: { first_name: string; email: string };
  onSignOut?: () => void;
  signingOut?: boolean;
}

/**
 * Top nav for authenticated pages. Logo on the left,
 * user identity + sign-out on the right.
 */
export function AppHeader({ user, onSignOut, signingOut }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/dashboard"
          className="text-ink-900 transition-opacity hover:opacity-80"
        >
          <Logo size={26} />
        </Link>
        {user && onSignOut && (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-500 sm:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="rounded-md px-3 py-1.5 font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 disabled:opacity-50 focus-ring"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
