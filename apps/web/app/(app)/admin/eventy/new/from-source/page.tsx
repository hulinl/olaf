"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { EventForm } from "@/components/event-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import type { EventBlock } from "@/lib/event-blocks";
import {
  ApiError,
  type Event as OlafEvent,
  type EventDraftFromSource,
  type Workspace,
  events,
  workspaces,
} from "@/lib/api";

/**
 * "Vytvořit z odkazu" — paste a Notion URL, Olaf reads it via the
 * user's stored Notion integration, sends content to the user's
 * stored Anthropic key, and returns a draft Event the owner can
 * review + edit in the standard form. Nothing is persisted until
 * the owner explicitly hits "Vytvořit akci" at the bottom.
 */
export default function NewEventFromSourcePage() {
  const router = useRouter();
  const [home, setHome] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [missingIntegration, setMissingIntegration] = useState<
    "notion" | "anthropic" | null
  >(null);
  const [draft, setDraft] = useState<EventDraftFromSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await workspaces.mine();
        const owned = mine.filter((w) => w.my_role === "owner");
        if (cancelled) return;
        if (owned.length > 0) {
          setHome(owned[0]);
        } else {
          const p = await workspaces.personal();
          if (cancelled) return;
          setHome(p);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            "/login?next=/admin/eventy/new/from-source",
          );
          return;
        }
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Nepovedlo se připravit novou akci.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setIngestError(null);
    setMissingIntegration(null);
    try {
      const r = await events.ingestFromSource(url.trim());
      setDraft(r);
    } catch (err) {
      if (err instanceof ApiError) {
        const missing = err.data?.missing;
        if (missing === "notion" || missing === "anthropic") {
          setMissingIntegration(missing);
        }
        setIngestError(
          typeof err.data?.detail === "string" ? err.data.detail : err.message,
        );
      } else {
        setIngestError("Načtení z odkazu selhalo.");
      }
    } finally {
      setBusy(false);
    }
  }

  const crumbs = [
    { label: "Akce", href: "/admin/eventy" },
    { label: "Nová z odkazu" },
  ];

  if (loadError) return <Alert variant="danger">{loadError}</Alert>;
  if (!home) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  // Step 2: draft loaded — render the standard event form with our
  // draft mounted as initial. The form is full-featured, so the owner
  // can fill anything the AI missed (or correct it) before saving.
  if (draft) {
    return (
      <DraftReview
        draft={draft}
        homeSlug={home.slug}
        crumbs={crumbs}
        onCreated={(workspaceSlug, eventSlug) =>
          router.push(`/admin/eventy/${workspaceSlug}/${eventSlug}/edit`)
        }
      />
    );
  }

  // Step 1: ask for the URL.
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={crumbs} />

      <header>
        <p className="text-sm font-medium text-brand">Nová akce z odkazu</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          Vlož odkaz na Notion stránku
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Olaf si stránku načte, předá obsah Claude a vrátí ti
          předvyplněný formulář. Žádný terminál, žádný copy-paste.
          Před prvním použitím nastav obě integrace v{" "}
          <Link
            href="/settings/integrace"
            className="font-medium text-brand hover:underline"
          >
            /settings/integrace
          </Link>
          .
        </p>
      </header>

      <Card>
        <CardSection>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Notion URL"
              htmlFor="src-url"
              hint="Před prvním použitím u dané stránky v Notionu otevři ⋯ → Connections → vyber svoji integraci, jinak vrátí 404."
            >
              <input
                id="src-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.notion.so/myws/Letni-kemp-2026-..."
                required
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
              />
            </Field>

            {ingestError && (
              <Alert variant="danger">
                <span className="whitespace-pre-line">{ingestError}</span>
                {missingIntegration && (
                  <div className="mt-2">
                    <Link
                      href="/settings/integrace"
                      className="text-sm font-medium underline hover:no-underline"
                    >
                      Otevřít /settings/integrace →
                    </Link>
                  </div>
                )}
              </Alert>
            )}

            <div>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={busy}
                disabled={!url.trim()}
              >
                {busy ? "Načítám…" : "Načíst draft"}
              </Button>
            </div>
          </form>
        </CardSection>
      </Card>
    </div>
  );
}

/**
 * Step 2 of the ingest flow. Owns the "update existing vs create new"
 * decision when the same Notion page was already ingested previously,
 * then mounts EventForm with the AI-extracted draft. On submit it
 * routes to either PATCH /update/ (preserves slug + RSVPs) or POST
 * /create/ (stamps the page_id on a fresh event).
 */
