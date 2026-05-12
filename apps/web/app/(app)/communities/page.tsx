"use client";

import { LinkButton } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";

export default function CommunitiesPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-10">
          <p className="text-sm font-medium text-brand">Communities</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Find your crew.
          </h1>
          <p className="mt-2 max-w-xl text-ink-500">
            Join existing communities or spin up your own. Approval-based,
            invite-only, or open — your call.
          </p>
        </header>

        <Card>
          <CardSection>
            <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
              <h2 className="text-base font-semibold text-ink-900">
                Communities are coming with Slice 3
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                Once the community shell lands, this page will list communities
                you belong to and let you discover or create new ones.
              </p>
              <LinkButton
                href="/dashboard"
                variant="secondary"
                size="md"
                className="mt-5"
              >
                Back to dashboard
              </LinkButton>
            </div>
          </CardSection>
        </Card>
      </section>
    </main>
  );
}
