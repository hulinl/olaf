"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { EventDangerZone } from "@/components/event-danger-zone";
import { EventForm } from "@/components/event-form";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

export default function EditEventPage({ params }: Props) {
  const { slug, eventSlug } = use(params);
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
          workspaces.detail(slug),
          events.publicEvent(slug, eventSlug),
        ]);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/${slug}/e/${eventSlug}`);
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/communities/${slug}`);
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
  }, [slug, eventSlug, router]);

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
        <p className="text-sm text-ink-500">
          <Link
            href={`/communities/${slug}`}
            className="hover:text-ink-900"
          >
            ← {workspace.name}
          </Link>
        </p>

        <header className="mt-4 mb-8">
          <p className="text-sm font-medium text-brand">Úprava akce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            {event.title}
          </h1>
          <p className="mt-2 text-ink-500">
            Změny se projeví okamžitě po uložení.{" "}
            <Link
              href={`/${slug}/e/${eventSlug}`}
              className="underline hover:text-ink-900"
            >
              Otevřít veřejnou stránku
            </Link>
            {" · "}
            <Link
              href={`/communities/${slug}/events/${eventSlug}/rsvps`}
              className="underline hover:text-ink-900"
            >
              Přihlášení
            </Link>
          </p>
        </header>

        <EventForm
          workspaceSlug={slug}
          initial={event}
          onSubmit={(payload) => events.update(slug, eventSlug, payload)}
          onSuccess={(updated) =>
            router.push(`/${slug}/e/${updated.slug}`)
          }
          submitLabel="Uložit změny"
        />

        <div className="mt-10 border-t border-border pt-10">
          <EventDangerZone
            event={event}
            workspaceSlug={slug}
            onCancelled={(updated) => setEvent(updated)}
          />
        </div>
      </section>
    </main>
  );
}
