"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  use,
  useEffect,
  useState,
} from "react";

import { DiscussionWall } from "@/components/discussion-wall";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ShareButton } from "@/components/ui/share-button";
import { useUser } from "@/lib/user-context";
import {
  ApiError,
  type EventSummary,
  type Workspace,
  type WorkspaceInvitationSummary,
  type WorkspaceMemberSummary,
  auth,
  workspaces,
} from "@/lib/api";

const STATUS_LABELS: Record<EventSummary["status"], string> = {
  draft: "Draft",
  published: "Publikováno",
  closed: "Uzavřeno",
  cancelled: "Zrušeno",
  completed: "Proběhlo",
};

const STATUS_TONE: Record<EventSummary["status"], string> = {
  draft: "bg-surface-muted text-ink-500",
  published: "bg-success/15 text-success",
  closed: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  completed: "bg-surface-muted text-ink-500",
};

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Level 2 admin view of a single komunita — stays inside the /admin shell
 * (sidebar visible). Shows the workspace's events as a table; from here
 * the owner can drill into the existing /workspaces/<slug>/edit cockpit
 * for profile edits, and links to the public profile in a new tab.
 */
export default function AdminKomunitaDetailPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const user = useUser();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [eventList, setEventList] = useState<EventSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev] = await Promise.all([
          workspaces.detail(slug),
          workspaces.eventsFor(slug),
        ]);
        if (cancelled) return;
        if (ws.my_role !== "owner") {
          try {
            await auth.me();
            router.replace(`/${slug}`);
          } catch {
            router.replace(`/login?next=/admin/komunity/${slug}`);
          }
          return;
        }
        setWorkspace(ws);
        setEventList(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/admin/komunity/${slug}`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/komunity");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Něco se pokazilo.");
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
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!workspace || !eventList) return null;

  const now = Date.now();
  const upcoming = eventList.filter(
    (e) => new Date(e.ends_at).getTime() >= now,
  );
  const past = eventList.filter(
    (e) => new Date(e.ends_at).getTime() < now,
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/komunity"
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na seznam komunit
      </Link>

      <header className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Komunita</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {workspace.name}
          </h1>
          {workspace.location && (
            <p className="mt-1 text-sm text-ink-500">{workspace.location}</p>
          )}
          {workspace.bio && (
            <p className="mt-3 max-w-2xl text-ink-700">{workspace.bio}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton
            href={`/admin/komunity/${workspace.slug}/edit`}
            variant="secondary"
            size="md"
          >
            Upravit komunitu →
          </LinkButton>
          <a
            href={`/${workspace.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            Veřejný profil ↗
          </a>
          <ShareButton
            url={`/${workspace.slug}`}
            title={workspace.name}
            text={workspace.bio || workspace.name}
            label="Sdílet komunitu"
          />
        </div>
      </header>

      {/* Rozcestník — small-screen users were missing whole sections
          (Nástěnka especially) because everything was stacked vertically.
          Top tab bar jumps to the section and stays sticky so the
          context never leaves the viewport. */}
      <nav
        aria-label="Sekce komunity"
        className="sticky top-16 z-10 -mx-4 flex gap-1 overflow-x-auto border-y border-border bg-canvas/85 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-md sm:border"
      >
        <TabLink href={`/admin/komunity/${slug}#akce`}>
          Akce ({upcoming.length})
        </TabLink>
        <TabLink href={`/admin/komunity/${slug}/clenove`}>
          Členové ({workspace.member_count ?? 1})
        </TabLink>
        <TabLink href={`/admin/komunity/${slug}#nastenka`}>Nástěnka</TabLink>
        <TabLink href={`/admin/komunity/${slug}#pozvat`}>Pozvat</TabLink>
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href={`/admin/komunity/${slug}/clenove`}
          className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-brand hover:bg-brand/10 focus-ring"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Členů
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink-900">
            {workspace.member_count ?? 1}
          </p>
        </Link>
        <StatTile label="Nadcházející akce" value={String(upcoming.length)} />
        <StatTile label="Minulé akce" value={String(past.length)} />
      </div>

      <section id="pozvat" className="scroll-mt-32">
        <InviteSection wsSlug={slug} />
      </section>

      <section id="akce" className="flex scroll-mt-32 flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink-900">
          Akce této komunity
        </h2>
        {eventList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-10 text-center">
            <h3 className="text-base font-semibold text-ink-900">
              Žádné akce
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
              Vytvoř první akci v této komunitě.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Akce</th>
                  <th className="px-4 py-3">Termín</th>
                  <th className="px-4 py-3 text-right">Přihlášeno</th>
                  <th className="px-4 py-3 text-right">Waitlist</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {eventList.map((e) => (
                  <EventRow key={e.slug} event={e} wsSlug={workspace.slug} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="nastenka" className="scroll-mt-32">
        <DiscussionWall
          scope={{ kind: "workspace", slug, isModerator: true }}
          currentUserId={user.id}
          topicHref={(topicId) =>
            `/admin/komunity/${slug}/nastenka/${topicId}`
          }
        />
      </section>
    </div>
  );
}

function TabLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
    >
      {children}
    </Link>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function EventRow({
  event,
  wsSlug,
}: {
  event: EventSummary;
  wsSlug: string;
}) {
  const router = useRouter();
  const href = `/admin/eventy/${wsSlug}/${event.slug}`;
  const starts = new Date(event.starts_at);

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
          <span className="font-medium text-ink-900">{event.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span
              className={[
                "inline-flex rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                STATUS_TONE[event.status],
              ].join(" ")}
            >
              {STATUS_LABELS[event.status]}
            </span>
            {event.location_text && <span>· {event.location_text}</span>}
          </span>
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
        {starts.toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink-900">
        {event.capacity != null
          ? `${event.confirmed_count} / ${event.capacity}`
          : event.confirmed_count}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-ink-700">
        {event.waitlist_count > 0 ? event.waitlist_count : "—"}
      </td>
    </tr>
  );
}

function InviteSection({ wsSlug }: { wsSlug: string }) {
  const [open, setOpen] = useState(false);
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
              Pozvat lidi
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
  // Only people who aren't already in WorkspaceMember (i.e. role is null).
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
