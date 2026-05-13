"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { ApiError, User, auth } from "@/lib/api";
import { UserContext } from "@/lib/user-context";

/**
 * Shared layout for every authenticated page (dashboard, communities,
 * events, settings/*). Handles the auth gate, mounts AppHeader,
 * provides UserContext.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await auth.me();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          router.replace("/login");
          return;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await auth.logout();
    } finally {
      router.replace("/login");
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (!user) return null;

  return (
    <UserContext.Provider value={user}>
      <AppHeader
        user={user}
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />
      {children}
    </UserContext.Provider>
  );
}
