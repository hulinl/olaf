"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { EventDangerZone } from "@/components/event-danger-zone";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  type Event as OlafEvent,
  type EventCollaborator,
  type Workspace,
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

  async function handle() {
    if (!confirm("Vytvořit kopii této akce? Skončí jako Draft.")) return;
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
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    try {
      const l = await events.listCollaborators(wsSlug, eventSlug);
      setList(l);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSlug, eventSlug]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v) return;
    setBusy(true);
    setError(null);
    try {
      await events.addCollaborator(wsSlug, eventSlug, v);
      setEmail("");
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

  async function handleRemove(c: EventCollaborator) {
    if (!confirm(`Odebrat ${c.full_name} ze spolutvůrců?`)) return;
    try {
      await events.removeCollaborator(wsSlug, eventSlug, c.user_id);
      await reload();
    } catch {
      /* keep silent */
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-ink-900">Spolutvůrci</h2>
      <p className="mt-1 text-sm text-ink-500">
        Pozvi další lidi, kteří budou tuhle akci řídit s tebou. Uvidí ji
        u sebe v Tvůrci a budou ji moct upravovat, schvalovat registrace,
        vystavovat faktury. Musí mít účet na olafu.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {list === null ? (
          <p className="text-sm text-ink-500">Načítám…</p>
        ) : list.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
            Zatím jen ty. Přidej e-mail spolutvůrce níže.
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
          onClick={() => setAdding(true)}
          className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
        >
          + Přidat spolutvůrce
        </button>
      ) : (
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <Field label="E-mail spolutvůrce" htmlFor="collab-email">
              <Input
                id="collab-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kamarad@email.cz"
              />
            </Field>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" size="md" loading={busy}>
              {busy ? "Přidávám…" : "Přidat"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setEmail("");
                setError(null);
              }}
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
