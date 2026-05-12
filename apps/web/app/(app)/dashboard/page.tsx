"use client";

import { LinkButton } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
import { useUser } from "@/lib/user-context";

export default function DashboardPage() {
  const user = useUser();

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-10">
          <p className="text-sm font-medium text-brand">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Welcome, {user.first_name}.
          </h1>
          <p className="mt-2 max-w-xl text-ink-500">
            Your workspace and communities will live here. Use the menu in the
            top right to manage your profile and notification preferences.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Communities"
            value="—"
            hint="Coming with Slice 3"
          />
          <StatCard
            label="Upcoming events"
            value="—"
            hint="Coming with Slice 4"
          />
          <StatCard
            label="Pending approvals"
            value="—"
            hint="—"
          />
        </div>

        <Card className="mt-8">
          <CardSection>
            <h2 className="text-lg font-semibold text-ink-900">
              No communities yet
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Once Slice 2 lands, you&apos;ll spin up a workspace and start
              inviting members. Communities and events you join or run will
              surface here.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <LinkButton href="/communities" variant="primary" size="md">
                Browse communities
              </LinkButton>
              <LinkButton href="/events" variant="secondary" size="md">
                See events
              </LinkButton>
            </div>
          </CardSection>
        </Card>
      </section>
    </main>
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
