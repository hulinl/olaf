"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { EventForm } from "@/components/event-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

export default function EditEventPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev] = await Promise.all([
          workspaces.detail(wsSlug),
          events.publicEvent(wsSlug, eventSlug),
        ]);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/${wsSlug}/e/${eventSlug}`);
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/events");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Něco se pokazilo.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wsSlug, eventSlug, router]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (error || !workspace || !event) {
    return (
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-4 py-10">
          {error && <Alert variant="danger">{error}</Alert>}
        </section>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-12">
        <Breadcrumbs
          items={[
            { label: "Akce", href: "/events" },
            {
              label: event.title,
              href: `/events/${wsSlug}/${eventSlug}`,
            },
            { label: "Úprava" },
          ]}
        />

        <header className="mt-4 mb-8">
          <p className="text-sm font-medium text-brand">Úprava akce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            {event.title}
          </h1>
          <p className="mt-2 text-ink-500">
            Změny se projeví okamžitě po uložení.
          </p>
        </header>

        <EventForm
          workspaceSlug={wsSlug}
          initial={event}
          onSubmit={(payload) => events.update(wsSlug, eventSlug, payload)}
          onSuccess={(updated) =>
            router.push(`/events/${wsSlug}/${updated.slug}`)
          }
          submitLabel="Uložit změny"
        />
      </section>
    </main>
  );
}
