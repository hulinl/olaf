"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { AuthorAvatar, DiscussionComment } from "@/lib/api";

import { PaperclipIcon } from "./icons";

interface Props {
  /** Autor komentáře (aktuálně přihlášený user) — kreslíme jeho avatar
   *  vedle textarea, tak jak to má FB / Slack, ať je vidět kdo píše. */
  currentUser: {
    first_name: string;
    last_name: string;
    avatar_url?: string;
    avatar_focal_x?: number;
    avatar_focal_y?: number;
    avatar_zoom?: number;
  };
  /** Když je nastavené, composer je v „reply to comment" módu (nested
   *  thread). Backend to normalizuje na top-level parent, takže i reply
   *  na reply se linkuje k top-level. */
  replyTo?: DiscussionComment | null;
  /** Když se composer otevřel z „Odpovědět" akce, hostitel může chtít
   *  focus na textarea. Auto-focus po mount, nezávisí na parent klíči. */
  autoFocus?: boolean;
  /** Placeholder text. Feed karta píše „Napiš komentář…", thread view
   *  „Odpověď <jméno>…" když je reply active. */
  placeholder?: string;
  /** Kompaktní variant — menší textarea, žádný avatar (pro nested
   *  reply UX). */
  compact?: boolean;
  onCancelReply?: () => void;
  onSubmit: (payload: {
    body: string;
    attachment: File | null;
    parent: number | null;
  }) => Promise<void>;
}

/**
 * Rich comment composer — text + attachment + reply-to kontext.
 * Extracted 2026-09-10 z DiscussionThread do sdílené komponenty, aby
 * fungoval identicky ve feed kartě (inline diskuze) i v thread page
 * (focus view). Zachovává celý existující flow: object-URL image
 * preview, non-image file pill, reply chip s cancel, disabled state
 * bez obsahu. Používá `currentUser.avatar_*` pro avatar vedle
 * textarea.
 *
 * Emoji picker / mentions / rich formatting = V2. V1 stačí plaintext
 * + attachment (behavior matches Facebook comment box in headline
 * mode).
 */
export function CommentComposer({
  currentUser,
  replyTo,
  autoFocus,
  placeholder,
  compact,
  onCancelReply,
  onSubmit,
}: Props) {
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus, replyTo?.id]);

  // Cleanup object URLs při unmount / výměně.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setAttachment(file);
    setImagePreview(
      file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    );
    e.target.value = "";
  }

  function clearAttachment() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setAttachment(null);
    setImagePreview(null);
  }

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() && !attachment) return;
    setPosting(true);
    try {
      await onSubmit({
        body: body.trim(),
        attachment,
        parent: replyTo?.id ?? null,
      });
      setBody("");
      clearAttachment();
    } finally {
      setPosting(false);
    }
  }

  const effectivePlaceholder =
    placeholder ??
    (replyTo ? `Odpověď ${replyTo.author_name}…` : "Napiš komentář…");

  return (
    <form
      onSubmit={handle}
      className={[
        "flex gap-2",
        compact ? "items-start" : "items-start",
      ].join(" ")}
    >
      {!compact && (
        <Avatar
          firstName={currentUser.first_name}
          lastName={currentUser.last_name}
          avatarUrl={currentUser.avatar_url}
          focalX={currentUser.avatar_focal_x}
          focalY={currentUser.avatar_focal_y}
          zoom={currentUser.avatar_zoom}
          size={32}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-border bg-surface-muted/50 px-3 py-2">
        {replyTo && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/30 bg-brand/5 px-2 py-1 text-xs">
            <span className="text-ink-700">
              Odpovídáš{" "}
              <strong className="text-ink-900">{replyTo.author_name}</strong>
            </span>
            {onCancelReply && (
              <button
                type="button"
                onClick={onCancelReply}
                className="font-medium text-ink-500 hover:text-ink-900"
              >
                × Zrušit
              </button>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={compact ? 1 : 2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={effectivePlaceholder}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter posts. Enter alone keeps newlines
            // (FB-parity — comment textarea is multiline).
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          className="w-full resize-none bg-transparent text-sm text-ink-900 placeholder:text-ink-500 focus:outline-none"
        />
        {imagePreview ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Náhled přílohy"
              className="max-h-40 rounded-md border border-border"
            />
            <button
              type="button"
              onClick={clearAttachment}
              aria-label="Odebrat přílohu"
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-canvas text-ink-700 shadow-sm hover:text-danger focus-ring"
            >
              <span aria-hidden>×</span>
            </button>
          </div>
        ) : attachment ? (
          <div className="flex w-fit items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs">
            <PaperclipIcon />
            <span className="max-w-[240px] truncate font-medium text-ink-900">
              {attachment.name}
            </span>
            <button
              type="button"
              onClick={clearAttachment}
              aria-label="Odebrat přílohu"
              className="text-ink-500 hover:text-danger"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-ink-500 hover:bg-surface hover:text-ink-900 focus-within:ring-2 focus-within:ring-brand/40"
            title="Přidat přílohu"
          >
            <PaperclipIcon />
            <span>{attachment ? "Změnit" : "Příloha"}</span>
            <input
              type="file"
              onChange={pickAttachment}
              className="hidden"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={posting}
            disabled={(!body.trim() && !attachment) || posting}
          >
            {posting
              ? "Odesílám…"
              : replyTo
                ? "Odeslat odpověď"
                : "Publikovat"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// Re-export for callers that want the avatar type in isolation.
export type { AuthorAvatar };
