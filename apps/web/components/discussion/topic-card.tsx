"use client";

import { useEffect, useRef, useState } from "react";

import { RichText } from "@/components/rich-text";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  type DiscussionComment,
  type DiscussionTopic,
  type DiscussionTopicDetail,
  discussions,
} from "@/lib/api";

import { CommentCard } from "./comment-card";
import { CommentComposer } from "./comment-composer";

/** Scope určuje, na jaké API endpointy volat. Stejný pattern jako
 *  DiscussionWall / DiscussionThread. */
export type TopicScope =
  | { kind: "workspace"; slug: string; isModerator: boolean }
  | {
      kind: "event";
      workspaceSlug: string;
      eventSlug: string;
      isModerator: boolean;
    };

interface Props {
  topic: DiscussionTopic;
  scope: TopicScope;
  currentUser: {
    id: number;
    first_name: string;
    last_name: string;
    avatar_url?: string;
    avatar_focal_x?: number;
    avatar_focal_y?: number;
    avatar_zoom?: number;
  };
  /** Auto-expand tenhle topic po mount — používá se pro deep-link
   *  z e-mailu (?t=<id>#comment-<id>). Wall page prošle přes prop. */
  initiallyExpanded?: boolean;
  /** Auto-scroll na komentář `#comment-<id>` po načtení detailu.
   *  Nastavuje wall page z URL hash. */
  scrollToCommentId?: number | null;
  /** Notifikace host komponentě — po smazání karta zmizí z listu, po
   *  pin toggle se list re-fetchuje aby respektoval nové pořadí. */
  onDelete: (topicId: number) => Promise<void> | void;
  onTogglePin: (topic: DiscussionTopic) => Promise<void> | void;
  /** Optimistic UI update pro change v topic (like, pin) nebo v
   *  komentářích. Wall drží listopic state, karta jen informuje. */
  onLocalUpdate?: (topicId: number, patch: Partial<DiscussionTopic>) => void;
}

/**
 * FB-style topic card s inline diskuzí — kompletní feed post experience
 * v jedné kartě. Body (existující post), reactions bar, preview 2
 * posledních komentářů (server-side v `topic.recent_comments`),
 * expand tlačítko na plný thread, comment composer vždy viditelný.
 * Reply-to-comment funguje, nested replies se linkují k top-level
 * parentovi (backend normalizuje). Přepis discussion-wall TopicCard
 * 2026-09-10 na user request „chci to jako Facebook feed, bez
 * proklikávání".
 */
