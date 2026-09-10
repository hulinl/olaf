"use client";

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

import { TopicCard, type TopicScope } from "./discussion/topic-card";

interface Props {
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
  /** Optional deep-link: id topicu, který má být rozbalený po mount
   *  (typicky z ?t=<id> query paramu). Karta se sama scrollne do view. */
  expandTopicId?: number | null;
  /** #comment-<id> hash — když je set spolu s expandTopicId, karta
   *  po načtení detailu scrollne přímo na komentář. */
  scrollToCommentId?: number | null;
}

/**
 * Feed diskuze — Facebook-style zeď. 2026-09-10 přepis z původního
 * card-only listu (klik vedl na thread page) na inline feed —
 * všechny komentáře, composer + like/reply akce se dějou přímo
 * v kartě. Thread page routes zůstávají alive jen jako redirect na
 * ?t=<id> deep-link, ať staré e-mail/bookmark linky nepadají do
 * 404.
 *
 * Karty jsou samostatné a řídí si vlastní expand state. Wall drží
 * `topics[]` (zdroj pravdy pro listování + pinning) a mutate-callbacky
 * (delete, toggle-pin, comment_count optimistic).
 */
export function DiscussionWall({
  scope,
  currentUser,
  expandTopicId,
  scrollToCommentId,
}: Props) {
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
    void listTopics();
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
      setTopics((prev) => (prev ? prev.filter((t) => t.id !== topicId) : prev));
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

  function handleLocalUpdate(
    topicId: number,
    patch: Partial<DiscussionTopic>,
  ) {
    setTopics((prev) =>
      prev
        ? prev.map((t) => (t.id === topicId ? { ...t, ...patch } : t))
        : prev,
    );
  }

  return (
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

      <TopicFeed
        topics={topics}
        scope={scope}
        currentUser={currentUser}
        expandTopicId={expandTopicId}
        scrollToCommentId={scrollToCommentId}
        onDelete={handleDeleteTopic}
        onTogglePin={handleTogglePin}
        onLocalUpdate={handleLocalUpdate}
      />
    </section>
  );
}

function TopicFeed({
  topics,
  scope,
  currentUser,
  expandTopicId,
  scrollToCommentId,
  onDelete,
  onTogglePin,
  onLocalUpdate,
}: {
  topics: DiscussionTopic[] | null;
  scope: TopicScope;
  currentUser: Props["currentUser"];
  expandTopicId?: number | null;
  scrollToCommentId?: number | null;
  onDelete: (id: number) => Promise<void>;
  onTogglePin: (t: DiscussionTopic) => Promise<void>;
  onLocalUpdate: (id: number, patch: Partial<DiscussionTopic>) => void;
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

  function renderCard(t: DiscussionTopic) {
    return (
      <TopicCard
        key={t.id}
        topic={t}
        scope={scope}
        currentUser={currentUser}
        initiallyExpanded={expandTopicId === t.id}
        scrollToCommentId={
          expandTopicId === t.id ? scrollToCommentId ?? null : null
        }
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onLocalUpdate={onLocalUpdate}
      />
    );
  }

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
