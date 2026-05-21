"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { ApiError, type Workspace, workspaces } from "@/lib/api";

const VISIBILITY_LABEL: Record<Workspace["visibility"], string> = {
  public: "Veřejná",
  unlisted: "Skrytá",
  private: "Soukromá",
};

/**
 * Level 1 admin view of owned workspaces — table mirrors the /admin/eventy
 * layout so the owner sees the same drilldown affordances across agendas.
 * Row hover lights up the whole line with the brand amber accent.
 */
export default function AdminKomunityTablePage() {
  const router = useRouter();
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
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/komunity");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-brand">Tvůrce</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Moje komunity
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Komunity, které spravuješ. Klikni na řádek pro detail — profil,
          akce, členy (postupně přibyde nástěnka, platby, ...).
        </p>
      </header>

      <div className="flex justify-end">
        <LinkButton href="/workspaces/new" variant="secondary" size="md">
          + Vytvořit komunitu
        </LinkButton>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {!loading && !error && (myWorkspaces?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            Zatím nemáš svoji komunitu
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Komunita je tvůj domov pro akce. Vytvoř první.
          </p>
          <div className="mt-5">
            <LinkButton href="/workspaces/new" variant="secondary" size="md">
              + Vytvořit komunitu
            </LinkButton>
          </div>
        </div>
      )}

      {!loading && (myWorkspaces?.length ?? 0) > 0 && (
        <>
          {/* Mobile: card list. The 5-column table is too wide for a
              360 px viewport and horizontal scroll defeats the
              "scan my komunity" use case. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {myWorkspaces!.map((w) => (
              <KomunityCard key={w.slug} workspace={w} />
            ))}
          </div>
          {/* sm+: full table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Komunita</th>
                  <th className="px-4 py-3">Lokalita</th>
                  <th className="px-4 py-3">Viditelnost</th>
                  <th className="px-4 py-3 text-right">Členů</th>
                  <th className="px-4 py-3 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {myWorkspaces!.map((w) => (
                  <KomunityRow key={w.slug} workspace={w} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function KomunityCard({ workspace: w }: { workspace: Workspace }) {
  const href = `/admin/komunity/${w.slug}`;
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md focus-ring"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-ink-900">{w.name}</p>
        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-500">
          {VISIBILITY_LABEL[w.visibility]}
        </span>
      </div>
      {w.bio && (
        <p className="line-clamp-2 text-xs text-ink-500">{w.bio}</p>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-500">
        {w.location && (
          <>
            <dt>Lokalita</dt>
            <dd className="truncate text-right text-ink-700">{w.location}</dd>
          </>
        )}
        <dt>Členů</dt>
        <dd className="text-right font-medium text-ink-900 tabular-nums">
          {w.member_count ?? "—"}
        </dd>
      </dl>
    </Link>
  );
}

function KomunityRow({ workspace: w }: { workspace: Workspace }) {
  const router = useRouter();
  const href = `/admin/komunity/${w.slug}`;

  function handleRowClick(e: ReactMouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, label")) return;
    router.push(href);
  }

  return (
    <tr
      onClick={handleRowClick}
      className="group cursor-pointer hover:bg-brand/10"
    >
      <td className="px-4 py-3">
        <Link
          href={href}
          className="flex flex-col gap-0.5 focus-ring"
        >
          <span className="font-medium text-ink-900">{w.name}</span>
          {w.bio && (
            <span className="line-clamp-1 text-xs text-ink-500">{w.bio}</span>
          )}
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
        {w.location || "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
        {VISIBILITY_LABEL[w.visibility]}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-700">
        {w.member_count ?? "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-300">—</td>
    </tr>
  );
}
