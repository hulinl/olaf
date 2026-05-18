"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EventForm } from "@/components/event-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

/**
 * Workspace-agnostic event creation. Auto-picks user's primary owned
 * workspace; if multiple, presents a chooser. Owner can publish the event
 * into communities afterwards from the event settings (Sdílení).
 */
export default function NewEventPage() {
  const router = useRouter();
  const [mine, setMine] = useState<Workspace[] | null>(null);
  const [chosen, setChosen] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await workspaces.mine();
        if (cancelled) return;
        const owned = ws.filter((w) => w.my_role === "owner");
        setMine(owned);
        if (owned.length === 1) setChosen(owned[0]);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/eventy/new");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Nepovedlo se načíst tvoje komunity.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const crumbs = [
    { label: "Eventy", href: "/admin/eventy" },
    { label: "Nová akce" },
  ];

  if (error) return <Alert variant="danger">{error}</Alert>;

  if (mine === null) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  if (mine.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={crumbs} />
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            Nemáš žádnou komunitu
          </h1>
          <p className="mt-2 text-ink-500">
            Akce vytváří vlastník komunity. Zatím nejsi vlastníkem žádné.
          </p>
        </header>
      </div>
    );
  }

  if (!chosen) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={crumbs} />
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            Vyber komunitu
          </h1>
          <p className="mt-2 text-ink-500">
            Pod kterou komunitou chceš akci vytvořit?
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map((w) => (
            <button
              key={w.slug}
              type="button"
              onClick={() => setChosen(w)}
              className="rounded-md border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-muted focus-ring"
            >
              <p className="font-medium text-ink-900">{w.name}</p>
              {w.location && (
                <p className="mt-1 text-sm text-ink-500">{w.location}</p>
              )}
            </button>
          ))}
        </div>
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
          Po uložení akce ji můžeš nasdílet do svých komunit. Můžeš ji
          nechat jako Draft a publikovat až později.
        </p>
      </header>

      <EventForm
        workspaceSlug={chosen.slug}
        onSubmit={(payload) => events.create(chosen.slug, payload)}
        onSuccess={(event) =>
          router.push(`/admin/eventy/${chosen.slug}/${event.slug}/edit`)
        }
        submitLabel="Vytvořit akci"
      />
    </div>
  );
}
