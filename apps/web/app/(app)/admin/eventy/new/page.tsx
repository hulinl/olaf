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
 * New-event flow. Event is first-class — the user doesn't need a community
 * to create one. Backend lazy-creates a personal workspace ("Můj prostor")
 * the first time the user lands here; the event drops into it by default.
 *
 * If the user also owns one or more communities (workspaces), we surface a
 * "Vytvořit pod" dropdown so they can pick a community as the event's home
 * — and the EventForm's "Sdílet do komunit" picker lets them publish into
 * additional communities afterwards.
 */
export default function NewEventPage() {
  const router = useRouter();
  const [personal, setPersonal] = useState<Workspace | null>(null);
  const [communities, setCommunities] = useState<Workspace[]>([]);
  const [chosenSlug, setChosenSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Personal workspace is lazy-created on first call — safe to
        // fire unconditionally on every visit.
        const [p, mine] = await Promise.all([
          workspaces.personal(),
          workspaces.mine(),
        ]);
        if (cancelled) return;
        setPersonal(p);
        const ownedCommunities = mine.filter((w) => w.my_role === "owner");
        setCommunities(ownedCommunities);
        // Default: personal workspace. Owner can switch via dropdown if
        // they want the event homed under a community instead.
        setChosenSlug(p.slug);
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
  if (!personal || !chosenSlug) {
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
          Akce má vlastní stránku a registrace. Pokud chceš, můžeš ji
          publikovat i do svých komunit níže ve formuláři.
        </p>
      </header>

      {communities.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Vytvořit pod
          </p>
          <div className="flex flex-wrap gap-2">
            <HomeChip
              label="Můj prostor"
              hint="Akce mimo komunitu"
              slug={personal.slug}
              active={chosenSlug === personal.slug}
              onSelect={setChosenSlug}
            />
            {communities.map((w) => (
              <HomeChip
                key={w.slug}
                label={w.name}
                hint="Akce komunity"
                slug={w.slug}
                active={chosenSlug === w.slug}
                onSelect={setChosenSlug}
              />
            ))}
          </div>
        </div>
      )}

      <EventForm
        workspaceSlug={chosenSlug}
        onSubmit={(payload) => events.create(chosenSlug, payload)}
        onSuccess={(event) =>
          router.push(`/admin/eventy/${chosenSlug}/${event.slug}/edit`)
        }
        submitLabel="Vytvořit akci"
      />
    </div>
  );
}

function HomeChip({
  label,
  hint,
  slug,
  active,
  onSelect,
}: {
  label: string;
  hint: string;
  slug: string;
  active: boolean;
  onSelect: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slug)}
      aria-pressed={active}
      className={[
        "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors focus-ring",
        active
          ? "border-brand bg-brand/5 text-ink-900 ring-1 ring-brand/40"
          : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
      ].join(" ")}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] text-ink-500">{hint}</span>
    </button>
  );
}
