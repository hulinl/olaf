"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { ApiError, type Workspace, assetUrl, workspaces } from "@/lib/api";

export default function CommunitiesPage() {
  const [list, setList] = useState<Workspace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await workspaces.mine();
        if (!cancelled) setList(data);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Nepovedlo se načíst tvoje komunity.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-12">
        <header className="mb-10">
          <p className="text-sm font-medium text-brand">Komunity</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Tvoje komunity
          </h1>
          <p className="mt-2 max-w-xl text-ink-500">
            Pracovní prostory, ve kterých jsi člen nebo Owner. Klikni na
            komunitu, abys viděl její eventy a profil.
          </p>
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && !error && list !== null && list.length === 0 && (
          <Card>
            <CardSection>
              <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
                <h2 className="text-base font-semibold text-ink-900">
                  Zatím nejsi v žádné komunitě
                </h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                  Až tě někdo pozve nebo si vytvoříš vlastní workspace,
                  uvidíš ho tady.
                </p>
              </div>
            </CardSection>
          </Card>
        )}

        {!loading && list !== null && list.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((ws) => (
              <WorkspaceCard key={ws.slug} workspace={ws} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const logo = assetUrl(workspace.logo_url);
  return (
    <Link
      href={`/communities/${workspace.slug}`}
      className="group block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:shadow-md focus-ring"
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-strong"
          style={
            workspace.accent_color
              ? { backgroundColor: workspace.accent_color }
              : undefined
          }
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={`${workspace.name} logo`}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-lg font-semibold text-ink-inverse">
              {workspace.name.charAt(0)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-lg font-semibold text-ink-900">
              {workspace.name}
            </h3>
            {workspace.my_role === "owner" && (
              <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-brand-ink">
                Owner
              </span>
            )}
          </div>
          {workspace.location && (
            <p className="mt-0.5 truncate text-sm text-ink-500">
              {workspace.location}
            </p>
          )}
          {workspace.bio && (
            <p className="mt-2 line-clamp-2 text-sm text-ink-700">
              {workspace.bio}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
