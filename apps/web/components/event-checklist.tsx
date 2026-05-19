"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type ChecklistAutoItem,
  type ChecklistManualItem,
  type ChecklistPreset,
  type EventChecklist,
  events,
} from "@/lib/api";

interface Props {
  workspaceSlug: string;
  eventSlug: string;
}

const CATEGORY_TONE: Record<string, string> = {
  basics: "bg-surface-muted text-ink-700",
  content: "bg-surface-muted text-ink-700",
  payment: "bg-warning/15 text-warning",
  status: "bg-brand/15 text-brand",
  risk: "bg-danger-soft text-danger",
  gear: "bg-surface-muted text-ink-700",
  comms: "bg-success/10 text-success",
  logistics: "bg-surface-muted text-ink-700",
  safety: "bg-danger-soft text-danger",
};

const CATEGORY_LABEL: Record<string, string> = {
  basics: "Základy",
  content: "Obsah",
  payment: "Platby",
  status: "Status",
  risk: "Rizika",
  gear: "Vybavení",
  comms: "Komunikace",
  logistics: "Logistika",
  safety: "Bezpečnost",
};

/**
 * Creator's event roadmap — bubbles of "done / todo" items.
 * Auto items reflect event state (price set? location? published?); the
 * `action_href` deep-links to where the owner flips them to done.
 * Manual items are tasks the owner adds from presets or freeform.
 */
