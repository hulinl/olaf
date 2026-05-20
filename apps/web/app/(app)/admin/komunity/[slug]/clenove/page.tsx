"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type MouseEvent as ReactMouseEvent,
  use,
  useEffect,
  useState,
} from "react";

import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type PersonTag,
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
 * least one event in this workspace (owned or shared) OR carries an
 * explicit role. The owner uses this page as a CRM: poznámky, tagy,
 * CSV export.
 */
export default function KomunityMembersPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [members, setMembers] = useState<WorkspaceMemberSummary[] | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tags, setTags] = useState<PersonTag[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [filterTagIds, setFilterTagIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      workspaces.members(slug),
      workspaces.detail(slug),
      workspaces.listTags(slug).catch(() => []),
    ])
      .then(([list, ws, t]) => {
        if (cancelled) return;
        setMembers(list);
        setWorkspace(ws);
        setTags(t);
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

  function patchMember(memberId: number, patch: Partial<WorkspaceMemberSummary>) {
    setMembers((prev) =>
      prev ? prev.map((m) => (m.id === memberId ? { ...m, ...patch } : m)) : prev,
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!members || !tags) return null;

  const isOwner = workspace?.my_role === "owner";
  const isOwnerOrAdmin =
    workspace?.my_role === "owner" || workspace?.my_role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/komunity/${slug}`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na komunitu
      </Link>

      <header className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Členové</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Členové komunity
          </h1>
          <p className="mt-2 max-w-2xl text-ink-500">
            Lidi, kteří se přihlásili na alespoň jednu akci této komunity.
            Klikni na řádek pro profil + historii registrací; pravým
            sloupcem můžeš přiřadit tagy a napsat si poznámku.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwnerOrAdmin && (
            <button
              type="button"
              onClick={() => setTagManagerOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
            >
              Spravovat tagy ({tags.length})
            </button>
          )}
          <a
            href={workspaces.membersCsvUrl(slug)}
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            Export CSV ↓
          </a>
        </div>
      </header>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Filtr
          </span>
          {tags.map((t) => {
            const on = filterTagIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setFilterTagIds((prev) => {
                    const next = new Set(prev);
                    if (on) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  });
                }}
                className={[
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  on
                    ? "border-brand bg-brand/15 text-brand"
                    : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
                ].join(" ")}
                style={
                  on && t.color
                    ? { borderColor: t.color, color: t.color }
                    : undefined
                }
              >
                {on && <span aria-hidden>✓</span>}
                {t.name}
              </button>
            );
          })}
          {filterTagIds.size > 0 && (
            <button
              type="button"
              onClick={() => setFilterTagIds(new Set())}
              className="text-xs font-medium text-ink-500 hover:text-ink-900"
            >
              Vymazat filtr
            </button>
          )}
        </div>
      )}

      {(() => {
        // OR-mode filter: a person stays if they carry ANY of the chosen
        // tags. Most natural fit for "show me everyone tagged Stálice or
        // Beskydy core" workflows.
        const filtered =
          filterTagIds.size === 0
            ? members
            : members.filter((m) =>
                (m.tag_ids ?? []).some((id) => filterTagIds.has(id)),
              );

        async function bulkToggle(tagId: number) {
          // Snapshot current members so TS narrowing survives across
          // awaits inside this async closure.
          const snapshot = members ?? [];
          const ids = [...selectedIds];
          if (ids.length === 0) return;
          // Apply if ANY selected member doesn't have the tag yet —
          // otherwise detach. Mirrors the gmail "apply label" semantics.
          const someoneMissing = ids.some(
            (id) =>
              !(snapshot.find((m) => m.id === id)?.tag_ids ?? []).includes(
                tagId,
              ),
          );
          setBulkBusy(true);
          try {
            for (const memberId of ids) {
              const m = snapshot.find((x) => x.id === memberId);
              if (!m) continue;
              const has = (m.tag_ids ?? []).includes(tagId);
              if (someoneMissing && !has) {
                const r = await workspaces.attachMemberTag(
                  slug,
                  memberId,
                  tagId,
                );
                patchMember(memberId, { tag_ids: r.tag_ids });
              } else if (!someoneMissing && has) {
                const r = await workspaces.detachMemberTag(
                  slug,
                  memberId,
                  tagId,
                );
                patchMember(memberId, { tag_ids: r.tag_ids });
              }
            }
          } finally {
            setBulkBusy(false);
          }
        }

        return (
          <>
            {selectedIds.size > 0 && (
              <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 shadow-sm">
                <span className="text-xs font-medium text-brand">
                  {selectedIds.size} vybráno
                </span>
                {tags.length > 0 && (
                  <>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                      Tagy
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => bulkToggle(t.id)}
                          disabled={bulkBusy}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-50"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setBulkEmailOpen(true)}
                  disabled={bulkBusy}
                  className="rounded-md border border-brand bg-brand px-3 py-1 text-xs font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50"
                >
                  ✉ Odeslat e-mail
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-xs font-medium text-ink-500 hover:text-ink-900"
                >
                  Zrušit výběr
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
                <h3 className="text-base font-semibold text-ink-900">
                  {members.length === 0
                    ? "Zatím žádní členové"
                    : "Žádné lidi v aktivním filtru"}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                  {members.length === 0
                    ? "Jakmile se někdo přihlásí na akci, objeví se tady."
                    : "Zruš filtr nahoře nebo zvol jiný tag."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted/60">
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                      <th className="w-8 px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label="Vybrat vše"
                          checked={
                            filtered.length > 0 &&
                            filtered.every((m) => selectedIds.has(m.id))
                          }
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) {
                                filtered.forEach((m) => next.add(m.id));
                              } else {
                                filtered.forEach((m) => next.delete(m.id));
                              }
                              return next;
                            });
                          }}
                        />
                      </th>
                      <th className="px-4 py-3">Člen</th>
                      <th className="px-4 py-3">Kontakt</th>
                      <th className="px-4 py-3">Tagy</th>
                      <th className="px-4 py-3 text-right">Celkem</th>
                      <th className="px-4 py-3 text-right">Nadch.</th>
                      <th className="px-4 py-3 text-right">Min.</th>
                      <th className="px-4 py-3">Poslední</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((m) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        wsSlug={slug}
                        tags={tags}
                        iAmSuperAdmin={isOwner}
                        expanded={expandedRowId === m.id}
                        onToggleExpand={() =>
                          setExpandedRowId(
                            expandedRowId === m.id ? null : m.id,
                          )
                        }
                        onPatch={(patch) => patchMember(m.id, patch)}
                        selected={selectedIds.has(m.id)}
                        onToggleSelected={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      })()}

      {tagManagerOpen && (
        <TagManageDialog
          wsSlug={slug}
          tags={tags}
          onChange={(next) => setTags(next)}
          onClose={() => setTagManagerOpen(false)}
        />
      )}

      {bulkEmailOpen && (
        <BulkEmailDialog
          wsSlug={slug}
          recipients={(members ?? []).filter((m) =>
            selectedIds.has(m.id),
          )}
          onClose={() => setBulkEmailOpen(false)}
          onSent={() => {
            setBulkEmailOpen(false);
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  wsSlug,
  tags,
  iAmSuperAdmin,
  expanded,
  onToggleExpand,
  onPatch,
  selected,
  onToggleSelected,
}: {
  member: WorkspaceMemberSummary;
  wsSlug: string;
  tags: PersonTag[];
  iAmSuperAdmin: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: Partial<WorkspaceMemberSummary>) => void;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const profileHref = `/admin/komunity/${wsSlug}/clenove/${member.id}`;
  const lastAt = member.last_rsvp_at ? new Date(member.last_rsvp_at) : null;
  const memberTagIds = new Set(member.tag_ids ?? []);
  const memberTags = tags.filter((t) => memberTagIds.has(t.id));
  const hasNote = Boolean((member.note ?? "").trim());

  function openProfileFromRowClick(e: ReactMouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    // Keep row-click → profile, but don't hijack clicks inside the CRM
    // controls (tag chips, expand toggle, role buttons).
    if (target.closest("a, button, input, label, select, textarea")) return;
    router.push(profileHref);
  }

  async function handlePromote() {
    setBusy(true);
    try {
      const r = await workspaces.promoteMember(wsSlug, member.id);
      onPatch({ role: r.role });
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
      onPatch({ role: r.role });
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
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <tr
        onClick={openProfileFromRowClick}
        className={[
          "group cursor-pointer hover:bg-brand/10",
          selected ? "bg-brand/5" : "",
        ].join(" ")}
      >
        <td className="px-3 py-3 align-top">
          <input
            type="checkbox"
            aria-label={`Vybrat ${member.full_name || member.email}`}
            checked={selected}
            onChange={onToggleSelected}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        <td className="px-4 py-3">
          <Link href={profileHref} className="flex flex-col focus-ring">
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
        <td className="px-4 py-3">
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {memberTags.length === 0 ? (
              <span className="text-xs text-ink-300">—</span>
            ) : (
              memberTags.map((t) => <TagChip key={t.id} tag={t} />)
            )}
          </div>
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
        <td className="whitespace-nowrap px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggleExpand}
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-surface-muted hover:text-ink-900 focus-ring",
              hasNote ? "ring-1 ring-brand/40" : "",
            ].join(" ")}
            title={
              expanded
                ? "Skrýt editor tagů + poznámky"
                : hasNote
                  ? "Upravit tagy / poznámku (poznámka uložená)"
                  : "Upravit tagy / poznámku"
            }
            aria-label="Tagy a poznámka"
          >
            {hasNote ? "●" : "+"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-surface-muted/40">
          <td colSpan={9} className="px-4 py-3">
            <MemberCrmEditor
              member={member}
              wsSlug={wsSlug}
              tags={tags}
              onPatch={onPatch}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline CRM editor (tags + note)
// ---------------------------------------------------------------------------

function MemberCrmEditor({
  member,
  wsSlug,
  tags,
  onPatch,
}: {
  member: WorkspaceMemberSummary;
  wsSlug: string;
  tags: PersonTag[];
  onPatch: (patch: Partial<WorkspaceMemberSummary>) => void;
}) {
  const [note, setNote] = useState(member.note ?? "");
  const [busy, setBusy] = useState(false);
  const memberTagIds = new Set(member.tag_ids ?? []);

  async function toggleTag(tagId: number) {
    const already = memberTagIds.has(tagId);
    try {
      const r = already
        ? await workspaces.detachMemberTag(wsSlug, member.id, tagId)
        : await workspaces.attachMemberTag(wsSlug, member.id, tagId);
      onPatch({ tag_ids: r.tag_ids });
    } catch {
      /* keep silent */
    }
  }

  async function saveNote() {
    setBusy(true);
    try {
      const r = await workspaces.setMemberNote(wsSlug, member.id, note);
      onPatch({ note: r.note });
    } catch {
      /* keep silent */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Tagy
        </p>
        {tags.length === 0 ? (
          <p className="text-xs text-ink-500">
            Žádné tagy zatím nejsou — vytvoř je tlačítkem „Spravovat tagy"
            nahoře.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = memberTagIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-brand bg-brand/15 text-brand"
                      : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
                  ].join(" ")}
                  style={
                    on && t.color
                      ? { borderColor: t.color, color: t.color }
                      : undefined
                  }
                >
                  <span aria-hidden>{on ? "✓" : "+"}</span>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Poznámka
        </p>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Cokoli užitečného — co řešili, kdo doporučil, alergie, atd."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveNote}
            disabled={busy || note === (member.note ?? "")}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-ink hover:opacity-90 disabled:opacity-50 focus-ring"
          >
            {busy ? "Ukládám…" : "Uložit poznámku"}
          </button>
          {note !== (member.note ?? "") && (
            <span className="text-xs text-ink-500">Neuložené změny</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag CRUD dialog
// ---------------------------------------------------------------------------

function TagManageDialog({
  wsSlug,
  tags,
  onChange,
  onClose,
}: {
  wsSlug: string;
  tags: PersonTag[];
  onChange: (next: PersonTag[]) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const n = newName.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const t = await workspaces.createTag(wsSlug, {
        name: n,
        color: newColor.trim(),
      });
      onChange([...tags.filter((x) => x.id !== t.id), t].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      ));
      setNewName("");
      setNewColor("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Vytvoření selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(t: PersonTag, name: string) {
    try {
      const updated = await workspaces.updateTag(wsSlug, t.id, { name });
      onChange(tags.map((x) => (x.id === t.id ? updated : x)));
    } catch {
      /* keep silent */
    }
  }

  async function recolor(t: PersonTag, color: string) {
    try {
      const updated = await workspaces.updateTag(wsSlug, t.id, { color });
      onChange(tags.map((x) => (x.id === t.id ? updated : x)));
    } catch {
      /* keep silent */
    }
  }

  async function remove(t: PersonTag) {
    if (
      !confirm(
        `Smazat tag „${t.name}"? Odebere se ze všech lidí, ale samotní lidi zůstanou.`,
      )
    )
      return;
    try {
      await workspaces.deleteTag(wsSlug, t.id);
      onChange(tags.filter((x) => x.id !== t.id));
    } catch {
      /* keep silent */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-900">Spravovat tagy</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-ink-500 hover:text-ink-900"
          >
            Zavřít ×
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {tags.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
              Žádné tagy. Vytvoř první níže.
            </p>
          ) : (
            tags.map((t) => (
              <TagEditorRow
                key={t.id}
                tag={t}
                onRename={(name) => rename(t, name)}
                onRecolor={(color) => recolor(t, color)}
                onDelete={() => remove(t)}
              />
            ))
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Nový tag
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="např. Stálice"
              maxLength={40}
              className="flex-1 min-w-[150px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
            />
            <input
              type="text"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              placeholder="#22c55e"
              maxLength={20}
              className="w-28 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
            />
            <button
              type="button"
              onClick={create}
              disabled={busy || !newName.trim()}
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50 focus-ring"
            >
              {busy ? "..." : "Přidat"}
            </button>
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
        </div>
      </div>
    </div>
  );
}

function TagEditorRow({
  tag,
  onRename,
  onRecolor,
  onDelete,
}: {
  tag: PersonTag;
  onRename: (name: string) => Promise<void>;
  onRecolor: (color: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <TagChip tag={{ ...tag, name, color }} />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name !== tag.name && name.trim()) onRename(name.trim());
        }}
        maxLength={40}
        className="flex-1 min-w-[120px] rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink-900 focus-ring"
      />
      <input
        type="text"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={() => {
          if (color !== tag.color) onRecolor(color);
        }}
        placeholder="#22c55e"
        maxLength={20}
        className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink-900 focus-ring"
      />
      <button
        type="button"
        onClick={onDelete}
        className="text-xs font-medium text-ink-500 hover:text-danger"
      >
        Smazat
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag chip — used in both the row + the editor preview
// ---------------------------------------------------------------------------

function TagChip({ tag }: { tag: Pick<PersonTag, "name" | "color"> }) {
  const accent = tag.color || undefined;
  return (
    <span
      className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand"
      style={
        accent
          ? { borderColor: `${accent}55`, color: accent, background: `${accent}1a` }
          : undefined
      }
    >
      {tag.name}
    </span>
  );
}

function BulkEmailDialog({
  wsSlug,
  recipients,
  onClose,
  onSent,
}: {
  wsSlug: string;
  recipients: WorkspaceMemberSummary[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await workspaces.bulkEmailMembers(wsSlug, {
        user_ids: recipients.map((m) => m.id),
        subject: subject.trim(),
        body: body.trim(),
      });
      setResult(r);
      // Auto-close after a moment so the owner sees the count.
      setTimeout(() => onSent(), 1500);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Odeslání selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-900">
            Odeslat e-mail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-ink-500 hover:text-ink-900"
          >
            Zavřít ×
          </button>
        </div>

        <p className="text-sm text-ink-500">
          Odešle se {recipients.length}{" "}
          {recipients.length === 1
            ? "příjemci"
            : recipients.length < 5
              ? "příjemcům"
              : "příjemcům"}
          . Každý dostane samostatný e-mail (vidí jen sebe). Odpovědi
          chodí na tvůj e-mail jako Reply-To.
        </p>

        <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-surface-muted/30 px-3 py-2 text-xs text-ink-500">
          {recipients.slice(0, 8).map((r) => (
            <div key={r.id}>
              {r.full_name || "—"} · {r.email}
            </div>
          ))}
          {recipients.length > 8 && (
            <div className="mt-1 italic">
              + {recipients.length - 8} dalších…
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-700">
              Předmět
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Krátká věta, co je uvnitř"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-700">
              Text e-mailu
            </span>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Napiš text… (podpis se přidá automaticky)"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
            />
          </label>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {result && (
          <Alert variant="success">
            Odesláno: {result.sent}
            {result.skipped > 0 && ` · přeskočeno: ${result.skipped}`}
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !subject.trim() || !body.trim()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50 focus-ring"
          >
            {busy ? "Odesílám…" : `Odeslat (${recipients.length})`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