function DraftReview({
  draft,
  homeSlug,
  crumbs,
  onCreated,
}: {
  draft: EventDraftFromSource;
  homeSlug: string;
  crumbs: { label: string; href?: string }[];
  onCreated: (workspaceSlug: string, eventSlug: string) => void;
}) {
  const existing = draft.existing_event;
  // Default to "update" when there's a match — that's the common case
  // (organiser edits the same Notion page and re-ingests). Owner can
  // override if the page truly describes a new event instance.
  const [mode, setMode] = useState<"update" | "create">(
    existing ? "update" : "create",
  );

  const blocksFromDraft: EventBlock[] = draft.blocks ?? [];
  const initial = draftToOlafEvent(draft, blocksFromDraft);
  // When updating, target the workspace that owns the existing event,
  // not the user's "home" workspace, so a personal-workspace owner
  // who later moved the event into a community still updates the
  // right row.
  const targetWorkspaceSlug =
    mode === "update" && existing ? existing.workspace_slug : homeSlug;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={crumbs} />

      <header>
        <p className="text-sm font-medium text-brand">
          {mode === "update" ? "Aktualizace z odkazu" : "Nová akce z odkazu"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          Zkontroluj a uprav
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Claude vytáhl pole + bloky landing-page z{" "}
          {draft.source_url || "tvého odkazu"}. Projdi je, doplň, co AI
          minula, a klikni{" "}
          {mode === "update"
            ? "„Aktualizovat akci“"
            : "„Vytvořit akci“"}
          .
        </p>
      </header>

      {existing && (
        <Card>
          <CardSection>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
              Tato Notion stránka už eviduje akci
            </p>
            <p className="mt-2 text-sm text-ink-700">
              <strong>{existing.title}</strong>{" "}
              <span className="text-ink-500">
                ({existing.workspace_slug}/{existing.slug} · {existing.status})
              </span>
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-border-strong sm:flex-1">
                <input
                  type="radio"
                  name="ingest-mode"
                  value="update"
                  checked={mode === "update"}
                  onChange={() => setMode("update")}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block">Aktualizovat existující</strong>
                  <span className="text-xs text-ink-500">
                    Zachová slug, registrace, faktury. Doporučeno.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-border-strong sm:flex-1">
                <input
                  type="radio"
                  name="ingest-mode"
                  value="create"
                  checked={mode === "create"}
                  onChange={() => setMode("create")}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block">Vytvořit nový event</strong>
                  <span className="text-xs text-ink-500">
                    Pro případ, kdy stránka popisuje nový běh akce. Starý
                    event zůstane spojený se stránkou.
                  </span>
                </span>
              </label>
            </div>
          </CardSection>
        </Card>
      )}

      {draft.notes && draft.notes.length > 0 && (
        <Card>
          <CardSection>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              Co Claude zaznamenala, ale nepřiřadila k poli
            </p>
            <ul className="mt-2 ml-4 list-disc space-y-1 text-sm text-ink-700">
              {draft.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </CardSection>
        </Card>
      )}

      <EventForm
        // Force a remount when the user flips the mode so EventForm's
        // internal state (e.g. blocks editor) resets to the right
        // initial. Without this the form keeps the previous mode's
        // hydrated state.
        key={mode + (existing?.id ?? "")}
        workspaceSlug={targetWorkspaceSlug}
        initial={initial}
        onSubmit={(payload) => {
          if (mode === "update" && existing) {
            // PATCH — preserve external_ref (already set on the
            // existing row), don't echo it back in the payload to
            // avoid the rare case where the user edited it.
            return events.update(
              existing.workspace_slug,
              existing.slug,
              payload,
            );
          }
          // Create — stamp external_ref so the next ingest hits the
          // upsert path. If the user explicitly chose "create new"
          // when an existing event was offered, this overwrites the
          // pointer (the old event is now orphaned from this Notion
          // page, which matches user intent).
          const payloadWithRef = {
            ...payload,
            external_ref: `notion:${draft.notion_page_id}`,
          };
          return events.create(targetWorkspaceSlug, payloadWithRef);
        }}
        onSuccess={(event) =>
          onCreated(targetWorkspaceSlug, event.slug)
        }
        submitLabel={
          mode === "update" ? "Aktualizovat akci" : "Vytvořit akci"
        }
      />
    </div>
  );
}

/**
 * Shape the slim ingest payload as an OlafEvent so EventForm can
 * read it via its `initial` prop. Most of the OlafEvent surface is
 * uninteresting at this stage — fill the few fields Claude extracts,
 * leave the rest as empty/null defaults. Cast through `unknown`
 * because Partial<OlafEvent> isn't structurally compatible.
 */
function draftToOlafEvent(
  draft: EventDraftFromSource,
  blocks: EventBlock[],
): OlafEvent {
  const base: Partial<OlafEvent> = {
    title: draft.title ?? "",
    slug: "",
    description: draft.description ?? "",
    starts_at: draft.starts_at ?? "",
    ends_at: draft.ends_at ?? "",
    tz: "Europe/Prague",
    location_text: draft.location_text ?? "",
    meeting_point_text: draft.meeting_point_text ?? "",
    location_url: draft.location_url ?? "",
    capacity: draft.capacity ?? null,
    waitlist_enabled: true,
    visibility: "public",
    status: "draft",
    requires_approval: false,
    price_amount: draft.price_amount ?? null,
    price_currency: draft.price_currency ?? "CZK",
    price_note: draft.price_note ?? "",
    payment_in_cash: false,
    billing_profile: null,
    blocks,
    enabled_questionnaire_sections: [],
    community_slugs: [],
    shared_workspace_slugs: [],
    images: [],
    required_documents: [],
    risk_checklist: [],
    recommended_gear_list: null,
  };
  return base as unknown as OlafEvent;
}
