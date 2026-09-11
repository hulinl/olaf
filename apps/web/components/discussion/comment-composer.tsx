"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

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

  const canSubmit = (body.trim().length > 0 || !!attachment) && !posting;

  // Avatar u composeru neukazujeme — user píše za sebe, přebývá tam
  // (user report 2026-09-11). Avatar se objeví teprve u vlastního
  // komentáře v listu.
  return (
    <form
      onSubmit={handle}
      className="flex items-start gap-2"
    >
      {/* Kompaktní bublina — jeden řádek s inline paperclip + odeslat
          ikonou. Reply chip a přílohové preview se přidávají nahoře
          když jsou aktivní. Menší padding + placeholder shrinks celý
          composer o polovinu proti FB-mock ale zachovává funkce. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-full border border-border bg-surface-muted/50 px-2 py-1 focus-within:border-brand/40 focus-within:bg-surface">
        {replyTo && (
          <div className="mx-1 mt-1 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/30 bg-brand/5 px-2 py-0.5 text-[11px]">
            <span className="text-ink-700">
              Odpověď{" "}
              <strong className="text-ink-900">{replyTo.author_name}</strong>
            </span>
            {onCancelReply && (
              <button
                type="button"
                onClick={onCancelReply}
                className="font-medium text-ink-500 hover:text-ink-900"
                aria-label="Zrušit odpověď"
              >
                ×
              </button>
            )}
          </div>
        )}
        {(imagePreview || attachment) && (
          <div className="mx-1">
            {imagePreview ? (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Náhled přílohy"
                  className="max-h-32 rounded-md border border-border"
                />
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label="Odebrat přílohu"
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-canvas text-[10px] text-ink-700 shadow-sm hover:text-danger focus-ring"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            ) : attachment ? (
              <div className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px]">
                <PaperclipIcon />
                <span className="max-w-[200px] truncate font-medium text-ink-900">
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
          </div>
        )}
        <div className="flex items-end gap-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            placeholder={effectivePlaceholder}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
              }
            }}
            className="min-h-[28px] w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-sm text-ink-900 placeholder:text-ink-500 focus:outline-none"
          />
          <label
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-500 hover:bg-surface hover:text-ink-900 focus-within:ring-2 focus-within:ring-brand/40"
            title={attachment ? "Změnit přílohu" : "Přidat přílohu"}
          >
            <PaperclipIcon />
            <input
              type="file"
              onChange={pickAttachment}
              className="hidden"
            />
          </label>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label={replyTo ? "Odeslat odpověď" : "Publikovat"}
            className={[
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-ring",
              canSubmit
                ? "bg-brand text-brand-ink hover:opacity-90"
                : "bg-surface text-ink-500 opacity-60",
            ].join(" ")}
          >
            {posting ? (
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-brand-ink/40 border-t-brand-ink" />
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Feather-icons Send glyph — telegram-like paper plane. */
function SendIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  );
}

// Re-export for callers that want the avatar type in isolation.
export type { AuthorAvatar };
