"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, User, auth } from "@/lib/api";

export default function DashboardPage() {
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
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/login");
          return;
        }
        if (!cancelled) setLoading(false);
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
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-12">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">OLAF</h1>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-sm text-zinc-600 underline disabled:opacity-50 dark:text-zinc-400"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>

      <section className="mx-auto mt-16 w-full max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight">
          Welcome, {user.first_name}.
        </h2>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Your workspace and communities will live here. Slice 2 wires up the
          workspace shell next.
        </p>
        <dl className="mt-8 grid gap-3 rounded-md border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Email verified</dt>
            <dd>{user.email_verified ? "Yes" : "No"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Member since</dt>
            <dd>{new Date(user.date_joined).toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
