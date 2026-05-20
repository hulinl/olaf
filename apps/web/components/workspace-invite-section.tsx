"use client";

import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type WorkspaceInvitationSummary,
  type WorkspaceMemberSummary,
  workspaces,
} from "@/lib/api";

/** Owner-facing "pozvat lidi" surface for a workspace.
 *
 *  Houses three invite methods that have proven useful in practice:
 *  - direct e-mail (creates a pending invitation token, or attaches
 *    instantly if the e-mail already has an OLAF account)
 *  - public link (a random token that can be reused and revoked)
 *  - pick from existing "Lidé" CRM rows (people who have an RSVP but
 *    aren't yet workspace members)
 *
 *  `onInvited` is fired after any successful action so a parent CRM
 *  table can refresh its rows. `defaultOpen` controls whether the
 *  accordion starts expanded — pass true when the component is the
 *  primary action on its page (e.g. inside a modal); false on a
 *  dashboard where it's one of many tiles.
 */
export function WorkspaceInviteSection({
  wsSlug,
  onInvited,
  defaultOpen = false,
}: {
  wsSlug: string;
  onInvited?: () => Promise<void>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [invitations, setInvitations] = useState<
    WorkspaceInvitationSummary[] | null
  >(null);
  const [link, setLink] = useState<{ token: string; url: string } | null>(
    null,
  );
  const [members, setMembers] = useState<WorkspaceMemberSummary[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const [inv, mem, linkInfo] = await Promise.all([
        workspaces.listInvitations(wsSlug),
        workspaces.members(wsSlug),
        workspaces.getInviteLink(wsSlug),
      ]);
      setInvitations(inv);
      setMembers(mem);
      if (linkInfo.public_invite_token) {
        setLink({
          token: linkInfo.public_invite_token,
          url: linkInfo.invite_url,
        });
      } else {
        setLink(null);
      }
      if (onInvited) await onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wsSlug]);

  return (
    <Card>
      <CardSection>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left focus-ring"
        >
          <div>
            <h2 className="text-base font-semibold text-ink-900">
              Pozvat člena
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Tři způsoby — e-mailem, veřejným odkazem, nebo přidat někoho
              z Lidé jedním klikem.
            </p>
          </div>
          <span
            aria-hidden
            className={open ? "rotate-90 text-ink-500" : "text-ink-500"}
          >
            ›
          </span>
        </button>

        {open && (
          <div className="mt-5 flex flex-col gap-6">
            {error && <Alert variant="danger">{error}</Alert>}

            <InviteByEmail wsSlug={wsSlug} onChange={reload} />

            <PublicLinkPanel
              wsSlug={wsSlug}
              link={link}
              onChange={reload}
            />

            <PendingInvitations
              wsSlug={wsSlug}
              invitations={invitations}
              onChange={reload}
            />

            <AddFromLide
              wsSlug={wsSlug}
              members={members}
              onChange={reload}
            />
          </div>
        )}
      </CardSection>
    </Card>
  );
}

