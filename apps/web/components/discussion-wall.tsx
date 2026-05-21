"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
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
    if (!confirm("Smazat téma se všemi komentáři?")) return;
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

  return (
    <div className="mt-5 flex flex-col gap-6">
      {pinned.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
            <span aria-hidden>📌</span> Připnuté
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {pinned.map(renderCard)}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          {pinned.length > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              Ostatní příspěvky
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">{rest.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
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
  return (
    <article
      className={[
        "group relative flex flex-col gap-2 rounded-xl border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-brand/40",
        topic.pinned ? "border-brand/40" : "border-border",
      ].join(" ")}
    >
      {/* Action icons in the top-right corner, only visible on hover so
          they don't compete with the title for attention. */}
      {(canModerate || canDelete) && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-ink-500 shadow-sm hover:bg-surface-muted hover:text-ink-900 focus-ring"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-ink-500 shadow-sm hover:text-danger focus-ring"
            >
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
      )}

      <Link href={href} className="flex flex-col gap-2 focus-ring">
        <div className="flex flex-wrap items-center gap-2">
          {topic.pinned && (
            <span className="inline-flex rounded bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">
              Připnuto
            </span>
          )}
          {topic.locked && (
            <span className="inline-flex rounded bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-500">
              Zamčeno
            </span>
          )}
        </div>
        {/* pr-16 reserves space for the hover icons in the top-right
            corner so the title's last words never slide under them. */}
        <h4
          className="line-clamp-2 pr-16 text-base font-semibold text-ink-900"
          style={{ letterSpacing: "-0.015em" }}
        >
          {topic.title}
        </h4>
        {topic.body && (
          <p className="line-clamp-2 text-sm text-ink-500">{topic.body}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span>{topic.author_name}</span>
          <span aria-hidden>·</span>
          <span>
            {new Date(topic.last_activity_at).toLocaleDateString("cs-CZ", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="text-ink-900 tabular-nums">
              {topic.comment_count}
            </strong>{" "}
            {topic.comment_count === 1
              ? "komentář"
              : topic.comment_count < 5
                ? "komentáře"
                : "komentářů"}
          </span>
          {/* Like is rendered as its own glyph + count — no leading
              "·" separator so when the metadata wraps to a second line
              the heart doesn't dangle behind a stray dot. */}
          {topic.like_count > 0 && (
            <span
              className={[
                "inline-flex items-center gap-1",
                topic.i_liked
                  ? "font-medium text-brand"
                  : "text-ink-500",
              ].join(" ")}
            >
              <span aria-hidden>{topic.i_liked ? "♥" : "♡"}</span>
              <span className="tabular-nums">{topic.like_count}</span>
            </span>
          )}
        </div>
      </Link>
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
