"use client";

import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import {
  ApiError,
  type Community,
  type CommunityInviteResult,
  type CommunityMemberRecord,
  type Workspace,
  communities as communitiesApi,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; communitySlug: string }>;
}

const STATUS_LABELS: Record<CommunityMemberRecord["status"], string> = {
  pending: "Čeká",
  member: "Člen",
  declined: "Odmítnuto",
  removed: "Odstraněn",
};

const STATUS_TONE: Record<CommunityMemberRecord["status"], string> = {
  pending: "bg-warning/15 text-warning",
  member: "bg-success/15 text-success",
  declined: "bg-surface-muted text-ink-500",
  removed: "bg-danger-soft text-danger",
};

export default function CommunityDetailPage({ params }: Props) {
  const { slug: wsSlug, communitySlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmails, setInviteEmails] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<CommunityInviteResult | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, c, m] = await Promise.all([
          workspaces.detail(wsSlug),
          communitiesApi.detail(wsSlug, communitySlug),
          communitiesApi.members(wsSlug, communitySlug),
        ]);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          router.replace(`/workspaces/${wsSlug}`);
          return;
        }
        setWorkspace(ws);
        setCommunity(c);
        setMembers(m);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/workspaces/${wsSlug}`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wsSlug, communitySlug, router]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmails.trim()) return;
    setInviting(true);
    setError(null);
    setLastInvite(null);
    try {
      const result = await communitiesApi.invite(
        wsSlug,
        communitySlug,
        inviteEmails,
      );
      setLastInvite(result);
      setInviteEmails("");
      // Refresh full roster
      const m = await communitiesApi.members(wsSlug, communitySlug);
      setMembers(m);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Pozvánky se nepodařilo zpracovat.",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: CommunityMemberRecord) {
    if (!confirm(`Odstranit ${member.user_full_name} z komunity?`)) return;
    try {
      await communitiesApi.removeMember(wsSlug, communitySlug, member.id);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, status: "removed" } : m,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Odstranění selhalo.");
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </main>
    );
  }
  if (!workspace || !community) return null;

  const activeMembers = members.filter(
    (m) => m.status === "member" || m.status === "pending",
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-12">
        <Breadcrumbs
          items={[
            { label: "Komunity", href: "/workspaces" },
            { label: workspace.name, href: `/workspaces/${wsSlug}` },
            { label: community.name },
          ]}
        />

        <header className="mt-4 mb-8">
          <p className="text-sm font-medium text-brand">Komunita</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
            {community.name}
          </h1>
          {community.description && (
            <p className="mt-2 max-w-2xl text-ink-700">
              {community.description}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-500">
            {community.member_count} členů ·{" "}
            {community.visibility === "public"
              ? "Veřejná"
              : community.visibility === "unlisted"
                ? "Skrytá (jen odkaz)"
                : "Soukromá"}
          </p>
        </header>

        {error && (
          <div className="mb-6">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        <Card>
          <CardSection>
            <h2 className="text-base font-semibold text-ink-900">
              Přidat členy
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Vlož emaily oddělené novými řádky nebo čárkou. Účet už musí
              existovat (pozvánky pro nové uživatele jsou ve V1.5).
            </p>
            <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3">
              <textarea
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                rows={4}
                placeholder={"hulin@example.com\njana@example.com"}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
              <div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={inviting}
                >
                  Přidat
                </Button>
              </div>
            </form>
            {lastInvite && (
              <div className="mt-4 space-y-2 text-sm">
                {lastInvite.added.length > 0 && (
                  <p className="text-success">
                    Přidáno: {lastInvite.added.length}
                  </p>
                )}
                {lastInvite.skipped_already_member.length > 0 && (
                  <p className="text-ink-500">
                    Už členy:{" "}
                    {lastInvite.skipped_already_member.join(", ")}
                  </p>
                )}
                {lastInvite.no_account_yet.length > 0 && (
                  <p className="text-warning">
                    Bez účtu (V1.5): {lastInvite.no_account_yet.join(", ")}
                  </p>
                )}
              </div>
            )}
          </CardSection>
        </Card>

        <h2 className="mt-10 text-lg font-semibold text-ink-900">
          Členové ({activeMembers.length})
        </h2>
        {activeMembers.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-sm text-ink-500">
            Zatím žádní členové. Přidej někoho výše.
          </p>
        ) : (
          <Card className="mt-3">
            <ul className="divide-y divide-border">
              {activeMembers.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">
                      {m.user_full_name}
                    </p>
                    <p className="truncate text-sm text-ink-500">
                      {m.user_email}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                      STATUS_TONE[m.status],
                    ].join(" ")}
                  >
                    {STATUS_LABELS[m.status]}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(m)}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted hover:text-danger focus-ring"
                  >
                    Odebrat
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </main>
  );
}