function InviteByEmail({
  wsSlug,
  onChange,
}: {
  wsSlug: string;
  onChange: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await workspaces.createInvitation(wsSlug, email.trim(), role);
      if (r.mode === "direct") {
        setMsg(
          `Účet existuje — uživatel byl rovnou přidán${
            role === "admin" ? " jako admin" : ""
          }.`,
        );
      } else {
        setMsg(
          `Pozvánka odeslána na ${r.email}${
            role === "admin" ? " (po přijetí získá admin práva)" : ""
          }.`,
        );
      }
      setEmail("");
      setRole("member");
      await onChange();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Pozvání selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
        Pozvat e-mailem
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <Field label="E-mail" htmlFor="inv-email">
            <Input
              id="inv-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kamarad@email.cz"
            />
          </Field>
        </div>
        <Field label="Role" htmlFor="inv-role">
          <select
            id="inv-role"
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "member" | "admin")
            }
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
          >
            <option value="member">Člen</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Button type="submit" variant="primary" size="md" loading={busy}>
          {busy ? "..." : "Pozvat"}
        </Button>
      </form>
      {msg && (
        <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
          {msg}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function PublicLinkPanel({
  wsSlug,
  link,
  onChange,
}: {
  wsSlug: string;
  link: { token: string; url: string } | null;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      await workspaces.generateInviteLink(wsSlug);
      await onChange();
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!confirm("Zrušit veřejný odkaz? Stávající URL přestane fungovat."))
      return;
    setBusy(true);
    try {
      await workspaces.revokeInviteLink(wsSlug);
      await onChange();
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* keep silent */
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
        Veřejný odkaz
      </p>
      {link ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-[260px] rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink-700 focus-ring"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
            >
              {copied ? "✓" : "Kopírovat"}
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted disabled:opacity-50"
            >
              {busy ? "..." : "Vygenerovat nový"}
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="rounded-md border border-danger/40 bg-surface px-2 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              Zrušit
            </button>
          </div>
          <p className="text-xs text-ink-500">
            Kdo má tenhle odkaz, může se přidat do komunity sám. Když ho
            chceš zneplatnit, vygeneruj nový (nebo zruš úplně).
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={generate}
            loading={busy}
          >
            {busy ? "..." : "Vygenerovat veřejný odkaz"}
          </Button>
          <p className="text-xs text-ink-500">
            Vygeneruje nesdílitelný náhodný token v URL — viditelný jen
            tomu, komu odkaz sám pošleš.
          </p>
        </div>
      )}
    </div>
  );
}

function PendingInvitations({
  wsSlug,
  invitations,
  onChange,
}: {
  wsSlug: string;
  invitations: WorkspaceInvitationSummary[] | null;
  onChange: () => Promise<void>;
}) {
  if (invitations === null) return null;
  if (invitations.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
        Čekající pozvánky ({invitations.length})
      </p>
      <div className="flex flex-col gap-1">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <div className="flex flex-col">
              <span className="font-medium text-ink-900">{inv.email}</span>
              <span className="text-xs text-ink-500">
                {new Date(inv.created_at).toLocaleDateString("cs-CZ")}
              </span>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Zrušit pozvánku pro ${inv.email}?`)) return;
                await workspaces.cancelInvitation(wsSlug, inv.id);
                await onChange();
              }}
              className="text-xs font-medium text-ink-500 hover:text-danger"
            >
              Zrušit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddFromLide({
  wsSlug,
  members,
  onChange,
}: {
  wsSlug: string;
  members: WorkspaceMemberSummary[] | null;
  onChange: () => Promise<void>;
}) {
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (members === null) return null;
  const nonMembers = members.filter((m) => !m.role);

  async function add() {
    if (pickedId == null) return;
    setBusy(true);
    setMsg(null);
    try {
      await workspaces.addExistingMember(wsSlug, pickedId, role);
      const person = members?.find((m) => m.id === pickedId);
      setMsg(
        `Přidáno: ${person?.full_name || person?.email}${
          role === "admin" ? " jako admin" : ""
        }`,
      );
      setPickedId(null);
      setRole("member");
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
        Přidat z Lidé
      </p>
      {nonMembers.length === 0 ? (
        <p className="text-xs text-ink-500">
          Všichni lidé z Lidé už jsou členové komunity.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pickedId ?? ""}
            onChange={(e) =>
              setPickedId(e.target.value ? Number(e.target.value) : null)
            }
            className="flex-1 min-w-[220px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
          >
            <option value="">
              — vyber z {nonMembers.length} lidí, kteří ještě nejsou členové —
            </option>
            {nonMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
                {m.full_name ? ` (${m.email})` : ""}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "admin")}
            aria-label="Role"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
          >
            <option value="member">Člen</option>
            <option value="admin">Admin</option>
          </select>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={add}
            disabled={pickedId == null || busy}
            loading={busy}
          >
            {busy ? "..." : "Přidat"}
          </Button>
        </div>
      )}
      {msg && (
        <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
          {msg}
        </p>
      )}
    </div>
  );
}
