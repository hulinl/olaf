"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { Builder } from "@/components/event-blocks/builder";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Event as OlafEvent,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";
import type { EventBlock } from "@/lib/event-blocks";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

export default function EventBlocksPage({ params }: Props) {
  const { slug, eventSlug } = use(params);
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
        setBlocks(ev.blocks ?? []);
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

  function handleChange(next: EventBlock[]) {
    setBlocks(next);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await events.update(slug, eventSlug, { blocks });
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
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (!workspace || !event) {
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
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-12">
        <p className="text-sm text-ink-500">
          <Link
            href={`/communities/${slug}/events/${eventSlug}/edit`}
            className="hover:text-ink-900"
          >
            ← Úprava akce
          </Link>
        </p>

        <header className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand">Bloky stránky</p>
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
              href={`/${slug}/e/${eventSlug}`}
              variant="secondary"
              size="md"
            >
              Náhled
            </LinkButton>
          </div>
        </header>

        {error && (
          <div className="mb-6">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        <Builder blocks={blocks} onChange={handleChange} />

        <div className="sticky bottom-4 mt-8 flex items-center justify-between gap-3 rounded-md border border-border bg-canvas/95 p-3 backdrop-blur">
          <p className="text-sm text-ink-500">
            {dirty
              ? "Máš neuložené změny."
              : savedAt
                ? `Uloženo v ${savedAt.toLocaleTimeString("cs-CZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}.`
                : "Vše uloženo."}
          </p>
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
      </section>
    </main>
  );
}