export function EventChecklist({ workspaceSlug, eventSlug }: Props) {
  const [data, setData] = useState<EventChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);

  async function reload() {
    try {
      const next = await events.checklist(workspaceSlug, eventSlug);
      setData(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Načtení selhalo.");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, eventSlug]);

  if (!data) {
    return (
      <section className="flex justify-center rounded-2xl border border-border bg-surface py-8 shadow-sm">
        <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </section>
    );
  }

  const autoTotal = data.auto.length;
  const autoDone = data.auto.filter((a) => a.done).length;
  const manualTotal = data.manual.length;
  const manualDone = data.manual.filter((m) => m.done).length;
  const grandTotal = autoTotal + manualTotal;
  const grandDone = autoDone + manualDone;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-900">
          Roadmapa akce
        </h3>
        <span
          className={[
            "inline-flex rounded-full px-3 py-0.5 text-xs font-semibold",
            grandDone === grandTotal
              ? "bg-success/20 text-success"
              : "bg-warning/15 text-warning",
          ].join(" ")}
        >
          {grandDone} / {grandTotal} hotovo
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Bublinky stavu akce + tvůj vlastní to-do list. Kliknutí na auto-bublinku tě hodí tam, kde ji vyřešíš.
      </p>

      {error && (
        <div className="mt-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      {/* AUTO items as a horizontal scrollable trail */}
      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Stav akce ({autoDone} / {autoTotal})
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.auto.map((item) => (
            <AutoBubble key={item.key} item={item} />
          ))}
        </div>
      </div>

      {/* MANUAL items */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Tvůj to-do list ({manualDone} / {manualTotal})
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPresetOpen((v) => !v)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
            >
              + Ze šablony
            </button>
            <button
              type="button"
              onClick={() => setComposerOpen((v) => !v)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
            >
              + Vlastní úkol
            </button>
          </div>
        </div>

        {presetOpen && (
          <PresetPicker
            presets={data.presets}
            existing={data.manual}
            onPick={async (key) => {
              try {
                await events.addChecklistFromPreset(
                  workspaceSlug,
                  eventSlug,
                  key,
                );
                await reload();
              } catch (err) {
                setError(
                  err instanceof ApiError
                    ? err.message
                    : "Přidání selhalo.",
                );
              }
            }}
            onClose={() => setPresetOpen(false)}
          />
        )}

        {composerOpen && (
          <ManualComposer
            onCancel={() => setComposerOpen(false)}
            onSubmit={async (payload) => {
              try {
                await events.addChecklistItem(
                  workspaceSlug,
                  eventSlug,
                  payload,
                );
                setComposerOpen(false);
                await reload();
              } catch (err) {
                setError(
                  err instanceof ApiError
                    ? err.firstFieldError() ?? err.message
                    : "Uložení selhalo.",
                );
              }
            }}
          />
        )}

        <div className="mt-3 flex flex-col gap-2">
          {data.manual.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
              Zatím žádné vlastní úkoly. Začni ze šablony nebo si napiš
              vlastní.
            </p>
          ) : (
            data.manual.map((item) => (
              <ManualRow
                key={item.id}
                item={item}
                onToggle={async () => {
                  try {
                    await events.updateChecklistItem(
                      workspaceSlug,
                      eventSlug,
                      item.id,
                      { done: !item.done },
                    );
                    await reload();
                  } catch {
                    /* keep silent */
                  }
                }}
                onDelete={async () => {
                  if (!confirm("Smazat úkol?")) return;
                  try {
                    await events.deleteChecklistItem(
                      workspaceSlug,
                      eventSlug,
                      item.id,
                    );
                    await reload();
                  } catch {
                    /* keep silent */
                  }
                }}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function AutoBubble({ item }: { item: ChecklistAutoItem }) {
  const tone = CATEGORY_TONE[item.category] ?? "bg-surface-muted text-ink-700";
  return (
    <Link
      href={item.action_href || "#"}
      title={item.description}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-ring",
        item.done
          ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
          : "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20",
      ].join(" ")}
    >
      <span aria-hidden>{item.done ? "✓" : "○"}</span>
      <span>{item.title}</span>
      <span
        className={[
          "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
          tone,
        ].join(" ")}
      >
        {CATEGORY_LABEL[item.category] ?? item.category}
      </span>
    </Link>
  );
}

function ManualRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ChecklistManualItem;
  onToggle: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const tone =
    CATEGORY_TONE[item.category] ?? "bg-surface-muted text-ink-700";
  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:gap-3",
        item.done
          ? "border-success/30 bg-success/5"
          : "border-border bg-surface",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.done ? "Označit jako nesplněné" : "Označit jako splněné"}
        className={[
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold transition-colors",
          item.done
            ? "border-success bg-success text-white"
            : "border-border bg-surface hover:bg-surface-muted",
        ].join(" ")}
      >
        {item.done && "✓"}
      </button>
      <div className="flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <p
            className={[
              "text-sm font-medium",
              item.done ? "text-ink-500 line-through" : "text-ink-900",
            ].join(" ")}
          >
            {item.title}
          </p>
          {item.category && (
            <span
              className={[
                "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                tone,
              ].join(" ")}
            >
              {CATEGORY_LABEL[item.category] ?? item.category}
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-1 text-xs text-ink-500">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-ink-500 hover:text-danger sm:shrink-0"
      >
        Smazat
      </button>
    </div>
  );
}

function PresetPicker({
  presets,
  existing,
  onPick,
  onClose,
}: {
  presets: ChecklistPreset[];
  existing: ChecklistManualItem[];
  onPick: (key: string) => Promise<void>;
  onClose: () => void;
}) {
  const usedTitles = new Set(existing.map((m) => m.title));
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-md border border-border bg-surface-muted/30 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink-900">Vyber šablonu</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Zavřít
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {presets.map((p) => {
          const already = usedTitles.has(p.title);
          return (
            <button
              key={p.key}
              type="button"
              disabled={already}
              onClick={async () => {
                await onPick(p.key);
                onClose();
              }}
              className="rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <p className="text-sm font-medium text-ink-900">{p.title}</p>
              <p className="mt-0.5 text-xs text-ink-500">{p.description}</p>
              {already && (
                <p className="mt-1 text-[10px] font-semibold uppercase text-ink-500">
                  Už přidáno
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ManualComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (payload: {
    title: string;
    description?: string;
    category?: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setCategory("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handle}
      className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-surface-muted/30 p-3"
    >
      <Field label="Titulek úkolu *" htmlFor="cl-title">
        <Input
          id="cl-title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Popis (volitelné)" htmlFor="cl-desc">
        <Input
          id="cl-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field
        label="Kategorie"
        htmlFor="cl-cat"
        hint='např. "risk", "gear", "comms" — pomáhá ti to seskupit.'
      >
        <Input
          id="cl-cat"
          value={category}
          onChange={(e) =>
            setCategory(e.target.value.toLowerCase().replace(/[^a-z]/g, ""))
          }
          maxLength={40}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="md" loading={busy}>
          {busy ? "Ukládám…" : "Přidat úkol"}
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