export function TopicCard({
  topic,
  scope,
  currentUser,
  initiallyExpanded,
  scrollToCommentId,
  onDelete,
  onTogglePin,
  onLocalUpdate,
}: Props) {
  const confirmDialog = useConfirm();
  const [expanded, setExpanded] = useState(!!initiallyExpanded);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [detail, setDetail] = useState<DiscussionTopicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DiscussionComment | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const canModerate = scope.isModerator;
  const canDeleteTopic = canModerate || topic.author_id === currentUser.id;

  async function loadDetail() {
    setDetailLoading(true);
    setDetailError(null);
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
    } catch (err) {
      setDetailError(
        err instanceof ApiError ? err.message : "Načtení diskuze selhalo.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  // Prvotní expand → jednorázový detail fetch. Znovu se nevolá, dokud
  // někdo neshrne kartu a nevzoumí (idempotent by design).
  useEffect(() => {
    if (expanded && !detail && !detailLoading) {
      void loadDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Po načtení detailu (nebo změně scrollToCommentId) scrollneme na
  // konkrétní komentář. Deep-link z e-mailu.
  useEffect(() => {
    if (!expanded || !detail || !scrollToCommentId) return;
    const el = document.getElementById(`comment-${scrollToCommentId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [expanded, detail, scrollToCommentId]);

  // Po prvotním expand scrollneme ke kartě, ať user hned vidí co
  // rozbaluje (obzvlášť když ho sem přivedl ?t=<id>).
  useEffect(() => {
    if (initiallyExpanded && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleTopicLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    const nextLiked = !topic.i_liked;
    // Optimistic — vrátíme na chybě.
    onLocalUpdate?.(topic.id, {
      i_liked: nextLiked,
      like_count: Math.max(0, topic.like_count + (nextLiked ? 1 : -1)),
    });
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
      onLocalUpdate?.(topic.id, {
        i_liked: resp.i_liked,
        like_count: resp.like_count,
      });
    } catch {
      // Rollback optimistic
      onLocalUpdate?.(topic.id, {
        i_liked: topic.i_liked,
        like_count: topic.like_count,
      });
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleToggleCommentLike(c: DiscussionComment) {
    const nextLiked = !c.i_liked;
    // Optimistic v detailu
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
              topic.id,
              c.id,
              nextLiked,
            )
          : await discussions.toggleEventCommentLike(
              scope.workspaceSlug,
              scope.eventSlug,
              topic.id,
              c.id,
              nextLiked,
            );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((x) =>
                x.id === c.id
                  ? {
                      ...x,
                      i_liked: resp.i_liked,
                      like_count: resp.like_count,
                    }
                  : x,
              ),
            }
          : prev,
      );
    } catch {
      await loadDetail();
    }
  }

  async function handleDeleteComment(c: DiscussionComment) {
    const ok = await confirmDialog({
      title: "Smazat komentář?",
      description: "Komentář i jeho přílohu odebereme nadobro.",
      confirmLabel: "Smazat",
      variant: "danger",
    });
    if (!ok) return;
    try {
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
      // Aktualizuj comment_count v parentu — wall stavu.
      onLocalUpdate?.(topic.id, {
        comment_count: Math.max(0, topic.comment_count - 1),
      });
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : "Smazání selhalo.");
    }
  }

  async function handlePostComment(payload: {
    body: string;
    attachment: File | null;
    parent: number | null;
  }) {
    // Když je karta collapsed, po odeslání ji expandneme, ať user
    // uvidí svůj komentář v kontextu diskuze.
    const needExpand = !expanded;
    try {
      if (scope.kind === "workspace") {
        await discussions.addWorkspaceComment(
          scope.slug,
          topic.id,
          payload.body,
          payload.parent,
          payload.attachment,
        );
      } else {
        await discussions.addEventComment(
          scope.workspaceSlug,
          scope.eventSlug,
          topic.id,
          payload.body,
          payload.parent,
          payload.attachment,
        );
      }
      setReplyTo(null);
      onLocalUpdate?.(topic.id, {
        comment_count: topic.comment_count + 1,
      });
      if (needExpand) {
        setExpanded(true);
        // useEffect na expanded spustí loadDetail; nevoláme přímo,
        // ať se nesouběžně nevyvolá dvakrát.
      } else {
        await loadDetail();
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.firstFieldError() ?? err.message
          : "Odeslání selhalo.";
      throw new Error(msg);
    }
  }

  const created = new Date(topic.created_at);
  const absoluteDate = created.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year:
      created.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  const relative = formatRelative(topic.created_at);

  // Zobrazované komentáře: full list z detailu když expanded, jinak
  // preview 2 posledních ze serveru.
  const previewComments = topic.recent_comments;
  const commentsForRender = expanded ? detail?.comments : previewComments;

  // Group top-level + replies (jen pro expanded mode; preview je flat).
  const groupedComments = (() => {
    if (!commentsForRender) return [];
    if (!expanded) {
      // Preview je flat, chronologicky.
      return commentsForRender.map((c) => ({ top: c, replies: [] }));
    }
    const topLevel = commentsForRender.filter((c) => !c.parent);
    const repliesByParent = new Map<number, DiscussionComment[]>();
    for (const c of commentsForRender) {
      if (c.parent == null) continue;
      const arr = repliesByParent.get(c.parent) ?? [];
      arr.push(c);
      repliesByParent.set(c.parent, arr);
    }
    return topLevel.map((top) => ({
      top,
      replies: repliesByParent.get(top.id) ?? [],
    }));
  })();

  const hiddenCommentsCount = expanded
    ? 0
    : Math.max(0, topic.comment_count - previewComments.length);

  return (
    <article
      ref={cardRef}
      id={`topic-${topic.id}`}
      className={[
        "flex scroll-mt-20 flex-col rounded-xl border bg-surface shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-brand/40 hover:shadow-md target:ring-2 target:ring-brand/40",
        topic.pinned ? "border-brand/40" : "border-border",
      ].join(" ")}
    >
      {/* Top-right meta: pin/lock badges + moderátor menu. Absolute
          pozicované, aby neubíralo pravý prostor titulku a meta-liny
          zbytečně. User request 2026-09-11 („hlavní bude nadpis"). */}
      <TopicTopRight
        pinned={topic.pinned}
        locked={topic.locked}
        canModerate={canModerate}
        canDelete={canDeleteTopic}
        onTogglePin={() => onTogglePin(topic)}
        onDelete={() => onDelete(topic.id)}
      />

      <div className="flex flex-col gap-2 px-3 py-3 pr-14 sm:px-4 sm:pr-16">
        <h4
          className="text-base font-semibold text-ink-900 sm:text-lg"
          style={{ letterSpacing: "-0.015em" }}
        >
          {topic.title}
        </h4>
        {/* Meta-line: doplňkové info malým — mini avatar, jméno, datum,
            relative time. Pod titulem, čte se lehce, hlavní vizuální
            důraz drží titulek. */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-500">
          <MiniAvatar
            url={topic.author_avatar.url}
            focalX={topic.author_avatar.focal_x}
            focalY={topic.author_avatar.focal_y}
            zoom={topic.author_avatar.zoom}
            userSlug={topic.author_avatar.slug || null}
            userId={topic.author_id ?? null}
            initial={initialOf(topic.author_name)}
            colorBg={avatarBg(topic.author_name)}
          />
          <ProfileLink
            userSlug={topic.author_avatar.slug || null}
            userId={topic.author_id ?? null}
            className="font-medium text-ink-700 hover:text-brand"
          >
            {topic.author_name}
          </ProfileLink>
          <span aria-hidden>·</span>
          <time
            dateTime={topic.created_at}
            title={new Date(topic.created_at).toLocaleString("cs-CZ")}
          >
            {absoluteDate}
          </time>
          <span aria-hidden>·</span>
          <span>{relative}</span>
        </div>
        {topic.body && (
          <>
            {/* line-clamp na wrap divu clampne text bez ohledu na
                inline span uvnitř RichText — display: -webkit-box na
                wrap-u + span content jako inline text. Heuristika pro
                „potřebuje expand": > ~4 řádky textu (280 chars nebo
                4+ řádky). Kratší posty se ukazují celé. */}
            {bodyNeedsExpand(topic.body) ? (
              <div
                className={
                  bodyExpanded
                    ? "text-sm leading-snug text-ink-700"
                    : "line-clamp-4 text-sm leading-snug text-ink-700"
                }
              >
                <RichText
                  text={topic.body}
                  className="whitespace-pre-wrap break-words"
                />
              </div>
            ) : (
              <RichText
                text={topic.body}
                className="whitespace-pre-wrap break-words text-sm leading-snug text-ink-700"
              />
            )}
            {bodyNeedsExpand(topic.body) && (
              <button
                type="button"
                onClick={() => setBodyExpanded((v) => !v)}
                aria-expanded={bodyExpanded}
                className="self-start text-xs font-medium text-brand hover:underline focus-ring"
              >
                {bodyExpanded ? "Zobrazit méně" : "Zobrazit více"}
              </button>
            )}
          </>
        )}
      </div>

      <TopicActionsBar
        topic={topic}
        expanded={expanded}
        likeBusy={likeBusy}
        onToggleLike={handleToggleTopicLike}
        onToggleExpand={() => setExpanded((v) => !v)}
      />

      {/* Comments section: hidden N link + preview / full list */}
      <div className="flex flex-col gap-2 border-t border-border bg-surface-muted/20 px-3 py-2 sm:px-4 sm:py-3">
        {detailError && (
          <p className="text-xs text-danger">{detailError}</p>
        )}
        {hiddenCommentsCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start text-[12px] font-medium text-ink-500 hover:text-ink-900 focus-ring"
          >
            Zobrazit{" "}
            {hiddenCommentsCount === 1
              ? "další komentář"
              : `dalších ${hiddenCommentsCount} komentářů`}
          </button>
        )}
        {expanded && detailLoading && !detail && (
          <div className="flex justify-center py-2">
            <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          </div>
        )}
        {commentsForRender && commentsForRender.length > 0 && (
          <ul className="flex flex-col gap-3">
            {groupedComments.map(({ top, replies }) => (
              <li key={top.id} className="flex flex-col gap-2">
                <CommentCard
                  c={top}
                  canModerate={canModerate}
                  currentUserId={currentUser.id}
                  onToggleLike={() => handleToggleCommentLike(top)}
                  onDelete={() => handleDeleteComment(top)}
                  onReply={
                    topic.locked
                      ? undefined
                      : () => {
                          setReplyTo(top);
                          if (!expanded) setExpanded(true);
                        }
                  }
                />
                {replies.map((r) => (
                  <CommentCard
                    key={r.id}
                    c={r}
                    nested
                    canModerate={canModerate}
                    currentUserId={currentUser.id}
                    onToggleLike={() => handleToggleCommentLike(r)}
                    onDelete={() => handleDeleteComment(r)}
                    onReply={
                      topic.locked
                        ? undefined
                        : () => {
                            // Reply na reply se pořád linkuje k top-level.
                            setReplyTo(top);
                          }
                    }
                  />
                ))}
              </li>
            ))}
          </ul>
        )}

        {topic.locked ? (
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-ink-500">
            Diskuze je zamčená — psát nové komentáře nelze.
          </p>
        ) : (
          <CommentComposer
            currentUser={currentUser}
            replyTo={replyTo}
            autoFocus={!!replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSubmit={handlePostComment}
          />
        )}
      </div>
    </article>
  );
}

/** Malý avatar (14px) do meta-liny topic karty. Když má autor
 *  fotku, renderujeme obrázek s focal/zoom; jinak pastelový kruh
 *  s iniciálou. Kliknutí vede na `/u/<userId>`. */
function MiniAvatar({
  url,
  focalX,
  focalY,
  zoom,
  userId,
  userSlug,
  initial,
  colorBg,
}: {
  url: string;
  focalX: number;
  focalY: number;
  zoom: number;
  userId: number | null;
  userSlug: string | null;
  initial: string;
  colorBg: string;
}) {
  const visual = url ? (
    <span className="inline-block h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full bg-surface-strong ring-1 ring-white/60">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        style={{
          objectPosition: `${focalX}% ${focalY}%`,
          transform: `scale(${zoom / 100})`,
          transformOrigin: `${focalX}% ${focalY}%`,
        }}
      />
    </span>
  ) : (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-ink-900 ring-1 ring-white/60"
      style={{ backgroundColor: colorBg }}
    >
      {initial}
    </span>
  );
  return (
    <ProfileLink userId={userId} userSlug={userSlug}>
      {visual}
    </ProfileLink>
  );
}

/** Top-right stack: pin/lock badges + moderátor menu.
 *  Absolute-pozicované, aby netlačilo na hlavní obsah karty. */
function TopicTopRight({
  pinned,
  locked,
  canModerate,
  canDelete,
  onTogglePin,
  onDelete,
}: {
  pinned: boolean;
  locked: boolean;
  canModerate: boolean;
  canDelete: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const showAnything =
    pinned || locked || canModerate || canDelete;
  if (!showAnything) return null;
  return (
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
      {pinned && (
        <span
          title="Připnuto"
          className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand"
        >
          <span aria-hidden>📌</span>
          <span className="hidden sm:inline">Připnuto</span>
        </span>
      )}
      {locked && (
        <span
          title="Zamčeno"
          className="inline-flex rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
        >
          Zamčeno
        </span>
      )}
      {(canModerate || canDelete) && (
        <TopicMenu
          canModerate={canModerate}
          canDelete={canDelete}
          pinned={pinned}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

/** Malý wrapper: pokud známe profile_slug nebo numerické id, wrap v
 *  Linku na `/u/<slug|id>`. Preferujeme slug (canonical URL od
 *  2026-09-11); id je backward-compat fallback. Bez obou (např.
 *  smazaný autor) rendrujeme jen children. */
function ProfileLink({
  userId,
  userSlug,
  children,
  className,
}: {
  userId: number | null;
  userSlug?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const href = userSlug
    ? `/u/${userSlug}`
    : userId
      ? `/u/${userId}`
      : null;
  if (!href) {
    return className ? <span className={className}>{children}</span> : <>{children}</>;
  }
  return (
    <a
      href={href}
      className={className ?? "inline-block hover:opacity-80"}
    >
      {children}
    </a>
  );
}

function TopicMenu({
  canModerate,
  canDelete,
  pinned,
  onTogglePin,
  onDelete,
}: {
  canModerate: boolean;
  canDelete: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Akce s tématem"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-ink-500 hover:bg-surface hover:text-ink-900 focus-ring"
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="currentColor"
        >
          <circle cx="4" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="16" cy="10" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 flex min-w-[160px] flex-col rounded-md border border-border bg-surface py-1 text-sm shadow-lg"
        >
          {canModerate && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onTogglePin();
              }}
              className="px-3 py-1.5 text-left text-ink-700 hover:bg-surface-muted"
            >
              {pinned ? "Odepnout" : "Připnout nahoru"}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="px-3 py-1.5 text-left text-ink-700 hover:bg-surface-muted hover:text-danger"
            >
              Smazat téma
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TopicActionsBar({
  topic,
  expanded,
  likeBusy,
  onToggleLike,
  onToggleExpand,
}: {
  topic: DiscussionTopic;
  expanded: boolean;
  likeBusy: boolean;
  onToggleLike: () => Promise<void>;
  onToggleExpand: () => void;
}) {
  const commentLabel =
    topic.comment_count === 0
      ? "Komentovat"
      : topic.comment_count === 1
        ? "1 komentář"
        : topic.comment_count < 5
          ? `${topic.comment_count} komentáře`
          : `${topic.comment_count} komentářů`;
  return (
    <div className="flex items-center gap-0.5 border-t border-border px-2 py-1">
      <button
        type="button"
        onClick={() => void onToggleLike()}
        aria-pressed={topic.i_liked}
        disabled={likeBusy}
        className={[
          "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium transition-colors focus-ring",
          topic.i_liked
            ? "text-brand hover:bg-brand/5"
            : "text-ink-700 hover:bg-surface-muted",
        ].join(" ")}
      >
        <span aria-hidden>{topic.i_liked ? "♥" : "♡"}</span>
        <span>Líbí</span>
        {topic.like_count > 0 && (
          <span className="tabular-nums text-[11px] text-ink-500">
            · {topic.like_count}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-ink-700 transition-colors hover:bg-surface-muted focus-ring"
      >
        <span aria-hidden>💬</span>
        <span>{commentLabel}</span>
      </button>
    </div>
  );
}

/** Kdy dát „Zobrazit více" tlačítko pod post body. Krátké posty
 *  (méně než ~4 řádky) se ukazují celé — clamp + toggle by tam byl
 *  zbytečný. Heuristika: 280 znaků nebo 4+ hardcoded newliny. */
function bodyNeedsExpand(body: string): boolean {
  return body.length > 280 || body.split("\n").length > 4;
}

/** „Před N dny" / „dnes" / „včera" / older-as-date pro headline. */
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

function initialOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toUpperCase() || "?";
}

function avatarBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 82%)`;
}
