"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import {
  ApiError,
  type DiscussionComment,
  type DiscussionTopicDetail,
  assetUrl,
  discussions,
} from "@/lib/api";

export type ThreadScope =
  | { kind: "workspace"; slug: string; isModerator: boolean }
  | {
      kind: "event";
      workspaceSlug: string;
      eventSlug: string;
      isModerator: boolean;
    };

interface Props {
  topicId: number;
  scope: ThreadScope;
  /** Used to gate "smazat můj komentář" / "smazat mé téma". */
  currentUserId: number;
  /** Where the back link points (top of wall list). */
  backHref: string;
}

/**
 * Dedicated topic-thread view — the wall's card click lands here.
 *
 * Same layout works for workspace + event scope; the scope tells us
 * which set of API endpoints to call. Owner / moderator gets pin +
 * delete; comment authors can delete their own. Inline like buttons on
 * both the topic and each comment. Reply-to-comment + photo upload are
 * next iteration (V2 — see task #104).
 */
export function DiscussionThread({
  topicId,
  scope,
  currentUserId,
  backHref,
}: Props) {
  const [detail, setDetail] = useState<DiscussionTopicDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composerBody, setComposerBody] = useState("");
  const [composerAttachment, setComposerAttachment] = useState<File | null>(
    null,
  );
  /** Object URL for image previews. Null for non-image files (we show
   *  a file pill instead of a thumbnail). */
  const [composerImagePreview, setComposerImagePreview] = useState<
    string | null
  >(null);
  const [posting, setPosting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  /** When set, the composer at the bottom is "replying to" this comment. */
  const [replyTo, setReplyTo] = useState<DiscussionComment | null>(null);

  async function loadDetail() {
    setLoading(true);
    try {
      const d =
        scope.kind === "workspace"
          ? await discussions.workspaceTopic(scope.slug, topicId)
          : await discussions.eventTopic(
              scope.workspaceSlug,
              scope.eventSlug,
              topicId,
            );
      setDetail(d);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, scope.kind]);

  async function handleToggleTopicLike() {
    if (!detail) return;
    const nextLiked = !detail.i_liked;
    setDetail({
      ...detail,
      i_liked: nextLiked,
      like_count: Math.max(0, detail.like_count + (nextLiked ? 1 : -1)),
    });
    try {
      const resp =
        scope.kind === "workspace"
          ? await discussions.toggleWorkspaceLike(scope.slug, topicId, nextLiked)
          : await discussions.toggleEventLike(
              scope.workspaceSlug,
              scope.eventSlug,
              topicId,
              nextLiked,
            );
      setDetail((prev) =>
        prev
          ? { ...prev, i_liked: resp.i_liked, like_count: resp.like_count }
          : prev,
      );
    } catch {
      await loadDetail();
    }
  }

  async function handleTogglePin() {
    if (!detail) return;
    try {
      const payload = { pinned: !detail.pinned };
      if (scope.kind === "workspace") {
        await discussions.updateWorkspaceTopic(scope.slug, topicId, payload);
      } else {
        await discussions.updateEventTopic(
          scope.workspaceSlug,
          scope.eventSlug,
          topicId,
          payload,
        );
      }
      await loadDetail();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Úprava selhala.");
    }
  }

  async function handleDeleteTopic() {
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
      // Topic is gone; punt the user back to the wall.
      window.location.assign(backHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    }
  }

  async function handlePostComment(e: FormEvent) {
    e.preventDefault();
    if (!composerBody.trim() && !composerAttachment) return;
    setPosting(true);
    try {
      const body = composerBody.trim();
      const parent = replyTo?.id ?? null;
      if (scope.kind === "workspace") {
        await discussions.addWorkspaceComment(
          scope.slug,
          topicId,
          body,
          parent,
          composerAttachment,
        );
      } else {
        await discussions.addEventComment(
          scope.workspaceSlug,
          scope.eventSlug,
          topicId,
          body,
          parent,
          composerAttachment,
        );
      }
      setComposerBody("");
      setComposerAttachment(null);
      if (composerImagePreview) URL.revokeObjectURL(composerImagePreview);
      setComposerImagePreview(null);
      setReplyTo(null);
      await loadDetail();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Komentář se nepodařilo odeslat.",
      );
    } finally {
      setPosting(false);
    }
  }

  function pickAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (composerImagePreview) URL.revokeObjectURL(composerImagePreview);
    setComposerAttachment(file);
    // Only generate an inline preview URL for image files; for arbitrary
    // files we show a name pill.
    setComposerImagePreview(
      file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    );
    // Reset so re-picking the same file re-fires onChange.
    e.target.value = "";
  }

  function clearComposerAttachment() {
    if (composerImagePreview) URL.revokeObjectURL(composerImagePreview);
    setComposerAttachment(null);
    setComposerImagePreview(null);
  }

  async function handleDeleteComment(c: DiscussionComment) {
    if (!confirm("Smazat komentář?")) return;
    try {
      if (scope.kind === "workspace") {
        await discussions.deleteWorkspaceComment(scope.slug, topicId, c.id);
      } else {
        await discussions.deleteEventComment(
          scope.workspaceSlug,
          scope.eventSlug,
          topicId,
          c.id,
        );
      }
      await loadDetail();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    }
  }

  async function handleToggleCommentLike(c: DiscussionComment) {
    const nextLiked = !c.i_liked;
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            comments: prev.comments.map((x) =>
              x.id === c.id
                ? {
                    ...x,
                    i_liked: nextLiked,
                    like_count: Math.max(
                      0,
                      x.like_count + (nextLiked ? 1 : -1),
                    ),
                  }
                : x,
            ),
          }
        : prev,
    );
    try {
      const resp =
        scope.kind === "workspace"
          ? await discussions.toggleWorkspaceCommentLike(
              scope.slug,
              topicId,
              c.id,
              nextLiked,
            )
          : await discussions.toggleEventCommentLike(
              scope.workspaceSlug,
              scope.eventSlug,
              topicId,
              c.id,
              nextLiked,
            );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((x) =>
                x.id === c.id
                  ? { ...x, i_liked: resp.i_liked, like_count: resp.like_count }
                  : x,
              ),
            }
          : prev,
      );
    } catch {
      await loadDetail();
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 py-12">
        <Link
          href={backHref}
          className="text-sm text-ink-500 hover:text-ink-900"
        >
          ← Zpět na nástěnku
        </Link>
        <h1 className="text-2xl font-semibold text-ink-900">
          Téma neexistuje
        </h1>
        <p className="text-ink-500">
          Možná bylo smazáno nebo nemáš oprávnění ho vidět.
        </p>
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }
  if (!detail) return null;

  const canDelete = scope.isModerator || detail.author_id === currentUserId;
  const canModerate = scope.isModerator;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={backHref}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Zpět na nástěnku
      </Link>

      <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {detail.pinned && (
              <span className="inline-flex rounded bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">
                Připnuto
              </span>
            )}
            {detail.locked && (
              <span className="inline-flex rounded bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-500">
                Zamčeno
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            {detail.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
            <span>{detail.author_name}</span>
            <span aria-hidden>·</span>
            <span>
              {new Date(detail.created_at).toLocaleString("cs-CZ", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </header>

        {detail.body && (
          <p className="whitespace-pre-wrap text-base text-ink-700">
            {detail.body}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={handleToggleTopicLike}
            aria-pressed={detail.i_liked}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-ring",
              detail.i_liked
                ? "border-brand/40 bg-brand/10 text-brand"
                : "border-border bg-surface text-ink-500 hover:bg-surface-muted hover:text-ink-900",
            ].join(" ")}
          >
            <span aria-hidden>{detail.i_liked ? "♥" : "♡"}</span>
            <span className="tabular-nums">{detail.like_count}</span>
          </button>
          {canModerate && (
            <button
              type="button"
              onClick={handleTogglePin}
              className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
            >
              {detail.pinned ? "Odepnout" : "Připnout"}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDeleteTopic}
              className="ml-auto rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-500 hover:text-danger focus-ring"
            >
              Smazat téma
            </button>
          )}
        </div>
      </article>

      {error && <Alert variant="danger">{error}</Alert>}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">
          Komentáře ({detail.comments.length})
        </h2>
        {(() => {
          // Group comments: top-level (no parent) get their own card;
          // replies render indented underneath. Single-level threading
          // means we don't need recursion.
          const topLevel = detail.comments.filter((c) => !c.parent);
          const repliesByParent = new Map<number, DiscussionComment[]>();
          for (const c of detail.comments) {
            if (c.parent == null) continue;
            const arr = repliesByParent.get(c.parent) ?? [];
            arr.push(c);
            repliesByParent.set(c.parent, arr);
          }
          if (topLevel.length === 0) {
            return (
              <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
                Zatím žádný komentář. Buď první.
              </p>
            );
          }
          return (
            <ul className="flex flex-col gap-3">
              {topLevel.map((c) => (
                <li key={c.id} className="flex flex-col gap-2">
                  <CommentCard
                    c={c}
                    canModerate={canModerate}
                    currentUserId={currentUserId}
                    onToggleLike={() => handleToggleCommentLike(c)}
                    onDelete={() => handleDeleteComment(c)}
                    onReply={() => {
                      setReplyTo(c);
                      // Scroll the composer into view on mobile.
                      const el = document.getElementById(
                        "thread-composer",
                      );
                      el?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                  />
                  {(repliesByParent.get(c.id) ?? []).map((r) => (
                    <CommentCard
                      key={r.id}
                      c={r}
                      nested
                      canModerate={canModerate}
                      currentUserId={currentUserId}
                      onToggleLike={() => handleToggleCommentLike(r)}
                      onDelete={() => handleDeleteComment(r)}
                      onReply={() => {
                        // Replying to a reply still attaches to the
                        // top-level parent (backend normalizes too).
                        setReplyTo(c);
                        const el = document.getElementById(
                          "thread-composer",
                        );
                        el?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                    />
                  ))}
                </li>
              ))}
            </ul>
          );
        })()}
      </section>

      {!detail.locked && (
        <form
          id="thread-composer"
          onSubmit={handlePostComment}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
        >
          {replyTo && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs">
              <span className="text-ink-700">
                Odpovídáš{" "}
                <strong className="text-ink-900">{replyTo.author_name}</strong>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="font-medium text-ink-500 hover:text-ink-900"
              >
                × Zrušit reply
              </button>
            </div>
          )}
          <textarea
            rows={3}
            value={composerBody}
            onChange={(e) => setComposerBody(e.target.value)}
            placeholder={
              replyTo ? `Odpověď ${replyTo.author_name}…` : "Napiš komentář…"
            }
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
          />
          {composerImagePreview ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={composerImagePreview}
                alt="Náhled přílohy"
                className="max-h-48 rounded-md border border-border"
              />
              <button
                type="button"
                onClick={clearComposerAttachment}
                aria-label="Odebrat přílohu"
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-canvas text-ink-700 shadow-sm hover:text-danger focus-ring"
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          ) : composerAttachment ? (
            // Non-image attachment — show a file pill with the name.
            <div className="flex w-fit items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-1.5 text-xs">
              <PaperclipIcon />
              <span className="font-medium text-ink-900">
                {composerAttachment.name}
              </span>
              <button
                type="button"
                onClick={clearComposerAttachment}
                aria-label="Odebrat přílohu"
                className="text-ink-500 hover:text-danger"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={posting}
              disabled={
                (!composerBody.trim() && !composerAttachment) || posting
              }
            >
              {posting
                ? "Odesílám…"
                : replyTo
                  ? "Odeslat odpověď"
                  : "Odeslat komentář"}
            </Button>
            <label
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted focus-within:ring-2 focus-within:ring-brand/40"
              title="Přidat přílohu"
            >
              <PaperclipIcon />
              <span>
                {composerAttachment ? "Změnit přílohu" : "Přidat přílohu"}
              </span>
              {/* No `accept` filter — mobile native picker still shows
                  Photo Library / Take Photo / Choose File, so the user
                  gets the right options without us locking it down. */}
              <input
                type="file"
                onChange={pickAttachment}
                className="hidden"
              />
            </label>
          </div>
        </form>
      )}
    </div>
  );
}

function CommentCard({
  c,
  nested,
  canModerate,
  currentUserId,
  onToggleLike,
  onDelete,
  onReply,
}: {
  c: DiscussionComment;
  nested?: boolean;
  canModerate: boolean;
  currentUserId: number;
  onToggleLike: () => Promise<void>;
  onDelete: () => Promise<void>;
  onReply: () => void;
}) {
  return (
    <div
      className={[
        "rounded-md border border-border bg-surface px-4 py-3",
        nested ? "ml-6 border-l-2 border-l-brand/30 sm:ml-10" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">{c.author_name}</p>
        <p className="text-xs text-ink-500">
          {new Date(c.created_at).toLocaleString("cs-CZ", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      {c.body && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">
          {c.body}
        </p>
      )}
      {c.attachment_url && (
        <CommentAttachment
          url={c.attachment_url}
          name={c.attachment_name}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onToggleLike()}
          aria-pressed={c.i_liked}
          className={[
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-ring",
            c.i_liked
              ? "border-brand/40 bg-brand/10 text-brand"
              : "border-border bg-surface text-ink-500 hover:bg-surface-muted hover:text-ink-900",
          ].join(" ")}
        >
          <span aria-hidden>{c.i_liked ? "♥" : "♡"}</span>
          {c.like_count > 0 && (
            <span className="tabular-nums">{c.like_count}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onReply}
          className="text-[11px] font-medium text-ink-500 hover:text-ink-900"
        >
          Odpovědět
        </button>
        {(canModerate || c.author_id === currentUserId) && (
          <button
            type="button"
            onClick={() => onDelete()}
            className="text-[11px] text-ink-500 hover:text-danger"
          >
            Smazat
          </button>
        )}
      </div>
    </div>
  );
}

/** Inline render for the file attached to a comment. Decides between
 *  "embed as image" and "show as downloadable file pill" by extension
 *  — keeps the markup simple and avoids loading large non-image files
 *  inline. */
function CommentAttachment({ url, name }: { url: string; name: string }) {
  const absolute = assetUrl(url) ?? url;
  const isImage = /\.(png|jpe?g|gif|webp|avif|svg|heic|heif)$/i.test(
    url.split("?")[0] ?? "",
  );
  if (isImage) {
    return (
      <a
        href={absolute}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block w-fit overflow-hidden rounded-md border border-border bg-surface-muted focus-ring"
        aria-label="Zvětšit fotku"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={absolute}
          alt={name || ""}
          className="max-h-72 max-w-full object-contain"
        />
      </a>
    );
  }
  return (
    <a
      href={absolute}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
    >
      <PaperclipIcon />
      <span>{name || "soubor"}</span>
      <span aria-hidden className="text-ink-500">↓</span>
    </a>
  );
}

/** Paperclip glyph — replaces the 📎 emoji which on most platforms
 *  renders as a colorful cropped image at this size. Standard
 *  feather-icons paperclip stroke; renders cleanly down to 14px. */
function PaperclipIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
