"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { EventForm } from "@/components/event-form";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function NewEventPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await workspaces.detail(slug);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/communities/${slug}`);
          return;
        }
        setWorkspace(ws);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/communities");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Nepovedlo se načíst komunitu.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }

  if (error || !workspace) {
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
          <p className="text-sm font-medium text-brand">Nová akce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            Vytvoř novou akci
          </h1>
          <p className="mt-2 text-ink-500">
            Po uložení uvidíš akci na profilu komunity. Můžeš ji nechat jako
            Draft a publikovat až později.
          </p>
        </header>

        <EventForm
          workspaceSlug={slug}
          onSubmit={(payload) => events.create(slug, payload)}
          onSuccess={(event) =>
            router.push(`/${slug}/e/${event.slug}`)
          }
          submitLabel="Vytvořit akci"
        />
      </section>
    </main>
  );
}
