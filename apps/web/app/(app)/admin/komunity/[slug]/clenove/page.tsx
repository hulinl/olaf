"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, use, useEffect, useState } from "react";

import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type Workspace,
  type WorkspaceMemberSummary,
  type WorkspaceRole,
  workspaces,
} from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Members of a komunita — V1 definition: anyone who's registered for at
 * least one event in this workspace (owned or shared). Useful for the
 * owner to see who's engaged and click through to a profile.
 *
 * Owner-only — the endpoint returns email + phone.
 */
export default function KomunityMembersPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [members, setMembers] = useState<WorkspaceMemberSummary[] | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([workspaces.members(slug), workspaces.detail(slug)])
      .then(([list, ws]) => {
        if (cancelled) return;
        setMembers(list);
        setWorkspace(ws);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/admin/komunity/${slug}/clenove`);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          router.replace(`/admin/komunity/${slug}`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/komunity");
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
  }, [slug, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!members) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/komunity/${slug}`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na komunitu
      </Link>

      <header>
        <p className="text-sm font-medium text-brand">Členové</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Členové komunity
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Lidi, kteří se přihlásili na alespoň jednu akci této komunity.
          Klikni na řádek pro profil + historii registrací.
        </p>
      </header>

      {members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
          <h3 className="text-base font-semibold text-ink-900">
            Zatím žádní členové
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Jakmile se někdo přihlásí na akci, objeví se tady.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Člen</th>
                <th className="px-4 py-3">Kontakt</th>
                <th className="px-4 py-3 text-right">Celkem akcí</th>
                <th className="px-4 py-3 text-right">Nadcházejících</th>
                <th className="px-4 py-3 text-right">Minulých</th>
                <th className="px-4 py-3">Poslední přihláška</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  wsSlug={slug}
                  iAmSuperAdmin={workspace?.my_role === "owner"}
                  onRoleChange={(role) =>
                    setMembers((prev) =>
                      prev
                        ? prev.map((x) =>
                            x.id === m.id ? { ...x, role } : x,
                          )
                        : prev,
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  wsSlug,
  iAmSuperAdmin,
  onRoleChange,
}: {
  member: WorkspaceMemberSummary;
  wsSlug: string;
  iAmSuperAdmin: boolean;
  onRoleChange: (role: WorkspaceRole) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const href = `/admin/komunity/${wsSlug}/clenove/${member.id}`;
  const lastAt = member.last_rsvp_at ? new Date(member.last_rsvp_at) : null;

  function handleRowClick(e: ReactMouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, label")) return;
    router.push(href);
  }

  async function handlePromote() {
    setBusy(true);
    try {
      const r = await workspaces.promoteMember(wsSlug, member.id);
      onRoleChange(r.role);
    } catch {
      /* keep silent */
    } finally {
      setBusy(false);
    }
  }
  async function handleDemote() {
    if (!confirm(`Snížit ${member.full_name || member.email} na běžného člena?`))
      return;
    setBusy(true);
    try {
      const r = await workspaces.demoteMember(wsSlug, member.id);
      onRoleChange(r.role);
    } catch {
      /* keep silent */
    } finally {
      setBusy(false);
    }
  }
  async function handleHandover() {
    const ok = confirm(
      `Předat vlastnictví komunity uživateli ${member.full_name || member.email}?\n\n` +
        "Ty se staneš adminem a ztratíš právo mazat komunitu nebo měnit role. " +
        "Nový vlastník ti to může vrátit, ale nemusí.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await workspaces.handoverOwnership(wsSlug, member.id);
      // Reload the page — my_role just flipped, so the whole UI
      // (sidebar gates, action buttons) needs to re-evaluate.
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <tr
      onClick={handleRowClick}
      className="group cursor-pointer hover:bg-brand/10"
    >
      <td className="px-4 py-3">
        <Link href={href} className="flex flex-col focus-ring">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-ink-900">
              {member.full_name || "—"}
            </span>
            {member.role === "owner" && (
              <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                Owner
              </span>
            )}
            {member.role === "admin" && (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                Admin
              </span>
            )}
          </div>
          <span className="text-xs text-ink-500">{member.email}</span>
          {iAmSuperAdmin && member.role !== "owner" && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
              {member.role === "admin" ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleHandover();
                    }}
                    disabled={busy}
                    className="text-[11px] font-medium text-brand hover:underline disabled:opacity-50"
                  >
                    {busy ? "..." : "Předat vlastnictví"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDemote();
                    }}
                    disabled={busy}
                    className="text-[11px] font-medium text-ink-500 hover:text-danger disabled:opacity-50"
                  >
                    {busy ? "..." : "Snížit"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePromote();
                  }}
                  disabled={busy}
                  className="text-[11px] font-medium text-brand hover:underline disabled:opacity-50"
                >
                  {busy ? "..." : "Povýšit na admina"}
                </button>
              )}
            </div>
          )}
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
        {member.phone || "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink-900">
        {member.total_rsvps}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-700">
        {member.upcoming_rsvps > 0 ? member.upcoming_rsvps : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-700">
        {member.past_rsvps > 0 ? member.past_rsvps : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-500">
        {lastAt
          ? lastAt.toLocaleDateString("cs-CZ", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </td>
    </tr>
  );
}
