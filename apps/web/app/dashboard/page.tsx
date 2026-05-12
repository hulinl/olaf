"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { LinkButton } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
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
    <>
      <AppHeader
        user={user}
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
          <header className="mb-10">
            <p className="text-sm font-medium text-brand">Dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Welcome, {user.first_name}.
            </h1>
            <p className="mt-2 max-w-xl text-ink-500">
              Your workspace and communities will live here. Next slice wires
              up the workspace shell.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Communities" value="—" hint="Coming in Slice 3" />
            <StatCard
              label="Upcoming events"
              value="—"
              hint="Coming in Slice 4"
            />
            <StatCard label="Pending approvals" value="—" hint="—" />
          </div>

          <Card className="mt-8">
            <CardSection>
              <h2 className="text-lg font-semibold text-ink-900">
                Your account
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Profile editing lands in the settings slice. For now, here's
                what we have.
              </p>
              <dl className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Row label="Email" value={user.email} />
                <Row
                  label="Email verified"
                  value={user.email_verified ? "Yes" : "No"}
                />
                <Row label="Full name" value={user.full_name} />
                <Row
                  label="Member since"
                  value={new Date(user.date_joined).toLocaleDateString()}
                />
              </dl>
            </CardSection>
          </Card>

          <div className="mt-10 rounded-lg border border-dashed border-border-strong bg-surface-muted/50 p-8 text-center">
            <h3 className="text-base font-semibold text-ink-900">
              No communities yet
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              Once Slice 2 lands, you'll be able to spin up a workspace and
              start inviting members.
            </p>
            <LinkButton
              href="/dashboard"
              variant="secondary"
              size="md"
              className="mt-4"
            >
              View roadmap
            </LinkButton>
          </div>
        </section>
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardSection>
        <p className="text-sm font-medium text-ink-500">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-ink-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      </CardSection>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}
