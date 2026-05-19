"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Builder } from "@/components/event-blocks/builder";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type Workspace,
  auth,
  events,
  workspaces,
} from "@/lib/api";
import type { EventBlock } from "@/lib/event-blocks";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

export default function EventBlocksPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [blocks, setBlocks] = useState<EventBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
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
              `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/obsah`,
            );
          }
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
        setBlocks(ev.blocks ?? []);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit/obsah`,
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

  function handleChange(next: EventBlock[]) {
    setBlocks(next);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await events.update(wsSlug, eventSlug, { blocks });
      setEvent(updated);
      setBlocks(updated.blocks ?? []);
      setDirty(false);
      setSavedAt(new Date());
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.firstFieldError();
        setError(detail ?? err.message);
      } else {
        setError("Uložení selhalo.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (!workspace || !event) {
    return error ? <Alert variant="danger">{error}</Alert> : null;
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Akce", href: "/admin/eventy" },
          {
            label: event.title,
            href: `/admin/eventy/${wsSlug}/${eventSlug}/edit`,
          },
          { label: "Obsah" },
        ]}
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Obsah stránky</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Bloky se na veřejné stránce použijí, pokud existuje alespoň jeden.
            Jinak se použije klasická struktura z editace.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton
            href={`/${wsSlug}/e/${eventSlug}`}
            variant="secondary"
            size="md"
          >
            Náhled
          </LinkButton>
        </div>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      <Builder
        blocks={blocks}
        onChange={handleChange}
        workspaceSlug={wsSlug}
        eventSlug={eventSlug}
        eventPrice={{
          amount: event.price_amount,
          currency: event.price_currency,
          note: event.price_note,
        }}
      />

      {/* Sticky save bar — only visible while there are unsaved
          changes. After a save the bar collapses; users were thinking
          the "Uloženo v hh:mm" message was a transient toast and got
          annoyed when it stuck around overlapping content (especially
          on mobile). */}
      {dirty && (
      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-md border border-border bg-canvas/95 p-3 shadow-lg backdrop-blur">
        <p className="text-sm text-ink-500">Máš neuložené změny.</p>
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={saving}
          disabled={!dirty}
          onClick={handleSave}
        >
          Uložit
        </Button>
      </div>
      )}
      {!dirty && savedAt && (
        <p className="text-center text-xs text-ink-500">
          Uloženo v {savedAt.toLocaleTimeString("cs-CZ", {
            hour: "2-digit",
            minute: "2-digit",
          })}.
        </p>
      )}
    </div>
  );
}
