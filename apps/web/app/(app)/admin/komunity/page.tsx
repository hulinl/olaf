"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { ApiError, type Workspace, workspaces } from "@/lib/api";

export default function AdminKomunityPage() {
  const [myWorkspaces, setMyWorkspaces] = useState<Workspace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaces
      .mine()
      .then((ws) => {
        if (!cancelled) setMyWorkspaces(ws.filter((w) => w.my_role === "owner"));
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Správce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Moje komunity
          </h1>
          <p className="mt-2 max-w-2xl text-ink-500">
            Komunity, které spravuješ. Klikni pro detail — profil, akce,
            členy (a postupně přibydou další agendy: nástěnka, platby, …).
          </p>
        </div>
        <LinkButton href="/workspaces/new" variant="primary" size="md">
          + Vytvořit komunitu
        </LinkButton>
      </header>

      {loading && (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {!loading && !error && (myWorkspaces?.length ?? 0) === 0 && (
        <Card>
          <CardSection>
            <div className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-8 text-center">
              <h3 className="text-base font-semibold text-ink-900">
                Zatím nemáš svoji komunitu
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                Komunita je tvůj domov pro akce. Vytvoř první.
              </p>
              <div className="mt-5">
                <LinkButton href="/workspaces/new" variant="primary" size="md">
                  + Vytvořit komunitu
                </LinkButton>
              </div>
            </div>
          </CardSection>
        </Card>
      )}

      {!loading && (myWorkspaces?.length ?? 0) > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {myWorkspaces!.map((w) => (
            <Link
              key={w.slug}
              href={`/workspaces/${w.slug}`}
              className="block rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md focus-ring"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold text-ink-900">
                  {w.name}
                </h3>
                <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-brand-ink">
                  Owner
                </span>
              </div>
              {w.location && (
                <p className="mt-1 text-sm text-ink-500">{w.location}</p>
              )}
              {w.bio && (
                <p className="mt-3 line-clamp-2 text-sm text-ink-700">
                  {w.bio}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
