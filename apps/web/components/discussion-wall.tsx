"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type DiscussionTopic,
  type TopicWritePayload,
  discussions,
} from "@/lib/api";

type Scope =
  | { kind: "workspace"; slug: string; isModerator: boolean }
  | {
      kind: "event";
      workspaceSlug: string;
      eventSlug: string;
      isModerator: boolean;
    };

interface Props {
  scope: Scope;
  /** Current user id — used to gate "smazat mé téma". */
  currentUserId: number;
  /** Builds the dedicated-thread URL for a given topic id. The wall is
   *  card-only now (Trello-style); clicking a card navigates here. */
  topicHref: (topicId: number) => string;
}

/**
 * The wall is now strictly a list of topic cards. Each card links to a
 * dedicated thread page (DiscussionThread) where the full body +
 * comments + composer live. The wall stops being a giant nested
 * accordion — easier to scan, makes room for V2 replies / photo uploads
 * on the thread page without crushing the layout.
 *
 * Composer at the top stays inline so creating a new topic is one
 * click + write + publish, no extra navigation.
 */
export function DiscussionWall({ scope, currentUserId, topicHref }: Props) {
  const [topics, setTopics] = useState<DiscussionTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const confirmDialog = useConfirm();

  async function listTopics() {
    try {
      const list =
        scope.kind === "workspace"
          ? await discussions.listWorkspace(scope.slug)
          : await discussions.listEvent(scope.workspaceSlug, scope.eventSlug);
      setTopics(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    listTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scope.kind,
    "slug" in scope ? scope.slug : "",
    "workspaceSlug" in scope ? scope.workspaceSlug : "",
    "eventSlug" in scope ? scope.eventSlug : "",
  ]);

  async function handleCreate(payload: TopicWritePayload) {
    try {
      if (scope.kind === "workspace") {
        await discussions.createWorkspaceTopic(scope.slug, payload);
      } else {
        await discussions.createEventTopic(
          scope.workspaceSlug,
          scope.eventSlug,
          payload,
        );
      }
      setComposerOpen(false);
      await listTopics();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Uložení selhalo.",
      );
    }
  }

  async function handleDeleteTopic(topicId: number) {
    const ok = await confirmDialog({
      title: "Smazat téma?",
      description:
        "Téma zmizí společně se všemi komentáři a přílohami. Tuto akci nelze vrátit.",
      confirmLabel: "Smazat téma",
      variant: "danger",
    });
    if (!ok) return;
    try {
      if (scope.kind === "workspace") {
        await discussions.deleteWorkspaceTopic(scope.slug, topicId);
      } else {
        await discussions.deleteEventTopic(
          scope.workspaceSlug,
          scope.eventSlug,
          topicId,
        );
      }
      await listTopics();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    }
  }

  async function handleTogglePin(topic: DiscussionTopic) {
    try {
      const payload = { pinned: !topic.pinned };
      if (scope.kind === "workspace") {
        await discussions.updateWorkspaceTopic(scope.slug, topic.id, payload);
      } else {
        await discussions.updateEventTopic(
          scope.workspaceSlug,
          scope.eventSlug,
          topic.id,
          payload,
        );
      }
      await listTopics();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Úprava selhala.");
    }
  }

  return (
    // Borderless wrapper — each topic card already has its own outer
    // border, so wrapping the whole wall in another card border just
    // doubled up. The page section (workspace landing / event detail /
    // Tvůrce komunita tab) is the container.
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-900">Nástěnka</h3>
        {!composerOpen && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setComposerOpen(true)}
          >
            + Nové téma
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      {composerOpen && (
        <TopicComposer
          canPin={scope.isModerator}
          onCancel={() => setComposerOpen(false)}
          onSubmit={handleCreate}
        />
      )}

      <TopicGrid
        topics={topics}
        topicHref={topicHref}
        canModerate={scope.isModerator}
        currentUserId={currentUserId}
        onTogglePin={handleTogglePin}
        onDeleteTopic={handleDeleteTopic}
      />
    </section>
  );
}

