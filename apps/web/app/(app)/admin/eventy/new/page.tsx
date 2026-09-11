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
  // 2026-09-11: defaultně akce začíná v osobním prostoru — user říká
  // „musím vybrat defaultně nic". Community sharing přidá user
  // explicitně v EventForm dropdownu. Když se přidá community, jde do
  // sharedSlugs (a EventForm si primary přehodí přes onMoveToWorkspace
  // při odškrtnutí personal — kterou v listu ale skrýváme, tak se to
  // stane až když user vybere jinou komunitu z dropdownu).
  const [home, setHome] = useState<Workspace | null>(null);
  const [personal, setPersonal] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await workspaces.personal();
        if (cancelled) return;
        setPersonal(p);
        setHome(p);
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
        // New mode: „přesun" akce je jen client-side přepnutí primary
        // workspace v state. Backend endpoint zavoláme až při submit.
        // Vrácený tvar existuje kvůli edit-mode signatuře — new mode
        // ho ignoruje (žádný router.push, žádný fetch).
        onMoveToWorkspace={async (targetSlug) => {
          const nextHome =
            (personal?.slug === targetSlug ? personal : null) ??
            (await workspaces.detail(targetSlug).catch(() => null));
          if (nextHome) setHome(nextHome);
          return { new_workspace_slug: targetSlug, event_slug: "" };
        }}
      />
    </div>
  );
}
