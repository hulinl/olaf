import Link from "next/link";
import { ReactNode } from "react";

import { Logo } from "./logo";

interface AuthShellProps {
  children: ReactNode;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
}

/**
 * Centered card layout shared by all auth pages (signup, login, verify,
 * forgot/reset password). Keeps the visual rhythm consistent.
 */
export function AuthShell({
  children,
  title,
  subtitle,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
          >
            <Logo size={32} />
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-surface p-8 shadow-md">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
            )}
          </header>
          {children}
        </div>

        {footer && (
          <p className="mt-6 text-center text-sm text-ink-500">{footer}</p>
        )}
      </div>
    </main>
  );
}