function TopicGrid({
  topics,
  topicHref,
  canModerate,
  currentUserId,
  onTogglePin,
  onDeleteTopic,
}: {
  topics: DiscussionTopic[] | null;
  topicHref: (topicId: number) => string;
  canModerate: boolean;
  currentUserId: number;
  onTogglePin: (t: DiscussionTopic) => Promise<void>;
  onDeleteTopic: (id: number) => Promise<void>;
}) {
  if (topics === null) {
    return (
      <div className="mt-5 flex justify-center py-6">
        <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (topics.length === 0) {
    return (
      <p className="mt-5 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
        Zatím tu nikdo nic nenapsal. Buď první.
      </p>
    );
  }

  const pinned = topics.filter((t) => t.pinned);
  const rest = topics.filter((t) => !t.pinned);

  const renderCard = (t: DiscussionTopic) => (
    <TopicCard
      key={t.id}
      topic={t}
      href={topicHref(t.id)}
      canDelete={canModerate || t.author_id === currentUserId}
      canModerate={canModerate}
      onTogglePin={() => onTogglePin(t)}
      onDelete={() => onDeleteTopic(t.id)}
    />
  );

  // Feed layout (2026-09-10, user request): jeden sloupec pod sebou,
  // full-width v rámci stránkového kontejneru (rodič má max-w-5xl),
  // fixní preview výška, "Zobrazit více" toggle. Připnuté zůstávají
  // nahoře jako samostatná sekce.
  return (
    <div className="mt-5 flex w-full flex-col gap-6">
      {pinned.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
            <span aria-hidden>📌</span> Připnuté
          </p>
          <div className="flex flex-col gap-4">{pinned.map(renderCard)}</div>
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex flex-col gap-3">
          {pinned.length > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              Ostatní příspěvky
            </p>
          )}
          <div className="flex flex-col gap-4">{rest.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}

/** "Před N dny" / "Dnes" / "Včera" / absolute datum pro starší.
 *  Zobrazuje se v hlavičce karty vedle absolutního data — user na
 *  první pohled vidí, jak čerstvý příspěvek je. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - then) / (24 * 3600 * 1000));
  if (diffDays < 1) return "dnes";
  if (diffDays === 1) return "včera";
  if (diffDays < 7) return `před ${diffDays} dny`;
  if (diffDays < 14) return "před týdnem";
  if (diffDays < 30) return `před ${Math.floor(diffDays / 7)} týdny`;
  if (diffDays < 60) return "před měsícem";
  if (diffDays < 365) return `před ${Math.floor(diffDays / 30)} měsíci`;
  return `před ${Math.floor(diffDays / 365)} lety`;
}

/** Iniciála z celého jména autora — první písmeno prvního slova,
 *  fallback "?" pro prázdný string / smazané autory. */
function initialOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toUpperCase() || "?";
}

/** Deterministický pastel avatar background z author_name — každý
 *  autor má konzistentní barvu napříč posty, aniž bychom potřebovali
 *  avatar URL z API. HSL s pevnou saturací + lightness = pastel. */
function avatarBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 82%)`;
}

function TopicCard({
  topic,
  href,
  canDelete,
  canModerate,
  onTogglePin,
  onDelete,
}: {
  topic: DiscussionTopic;
  href: string;
  canDelete: boolean;
  canModerate: boolean;
  onTogglePin: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  // Absolute datum + relativní hint ("před 2 dny") — user 2026-09-10:
  // chce vidět jak staré posty jsou na první pohled.
  const created = new Date(topic.created_at);
  const absoluteDate = created.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year:
      created.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  const relative = formatRelative(topic.created_at);
  // Line clamp threshold — když je body ≤ 4 řádky-ish (heuristika:
  // 280 znaků / 4 newliny), nemá cenu ukazovat „Zobrazit více".
  const needsExpand =
    topic.body.length > 280 || topic.body.split("\n").length > 4;

  return (
    <article
      className={[
        "group relative flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-brand/40 hover:shadow-md",
        topic.pinned ? "border-brand/40" : "border-border",
      ].join(" ")}
    >
      {/* Header pruh s pastel tintem — vizuálně oddělí "kdo + kdy" od
          samotného postu, tak jak to má Facebook / Instagram post. */}
      <header className="flex items-start justify-between gap-3 border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-ink-900 ring-1 ring-white/60"
            style={{ backgroundColor: avatarBg(topic.author_name) }}
          >
            {initialOf(topic.author_name)}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-ink-900">
              {topic.author_name}
            </span>
            <span className="text-xs text-ink-500">
              <time dateTime={topic.created_at} title={created.toLocaleString("cs-CZ")}>
                {absoluteDate}
              </time>
              <span aria-hidden> · </span>
              <span>{relative}</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {topic.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
              <span aria-hidden>📌</span>
              <span className="hidden sm:inline">Připnuto</span>
            </span>
          )}
          {topic.locked && (
            <span className="inline-flex rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              Zamčeno
            </span>
          )}
          {(canModerate || canDelete) && (
            <div className="ml-0.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {/* Na dotykových zařízeních není hover, akce musí být vidět
                  hned. Na desktopu je hide-until-hover, aby netahaly oči. */}
              {canModerate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTogglePin();
                  }}
                  title={topic.pinned ? "Odepnout" : "Připnout"}
                  aria-label={topic.pinned ? "Odepnout" : "Připnout"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-500 shadow-sm hover:bg-surface-muted hover:text-ink-900 focus-ring"
                >
                  <span aria-hidden>{topic.pinned ? "📌" : "📍"}</span>
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete();
                  }}
                  title="Smazat téma"
                  aria-label="Smazat téma"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-500 shadow-sm hover:text-danger focus-ring"
                >
                  <span aria-hidden>×</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5">
        <Link
          href={href}
          className="flex flex-col gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <h4
            className="text-base font-semibold text-ink-900 sm:text-lg"
            style={{ letterSpacing: "-0.015em" }}
          >
            {topic.title}
          </h4>
          {topic.body && (
            <p
              className={[
                "whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700",
                expanded ? "" : "line-clamp-4",
              ].join(" ")}
            >
              {topic.body}
            </p>
          )}
        </Link>

        {topic.body && needsExpand && (
          // Standalone toggle — nesmí propagate do Link parenta (jinak
          // by kliknutí na "Zobrazit více" navigovalo do threadu místo
          // expandu). preventDefault + stopPropagation.
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="self-start text-xs font-medium text-brand hover:underline focus-ring"
            aria-expanded={expanded}
          >
            {expanded ? "Zobrazit méně" : "Zobrazit více"}
          </button>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-ink-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>💬</span>
              <strong className="text-ink-900 tabular-nums">
                {topic.comment_count}
              </strong>{" "}
              {topic.comment_count === 1
                ? "komentář"
                : topic.comment_count < 5
                  ? "komentáře"
                  : "komentářů"}
            </span>
            {topic.like_count > 0 && (
              <span
                className={[
                  "inline-flex items-center gap-1",
                  topic.i_liked ? "font-medium text-brand" : "text-ink-500",
                ].join(" ")}
              >
                <span aria-hidden>{topic.i_liked ? "♥" : "♡"}</span>
                <span className="tabular-nums">{topic.like_count}</span>
              </span>
            )}
          </div>
          <Link
            href={href}
            className="inline-flex items-center gap-1 font-medium text-ink-700 hover:text-brand focus-ring"
          >
            Otevřít diskuzi
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function TopicComposer({
  canPin,
  onCancel,
  onSubmit,
}: {
  canPin: boolean;
  onCancel: () => void;
  onSubmit: (payload: TopicWritePayload) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        pinned: canPin ? pinned : false,
      });
      setTitle("");
      setBody("");
      setPinned(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handle}
      className="mt-5 flex flex-col gap-4 rounded-md border border-border bg-surface-muted/30 p-4"
    >
      <Field label="Titulek *" htmlFor="topic-title">
        <Input
          id="topic-title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Co máš na srdci?"
        />
      </Field>
      <Field label="Zpráva" htmlFor="topic-body">
        <textarea
          id="topic-body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
          placeholder="Detaily, otázka, informace…"
        />
      </Field>
      {canPin && (
        <label className="flex items-start gap-2 text-sm text-ink-900">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="mt-0.5 size-4 accent-brand"
          />
          Připnout nahoru
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="md" loading={busy}>
          {busy ? "Publikuju…" : "Publikovat"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted"
        >
          Zrušit
        </button>
      </div>
    </form>
  );
}
