"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { EventDangerZone } from "@/components/event-danger-zone";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  type Event as OlafEvent,
  type EventCollaborator,
  type Workspace,
  type WorkspaceMemberSummary,
  auth,
  events,
  workspaces,
} from "@/lib/api";
import { FormEvent } from "react";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string }>;
}

const STATUS_LABELS: Record<OlafEvent["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

const STATUS_TONE: Record<OlafEvent["status"], string> = {
  draft: "bg-surface-muted text-ink-700",
  published: "bg-success/15 text-success",
  closed: "bg-warning/15 text-warning",
  cancelled: "bg-danger-soft text-danger",
  completed: "bg-surface-muted text-ink-500",
};

/**
 * Level 3 cockpit — actions on a single event (detaily / obsah / galerie /
 * šablona / zrušit). Stats live on Level 2 (the roster page) so we don't
 * duplicate them here. Lives under /admin so the admin sidebar stays
 * visible while editing.
 */
export default function EventEditCockpitPage({ params }: Props) {
  const { wsSlug, eventSlug } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, ev] = await Promise.all([
          workspaces.detail(wsSlug),
          events.publicEvent(wsSlug, eventSlug),
        ]);
        if (cancelled) return;
        // Gate: workspace admin (owner/admin) OR explicit event co-creator
        // can edit. Event.i_am_owner already encodes this on the backend.
        if (!ev.i_am_owner) {
          try {
            await auth.me();
            router.replace(`/${wsSlug}/e/${eventSlug}`);
          } catch {
            router.replace(
              `/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit`,
            );
          }
          return;
        }
        setWorkspace(ws);
        setEvent(ev);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/admin/eventy/${wsSlug}/${eventSlug}/edit`);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/admin/eventy");
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
  }, [wsSlug, eventSlug, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!workspace || !event) return null;

  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  const sameDay = starts.toDateString() === ends.toDateString();
  const dateLabel = sameDay
    ? starts.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : `${starts.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })} – ${ends.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/eventy/${wsSlug}/${eventSlug}`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na přehled akce
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className={[
              "shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
              STATUS_TONE[event.status],
            ].join(" ")}
          >
            {STATUS_LABELS[event.status]}
          </span>
          <span className="text-sm text-ink-500">{dateLabel}</span>
          {event.location_text && (
            <span className="text-sm text-ink-500">· {event.location_text}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {event.title}
          </h1>
          <a
            href={`/${wsSlug}/e/${eventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Veřejný náhled"
            aria-label="Otevřít veřejný náhled v novém okně"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-ink-700 hover:bg-surface-muted hover:text-ink-900 focus-ring"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 3h7v7" />
              <path d="M10 14L21 3" />
              <path d="M21 14v7H3V3h7" />
            </svg>
          </a>
        </div>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-ink-900">Úpravy</h2>
        <p className="mt-1 text-sm text-ink-500">
          Akce má dvě úrovně nastavení: <strong>detaily</strong> pro mechaniku
          (kdy, kde, kolik míst, kdo se vidí, RSVP otázky) a
          <strong> obsah stránky</strong> pro to, co účastník na veřejné stránce
          skutečně uvidí.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PrimaryActionTile
            title="Upravit detaily"
            description="Termín, lokalita, kapacita, viditelnost, sdílení v komunitách, RSVP dotazník."
            href={`/admin/eventy/${wsSlug}/${eventSlug}/edit/detaily`}
          />
          <PrimaryActionTile
            title="Upravit obsah stránky"
            description={`${event.blocks.length} blok${
              event.blocks.length === 1
                ? ""
                : event.blocks.length < 5
                  ? "y"
                  : "ů"
            } — hero, program, ceny, FAQ, mapa…`}
            href={`/admin/eventy/${wsSlug}/${eventSlug}/edit/obsah`}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-900">Galerie</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ActionTile
            title="Galerie obrázků"
            description={
              event.images.length > 0
                ? `${event.images.length} obrázk${
                    event.images.length === 1
                      ? ""
                      : event.images.length < 5
                        ? "y"
                        : "ů"
                  } · spravuj a přerovnej.`
                : "Žádné obrázky. Nahraj galerii pro stránku akce."
            }
            href={`/admin/eventy/${wsSlug}/${eventSlug}/edit/galerie`}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-900">Platby a faktury</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ActionTile
            title="Faktury"
            description="Seznam vystavených faktur k této akci. Generují se automaticky po označení platby jako zaplacené."
            href={`/admin/eventy/${wsSlug}/${eventSlug}/edit/faktury`}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-900">
          Synchronizace z Notion
        </h2>
        {event.external_ref?.startsWith("notion:") ? (
          <>
            <p className="mt-1 text-sm text-ink-500">
              Akce je svázaná s Notion stránkou (
              <code className="rounded bg-surface-muted px-1 font-mono text-xs">
                {event.external_ref}
              </code>
              ). Stiskni „Aktualizovat z Notion" a Claude znovu načte
              stránku, přepíše pole akce (datum, místo, cena, kapacita)
              a bloky landing-page. Slug, status, registrace a faktury
              zůstanou.
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <NotionSyncButton
                wsSlug={wsSlug}
                eventSlug={eventSlug}
                onSynced={(updated) => setEvent(updated)}
              />
              <NotionReplaceButton
                wsSlug={wsSlug}
                eventSlug={eventSlug}
                onLinked={(updated) => setEvent(updated)}
              />
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-500">
              Tahle akce zatím není napojená na Notion stránku. Když ji
              propojíš, můžeš příště kliknout „Aktualizovat z Notion"
              a Claude přepíše pole akce + landing bloky z Notion textu.
              Slug, status, registrace a faktury zůstanou.
            </p>
            <div className="mt-3">
              <NotionLinkForm
                wsSlug={wsSlug}
                eventSlug={eventSlug}
                onLinked={(updated) => setEvent(updated)}
              />
            </div>
          </>
        )}
      </section>

      <CollaboratorsSection wsSlug={wsSlug} eventSlug={eventSlug} />

      <section>
        <h2 className="text-lg font-semibold text-ink-900">Šablona</h2>
        <p className="mt-1 text-sm text-ink-500">
          Pořádáš podobné akce opakovaně? Vytvoř z této akce kopii s novým
          slugem ve stavu Draft a uprav jen datum/místo.
        </p>
        <div className="mt-3">
          <DuplicateButton wsSlug={wsSlug} eventSlug={eventSlug} />
        </div>
      </section>

      <div className="mt-4 border-t border-border pt-8">
        <EventDangerZone
          event={event}
          workspaceSlug={wsSlug}
          onCancelled={(updated) => setEvent(updated)}
        />
      </div>
    </div>
  );
}

