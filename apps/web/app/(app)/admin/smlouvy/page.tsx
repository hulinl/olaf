"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type ContractTemplate,
  type Workspace,
  contracts as contractsApi,
  workspaces,
} from "@/lib/api";

/**
 * Workspace-scoped katalog šablon smluv. User vidí šablony z první
 * komunity, kterou vlastní. (V1: bez komunita-switcheru — owner
 * obvykle má jednu hlavní komunitu.)
 */
export default function SmlouvyPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [templates, setTemplates] = useState<ContractTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await workspaces.mine();
        const owned = mine.filter((w) => w.my_role === "owner");
        if (cancelled) return;
        if (owned.length === 0) {
          setError(
            "Pro správu smluv potřebuješ vlastnit alespoň jednu komunitu.",
          );
          return;
        }
        const home = owned[0];
        setWorkspace(home);
        const list = await contractsApi.listTemplates(home.slug);
        if (cancelled) return;
        setTemplates(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login?next=/admin/smlouvy");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!workspace || !templates) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand">Tvůrce</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Smlouvy
          </h1>
          <p className="mt-2 max-w-2xl text-ink-500">
            Šablony smluv pro {workspace.name}. Vytvoř šablonu (paste
            Notion URL → sync vytáhne text + ty si ho doupravíš),
            připoj ji k akci a po RSVP odejde účastníkovi e-mail
            s podpisovým linkem ze Signi.cz.
          </p>
        </div>
        <LinkButton
          href="/admin/smlouvy/sablony/new"
          variant="primary"
          size="md"
        >
          + Nová šablona
        </LinkButton>
      </header>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-12 text-center">
          <h2 className="text-base font-semibold text-ink-900">
            Zatím žádná šablona
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
            Vytvoř první šablonu smlouvy — buď ji napiš ručně, nebo
            připoj Notion URL a my ti ji sem převedeme.
          </p>
          <div className="mt-6">
            <LinkButton
              href="/admin/smlouvy/sablony/new"
              variant="primary"
              size="md"
            >
              Vytvořit první šablonu
            </LinkButton>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-brand"
            >
              <Link
                href={`/admin/smlouvy/sablony/${t.id}`}
                className="block focus-ring"
              >
                <h3 className="text-lg font-semibold text-ink-900">{t.name}</h3>
                {t.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">
                    {t.description}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                  {t.notion_url && (
                    <span className="inline-flex items-center gap-1">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 2h7l3 3v9H3V2Z"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M10 2v3h3"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Notion
                    </span>
                  )}
                  {t.last_synced_at && (
                    <span>
                      Naposled syncnuto{" "}
                      {new Date(t.last_synced_at).toLocaleDateString("cs-CZ")}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
