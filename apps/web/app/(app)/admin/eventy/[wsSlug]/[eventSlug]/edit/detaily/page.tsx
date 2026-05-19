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
  auth,
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
          try {
            await auth.me();
            router.replace(`/${wsSlug}/e/${eventSlug}`);
          } catch {
            router.replace(
              `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/detaily`,
            );
          }
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/detaily`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/eventy");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Něco se pokazilo.");
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
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!workspace || !event) return null;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Akce", href: "/admin/eventy" },
          {
            label: event.title,
            href: `/admin/eventy/${wsSlug}/${eventSlug}/edit`,
          },
          { label: "Detaily" },
        ]}
      />

      <header>
        <p className="text-sm font-medium text-brand">Úprava detailů</p>
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
          router.push(`/admin/eventy/${wsSlug}/${updated.slug}/edit`)
        }
        submitLabel="Uložit změny"
      />
    </div>
  );
}