function NotionSyncButton({
  wsSlug,
  eventSlug,
  onSynced,
}: {
  wsSlug: string;
  eventSlug: string;
  onSynced: (event: OlafEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Když backend vrátí 412 + missing=notion/anthropic, ukážeme vedle
  // textu Link na /settings/integrace — předtím tu byl jen text
  // "Otevři /settings/integrace.", což user musel ručně přepsat do URL.
  const [missingIntegration, setMissingIntegration] = useState<
    "notion" | "anthropic" | null
  >(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  async function handle() {
    const ok = await confirmDialog({
      title: "Aktualizovat z Notion?",
      description:
        "Bloky landing-page se přepíšou tím, co Claude extrahuje. Slug, status, RSVPs a faktury zůstanou.",
      confirmLabel: "Aktualizovat",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    setMissingIntegration(null);
    setOkMsg(null);
    try {
      const result = await events.syncFromSource(wsSlug, eventSlug);
      // Refetch event to get the now-updated fields + blocks. Faster
      // than rebuilding from the response: same code path as initial
      // load, no chance of drift.
      const fresh = await events.publicEvent(wsSlug, eventSlug);
      onSynced(fresh);
      const count = result.fields_updated.length;
      setOkMsg(
        count > 0
          ? `Aktualizováno ${count} pol${
              count === 1 ? "e" : count < 5 ? "e" : "í"
            }: ${result.fields_updated.join(", ")}.`
          : "Notion stránka nepřinesla žádné nové údaje.",
      );
    } catch (e) {
      if (e instanceof ApiError) {
        const missing = e.data?.missing;
        if (missing === "notion" || missing === "anthropic") {
          setMissingIntegration(missing);
          setErr(
            typeof e.data?.detail === "string" ? e.data.detail : e.message,
          );
        } else {
          setErr(
            typeof e.data?.detail === "string"
              ? e.data.detail
              : e.message,
          );
        }
      } else {
        setErr("Sync selhal.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring disabled:opacity-50"
      >
        {busy ? "Synchronizuji…" : "Aktualizovat z Notion"}
      </button>
      {okMsg && (
        <p className="mt-2 text-sm text-success">{okMsg}</p>
      )}
      {err && (
        <div className="mt-2 flex flex-col gap-2 text-sm text-danger">
          <p className="whitespace-pre-line">{err}</p>
          {missingIntegration && (
            <Link
              href="/settings/integrace"
              className="inline-flex w-fit items-center gap-1 rounded-md border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/15"
            >
              Nastavit integraci{" "}
              {missingIntegration === "notion" ? "Notion" : "Anthropic"} →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function NotionReplaceButton({
  wsSlug,
  eventSlug,
  onLinked,
}: {
  wsSlug: string;
  eventSlug: string;
  onLinked: (event: OlafEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    const ok = await confirmDialog({
      title: "Změnit Notion propojení?",
      description:
        'Při příštím „Aktualizovat z Notion" bude Claude číst z této nové stránky.',
      confirmLabel: "Změnit",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await events.linkNotion(
        wsSlug,
        eventSlug,
        url.trim(),
        { replace: true },
      );
      onLinked(updated);
      setEditing(false);
      setUrl("");
    } catch (e2) {
      if (e2 instanceof ApiError) {
        const data = e2.data ?? {};
        const msg =
          (typeof data.detail === "string" && data.detail) ||
          (typeof data.url === "string" && data.url) ||
          e2.message;
        setErr(msg);
      } else {
        setErr("Změna propojení selhala.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900 focus-ring"
      >
        Změnit propojení
      </button>
    );
  }

  return (
    <form
      onSubmit={handle}
      className="flex w-full flex-col gap-3 sm:max-w-xl"
    >
      <Field
        label="Nová Notion URL"
        htmlFor="replace-notion-url"
        hint="Stará stránka přestane být zdrojem; sync bude tahat z nové. Slug, status, RSVPs a faktury zůstanou."
      >
        <Input
          id="replace-notion-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.notion.so/myws/Letni-kemp-2026-..."
          required
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          size="md"
          loading={busy}
          disabled={!url.trim() || busy}
        >
          {busy ? "Měním propojení…" : "Uložit nové propojení"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => {
            setEditing(false);
            setUrl("");
            setErr(null);
          }}
          disabled={busy}
        >
          Zrušit
        </Button>
      </div>
      {err && (
        <p className="whitespace-pre-line text-sm text-danger">{err}</p>
      )}
    </form>
  );
}

function NotionLinkForm({
  wsSlug,
  eventSlug,
  onLinked,
}: {
  wsSlug: string;
  eventSlug: string;
  onLinked: (event: OlafEvent) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await events.linkNotion(wsSlug, eventSlug, url.trim());
      onLinked(updated);
    } catch (e2) {
      if (e2 instanceof ApiError) {
        const data = e2.data ?? {};
        const msg =
          (typeof data.detail === "string" && data.detail) ||
          (typeof data.url === "string" && data.url) ||
          e2.message;
        setErr(msg);
      } else {
        setErr("Propojení selhalo.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-3 sm:max-w-xl">
      <Field
        label="Notion URL"
        htmlFor="link-notion-url"
        hint="Otevři stránku v Notion → ⋯ → Copy link. Před prvním použitím připoj integraci přes ⋯ → Connections."
      >
        <Input
          id="link-notion-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.notion.so/myws/Letni-kemp-2026-..."
          required
        />
      </Field>
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="md"
          loading={busy}
          disabled={!url.trim() || busy}
        >
          {busy ? "Propojuji…" : "Propojit s Notion"}
        </Button>
      </div>
      {err && (
        <p className="whitespace-pre-line text-sm text-danger">{err}</p>
      )}
    </form>
  );
}

function DuplicateButton({
  wsSlug,
  eventSlug,
}: {
  wsSlug: string;
  eventSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  async function handle() {
    const ok = await confirmDialog({
      title: "Vytvořit kopii akce?",
      description: "Skončí jako Draft. Můžeš ji pak nezávisle upravit.",
      confirmLabel: "Vytvořit kopii",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const copy = await events.duplicate(wsSlug, eventSlug);
      router.push(`/admin/eventy/${wsSlug}/${copy.slug}/edit/detaily`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Kopírování selhalo.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring disabled:opacity-50"
      >
        {busy ? "Kopíruji…" : "Duplikovat akci"}
      </button>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </>
  );
}

function ActionTile({
  title,
  description,
  href,
  external = false,
}: {
  title: string;
  description: string;
  href: string;
  external?: boolean;
}) {
  const inner = (
    <div className="flex h-full flex-col rounded-md border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-muted/40 focus-ring">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        <span className="text-ink-500" aria-hidden="true">
          {external ? "↗" : "→"}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-500">{description}</p>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return <Link href={href}>{inner}</Link>;
}

function PrimaryActionTile({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-7 shadow-md transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-lg focus-ring">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink-900 sm:text-xl">
            {title}
          </h3>
          <span className="text-brand" aria-hidden="true">
            →
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-700">{description}</p>
      </div>
    </Link>
  );
}

function CollaboratorsSection({
  wsSlug,
  eventSlug,
}: {
  wsSlug: string;
  eventSlug: string;
}) {
  const [list, setList] = useState<EventCollaborator[] | null>(null);
  const [people, setPeople] = useState<WorkspaceMemberSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const confirmDialog = useConfirm();

  async function reload() {
    try {
      const l = await events.listCollaborators(wsSlug, eventSlug);
      setList(l);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  // Lidé load lazily — most edits won't touch the spolutvůrci section, so
  // we only fetch when the user actually opens the picker.
  async function loadPeople() {
    if (people !== null) return;
    try {
      const p = await workspaces.members(wsSlug);
      setPeople(p);
    } catch {
      // Non-fatal: fall back to plain email input.
      setPeople([]);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSlug, eventSlug]);

  // Filtered suggestion list:
  // - exclude anyone already a collaborator
  // - exclude the current user (handled implicitly — add API rejects them)
  // - free-text match on name + email
  const usedEmails = new Set((list ?? []).map((c) => c.email.toLowerCase()));
  const q = query.trim().toLowerCase();
  const suggestions = (people ?? [])
    .filter((p) => !usedEmails.has(p.email.toLowerCase()))
    .filter((p) => {
      if (!q) return true;
      return (
        p.email.toLowerCase().includes(q) ||
        p.full_name.toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  const queryLooksLikeEmail = /^\S+@\S+\.\S+$/.test(query.trim());
  const exactMatch = suggestions.find(
    (s) => s.email.toLowerCase() === q,
  );

  async function addByEmail(emailRaw: string) {
    const v = emailRaw.trim().toLowerCase();
    if (!v) return;
    setBusy(true);
    setError(null);
    try {
      await events.addCollaborator(wsSlug, eventSlug, v);
      setQuery("");
      setAdding(false);
      await reload();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Přidání selhalo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Enter on a highlighted suggestion picks it; otherwise treat as
    // free-form email (lets the owner invite someone not in Lidé).
    if (suggestions.length > 0 && highlight < suggestions.length) {
      await addByEmail(suggestions[highlight].email);
      return;
    }
    if (queryLooksLikeEmail) {
      await addByEmail(query);
      return;
    }
    setError("Vyber někoho ze seznamu nebo napiš platný e-mail.");
  }

  async function handleRemove(c: EventCollaborator) {
    const ok = await confirmDialog({
      title: `Odebrat ${c.full_name} ze spolutvůrců?`,
      description: "Ztratí přístup k editaci a managementu této akce.",
      confirmLabel: "Odebrat",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await events.removeCollaborator(wsSlug, eventSlug, c.user_id);
      await reload();
    } catch {
      /* keep silent */
    }
  }

  function openPicker() {
    setAdding(true);
    loadPeople();
  }

  function closePicker() {
    setAdding(false);
    setQuery("");
    setError(null);
    setHighlight(0);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-ink-900">Spolutvůrci</h2>
      <p className="mt-1 text-sm text-ink-500">
        Pozvi další lidi, kteří budou tuhle akci řídit s tebou. Uvidí ji
        u sebe v Tvůrci a budou ji moct upravovat, schvalovat registrace,
        vystavovat faktury. Vyber ze seznamu Lidé (kdo se kdy přihlásil
        na akci) nebo napiš e-mail kohokoliv jiného s účtem na olafu.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {list === null ? (
          <p className="text-sm text-ink-500">Načítám…</p>
        ) : list.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
            Zatím jen ty. Přidej spolutvůrce níže.
          </p>
        ) : (
          list.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-ink-900">{c.full_name}</span>
                <span className="text-xs text-ink-500">{c.email}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(c)}
                className="text-xs font-medium text-ink-500 hover:text-danger"
              >
                Odebrat
              </button>
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      {!adding ? (
        <button
          type="button"
          onClick={openPicker}
          className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
        >
          + Přidat spolutvůrce
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
          <Field
            label="Najdi v Lidé nebo napiš e-mail"
            htmlFor="collab-search"
            hint={
              people && people.length === 0
                ? "V této komunitě zatím nikdo nemá registraci. Napiš e-mail spolutvůrce — musí mít účet na olafu."
                : "Začni psát jméno nebo e-mail. Někdo mimo seznam? Napiš celý e-mail a stiskni Enter."
            }
          >
            <Input
              id="collab-search"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && suggestions.length > 0) {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp" && suggestions.length > 0) {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closePicker();
                }
              }}
              placeholder="např. Jana nebo jana@email.cz"
            />
          </Field>

          {suggestions.length > 0 ? (
            <ul
              role="listbox"
              className="max-h-64 overflow-y-auto rounded-md border border-border bg-surface"
            >
              {suggestions.map((p, i) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={i === highlight}
                  className={[
                    "cursor-pointer border-b border-border px-3 py-2 text-sm last:border-b-0",
                    i === highlight
                      ? "bg-brand/10"
                      : "hover:bg-surface-muted",
                  ].join(" ")}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => addByEmail(p.email)}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink-900">
                      {p.full_name || p.email}
                    </span>
                    {p.total_rsvps > 0 && (
                      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-500">
                        {p.total_rsvps}× registrace
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-500">{p.email}</span>
                </li>
              ))}
            </ul>
          ) : q && people !== null ? (
            <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-xs text-ink-500">
              V Lidé nikoho takového nevidíme.{" "}
              {queryLooksLikeEmail
                ? "Stiskni Enter pro pozvání e-mailem."
                : "Napiš celý e-mail pro pozvání někoho mimo seznam."}
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={busy}
              disabled={
                busy ||
                (!exactMatch &&
                  !queryLooksLikeEmail &&
                  suggestions.length === 0)
              }
            >
              {busy ? "Přidávám…" : "Přidat"}
            </Button>
            <button
              type="button"
              onClick={closePicker}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
            >
              Zrušit
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
