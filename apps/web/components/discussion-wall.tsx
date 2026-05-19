"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type DiscussionComment,
  type DiscussionTopic,
  type DiscussionTopicDetail,
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
  /** Current user id — used to gate "smazat můj komentář" / "smazat mé téma". */
  currentUserId: number;
}

/**
 * Reusable wall: list of topics + expand to comments + add comment.
 * Owner (isModerator) can pin / lock / delete any post; authors can
 * delete their own. Locked topics gray out the comment composer.
 *
 * Same component is mounted on:
 *   - /admin/komunity/[slug]/nastenka (workspace scope)
 *   - /events/[ws]/[event]            (event scope, participant zone)
 */
export function DiscussionWall({ scope, currentUserId }: Props) {
  const [topics, setTopics] = useState<DiscussionTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTopicId, setOpenTopicId] = useState<number | null>(null);
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
      if (openTopicId === topicId) setOpenTopicId(null);
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
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
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

      <TopicList
        topics={topics}
        openTopicId={openTopicId}
        setOpenTopicId={setOpenTopicId}
        scope={scope}
        currentUserId={currentUserId}
        handleDeleteTopic={handleDeleteTopic}
        handleTogglePin={handleTogglePin}
        listTopics={listTopics}
      />
    </section>
  );
}

function TopicList({
  topics,
  openTopicId,
  setOpenTopicId,
  scope,
  currentUserId,
  handleDeleteTopic,
  handleTogglePin,
  listTopics,
}: {
  topics: DiscussionTopic[] | null;
  openTopicId: number | null;
  setOpenTopicId: (id: number | null) => void;
  scope: Scope;
  currentUserId: number;
  handleDeleteTopic: (id: number) => Promise<void>;
  handleTogglePin: (t: DiscussionTopic) => Promise<void>;
  listTopics: () => Promise<void>;
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
      open={openTopicId === t.id}
      onToggle={() => setOpenTopicId(openTopicId === t.id ? null : t.id)}
      canDelete={scope.isModerator || t.author_id === currentUserId}
      canModerate={scope.isModerator}
      onDelete={() => handleDeleteTopic(t.id)}
      onTogglePin={() => handleTogglePin(t)}
      scope={scope}
      currentUserId={currentUserId}
      onCommentChange={listTopics}
    />
  );

  return (
    <div className="mt-5 flex flex-col gap-6">
      {pinned.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
            <span aria-hidden>📌</span> Připnuté
          </p>
          <div className="flex flex-col gap-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
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
          <div className="flex flex-col gap-3">{rest.map(renderCard)}</div>
        </div>
      )}
    </div>
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

function TopicCard({
  topic,
  open,
  onToggle,
  canDelete,
  canModerate,
  onDelete,
  onTogglePin,
  scope,
  currentUserId,
  onCommentChange,
}: {
  topic: DiscussionTopic;
  open: boolean;
  onToggle: () => void;
  canDelete: boolean;
  canModerate: boolean;
  onDelete: () => void;
  onTogglePin: () => void;
  scope: Scope;
  currentUserId: number;
  onCommentChange: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<DiscussionTopicDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [composerBody, setComposerBody] = useState("");
  const [posting, setPosting] = useState(false);
  // Optimistic like state — seeded from the prop, owned locally so a
  // toggle doesn't need a full list re-fetch. Reset when the topic id
  // changes (e.g. after a delete + insert in the parent list).
  const [liked, setLiked] = useState<boolean>(topic.i_liked);
  const [likeCount, setLikeCount] = useState<number>(topic.like_count);
  useEffect(() => {
    setLiked(topic.i_liked);
    setLikeCount(topic.like_count);
  }, [topic.id, topic.i_liked, topic.like_count]);

  async function handleToggleLike(e: React.MouseEvent) {
    e.stopPropagation();
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((n) => Math.max(0, n + (nextLiked ? 1 : -1)));
    try {
      const resp =
        scope.kind === "workspace"
          ? await discussions.toggleWorkspaceLike(
              scope.slug,
              topic.id,
              nextLiked,
            )
          : await discussions.toggleEventLike(
              scope.workspaceSlug,
              scope.eventSlug,
              topic.id,
              nextLiked,
            );
      // Sync to server-truth in case of races (someone else liked too).
      setLiked(resp.i_liked);
      setLikeCount(resp.like_count);
    } catch {
      // Rollback on failure.
      setLiked(!nextLiked);
      setLikeCount((n) => Math.max(0, n + (nextLiked ? -1 : 1)));
    }
  }

  async function loadDetail() {
    setLoading(true);
    try {
      const d =
        scope.kind === "workspace"
          ? await discussions.workspaceTopic(scope.slug, topic.id)
          : await discussions.eventTopic(
              scope.workspaceSlug,
              scope.eventSlug,
              topic.id,
            );
      setDetail(d);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !detail) loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handlePostComment(e: FormEvent) {
    e.preventDefault();
    const body = composerBody.trim();
    if (!body) return;
    setPosting(true);
    try {
      if (scope.kind === "workspace") {
        await discussions.addWorkspaceComment(scope.slug, topic.id, body);
      } else {
        await discussions.addEventComment(
          scope.workspaceSlug,
          scope.eventSlug,
          topic.id,
          body,
        );
      }
      setComposerBody("");
      await loadDetail();
      await onCommentChange();
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteComment(c: DiscussionComment) {
    if (!confirm("Smazat komentář?")) return;
    if (scope.kind === "workspace") {
      await discussions.deleteWorkspaceComment(scope.slug, topic.id, c.id);
    } else {
      await discussions.deleteEventComment(
        scope.workspaceSlug,
        scope.eventSlug,
        topic.id,
        c.id,
      );
    }
    await loadDetail();
    await onCommentChange();
  }

  return (
    <article className="rounded-md border border-border bg-surface">
      <header
        onClick={onToggle}
        className="flex cursor-pointer flex-wrap items-baseline justify-between gap-3 px-4 py-3 hover:bg-brand/5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
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
            <p className="text-sm font-semibold text-ink-900">
              {topic.title}
            </p>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {topic.author_name} ·{" "}
            {new Date(topic.last_activity_at).toLocaleString("cs-CZ", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {topic.comment_count}{" "}
            {topic.comment_count === 1
              ? "komentář"
              : topic.comment_count < 5
                ? "komentáře"
                : "komentářů"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleLike}
            aria-pressed={liked}
            aria-label={liked ? "Zrušit lajk" : "Lajknout"}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-ring",
              liked
                ? "border-brand/40 bg-brand/10 text-brand"
                : "border-border bg-surface text-ink-500 hover:bg-surface-muted hover:text-ink-900",
            ].join(" ")}
          >
            <span aria-hidden>{liked ? "♥" : "♡"}</span>
            <span className="tabular-nums">{likeCount}</span>
          </button>
          <span className="text-xs text-ink-500">
            {open ? "Skrýt" : "Otevřít"}
          </span>
        </div>
      </header>

      {open && (
        <div className="border-t border-border px-4 py-4">
          {topic.body && (
            <p className="whitespace-pre-wrap text-sm text-ink-700">
              {topic.body}
            </p>
          )}

          {(canDelete || canModerate) && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              {canModerate && (
                <button
                  type="button"
                  onClick={onTogglePin}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted"
                >
                  {topic.pinned ? "Odepnout" : "Připnout"}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-500 hover:text-danger"
                >
                  Smazat téma
                </button>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3">
            {loading && !detail && (
              <div className="flex justify-center py-3">
                <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
              </div>
            )}
            {detail?.comments.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-border bg-surface-muted/30 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-ink-900">
                    {c.author_name}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-ink-500">
                      {new Date(c.created_at).toLocaleString("cs-CZ", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {(canModerate || c.author_id === currentUserId) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(c)}
                        className="text-[11px] text-ink-500 hover:text-danger"
                      >
                        Smazat
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">
                  {c.body}
                </p>
              </div>
            ))}
            {detail?.comments.length === 0 && (
              <p className="text-xs text-ink-500">
                Zatím žádný komentář.
              </p>
            )}
          </div>

          {!topic.locked && (
            <form onSubmit={handlePostComment} className="mt-4 flex flex-col gap-2">
              <textarea
                rows={2}
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                placeholder="Napiš komentář…"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
              <div>
                <Button
                  type="submit"
                  variant="secondary"
                  size="md"
                  loading={posting}
                  disabled={!composerBody.trim()}
                >
                  {posting ? "Posílám…" : "Odeslat"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
