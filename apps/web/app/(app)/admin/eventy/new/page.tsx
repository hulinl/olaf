"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EventForm } from "@/components/event-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/card";
import { ApiError, type Workspace, events, workspaces } from "@/lib/api";

/**
 * New-event flow. Event is first-class — the user doesn't need a community
 * to create one. We pick the primary home automatically:
 *   - 0 owned communities → personal workspace (lazy-created on demand)
 *   - 1+ owned communities → the first one, alphabetically
 * The "Sdílet do komunit" multi-select inside EventForm covers any extra
 * communities the user wants to publish into. Removing the "Vytvořit pod"
 * picker that used to live here — it was a confusing extra decision for
 * the common case (single community owner).
 */
export default function NewEventPage() {
  const router = useRouter();
  const [home, setHome] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await workspaces.mine();
        const owned = mine.filter((w) => w.my_role === "owner");
        if (cancelled) return;
        if (owned.length > 0) {
          // Sorted by name by the API; pick the first.
          setHome(owned[0]);
        } else {
          // No community → fall back to the lazy personal workspace.
          const p = await workspaces.personal();
          if (cancelled) return;
          setHome(p);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/eventy/new");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Nepovedlo se připravit novou akci.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const crumbs = [
    { label: "Akce", href: "/admin/eventy" },
    { label: "Nová akce" },
  ];

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!home) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={crumbs} />

      <header>
        <p className="text-sm font-medium text-brand">Nová akce</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          Vytvoř novou akci
        </h1>
        <p className="mt-2 text-ink-500">
          Akce má vlastní stránku a registrace. Pokud chceš, ve formuláři
          níže si vyber komunity, kam ji chceš taky publikovat.
        </p>
      </header>

      <EventForm
        workspaceSlug={home.slug}
        onSubmit={(payload) => events.create(home.slug, payload)}
        onSuccess={(event) =>
          router.push(`/admin/eventy/${home.slug}/${event.slug}/edit`)
        }
        submitLabel="Vytvořit akci"
      />
    </div>
  );
}
