"use client";

import { RichText } from "@/components/rich-text";
import { Avatar } from "@/components/ui/avatar";
import { assetUrl, type DiscussionComment } from "@/lib/api";

import { PaperclipIcon } from "./icons";

interface Props {
  c: DiscussionComment;
  /** True u nested reply — vykreslíme s odsazením + accent border. */
  nested?: boolean;
  canModerate: boolean;
  currentUserId: number;
  /** Optional callback pro „Odpovědět" akci — volané parent, který
   *  otevře composer s replyTo set. Když je omitted (třeba u FB-style
   *  read-only preview 2 komentářů ve feedu), tlačítko schováme. */
  onReply?: () => void;
  onToggleLike: () => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * Single comment „bubble" — sdílená prezentace mezi thread view (full
 * discussion) a feed inline diskuzí. Odchází s předchozí verzí
 * z DiscussionThread; extract 2026-09-10.
 *
 * Layout inspiruje FB: avatar vlevo, `bubble` s jménem+tělem vpravo,
 * meta actions (like/reply/smazat) pod bublinou. Attachment (obrázek
 * nebo file pill) se renderuje pod tělem.
 */
export function CommentCard({
  c,
  nested,
  canModerate,
  currentUserId,
  onReply,
  onToggleLike,
  onDelete,
}: Props) {
  return (
    <div
      id={`comment-${c.id}`}
      className={[
        "flex scroll-mt-20 flex-col gap-1 target:ring-2 target:ring-brand/40 target:rounded-lg",
        nested ? "ml-9 sm:ml-11" : "",
      ].join(" ")}
    >
      {/* Avatar je součástí bubliny — inline s jménem, výška ≈ výška
          textu jména. User request 2026-09-11 („miniatura jako součást
          bubliny, stejně vysoká jako jméno"). */}
      <div className="w-fit max-w-full rounded-2xl bg-surface-muted/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Avatar
            firstName={c.author_name}
            lastName=""
            avatarUrl={c.author_avatar.url}
            focalX={c.author_avatar.focal_x}
            focalY={c.author_avatar.focal_y}
            zoom={c.author_avatar.zoom}
            size={16}
            userId={c.author_id ?? null}
            userSlug={c.author_avatar.slug || null}
          />
          {c.author_avatar.slug || c.author_id ? (
            <a
              href={`/u/${c.author_avatar.slug || c.author_id}`}
              className="text-[13px] font-semibold leading-none text-ink-900 hover:text-brand"
            >
              {c.author_name}
            </a>
          ) : (
            <p className="text-[13px] font-semibold leading-none text-ink-900">
              {c.author_name}
            </p>
          )}
        </div>
        {c.body && (
          <RichText
            text={c.body}
            className="mt-1 block whitespace-pre-wrap break-words text-sm text-ink-700"
          />
        )}
      </div>
      {c.attachment_url && (
        <CommentAttachment
          url={c.attachment_url}
          name={c.attachment_name}
        />
      )}
      <div className="ml-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
        <button
          type="button"
          onClick={() => onToggleLike()}
            aria-pressed={c.i_liked}
            className={[
              "font-medium hover:text-ink-900",
              c.i_liked ? "text-brand" : "text-ink-500",
            ].join(" ")}
          >
            {c.i_liked ? "Líbí se ti to" : "Líbí"}
          </button>
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="font-medium hover:text-ink-900"
            >
              Odpovědět
            </button>
          )}
          <span aria-hidden>·</span>
          <span title={new Date(c.created_at).toLocaleString("cs-CZ")}>
            {new Date(c.created_at).toLocaleString("cs-CZ", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {c.like_count > 0 && (
            <span
              className={[
                "inline-flex items-center gap-1",
                c.i_liked ? "text-brand" : "text-ink-500",
              ].join(" ")}
            >
              <span aria-hidden>♥</span>
              <span className="tabular-nums">{c.like_count}</span>
            </span>
          )}
        {(canModerate || c.author_id === currentUserId) && (
          <button
            type="button"
            onClick={() => onDelete()}
            className="ml-auto hover:text-danger"
          >
            Smazat
          </button>
        )}
      </div>
    </div>
  );
}

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
        className="ml-3 block w-fit overflow-hidden rounded-md border border-border bg-surface-muted focus-ring"
        aria-label="Zvětšit fotku"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={absolute}
          alt={name || ""}
          className="max-h-60 max-w-full object-contain"
        />
      </a>
    );
  }
  return (
    <a
      href={absolute}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-3 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
    >
      <PaperclipIcon />
      <span>{name || "soubor"}</span>
      <span aria-hidden className="text-ink-500">
        ↓
      </span>
    </a>
  );
}
