"use client";

import { Field, Input } from "@/components/ui/field";
import type { FaqBlockPayload, FaqItem } from "@/lib/event-blocks";

interface Props {
  payload: FaqBlockPayload;
  onChange: (p: FaqBlockPayload) => void;
}

export function FaqForm({ payload, onChange }: Props) {
  const items = payload.items ?? [];

  function updateItem(i: number, patch: Partial<FaqItem>) {
    onChange({
      ...payload,
      items: items.map((it, idx) =>
        idx === i ? { ...it, ...patch } : it,
      ),
    });
  }

  function add() {
    onChange({
      ...payload,
      items: [...items, { question: "", answer: "" }],
    });
  }

  function remove(i: number) {
    onChange({ ...payload, items: items.filter((_, idx) => idx !== i) });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ ...payload, items: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Eyebrow">
          <Input
            value={payload.eyebrow ?? ""}
            onChange={(e) => onChange({ ...payload, eyebrow: e.target.value })}
            placeholder="FAQ"
          />
        </Field>
        <Field label="Nadpis sekce">
          <Input
            value={payload.title ?? ""}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            placeholder="Časté dotazy"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 px-3 py-2 text-sm text-ink-500">
            Žádné otázky. Přidej první dotaz.
          </p>
        )}
        {items.map((it, i) => (
          <div
            key={i}
            className="rounded-md border border-border bg-surface p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Otázka #{i + 1}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-700 disabled:opacity-30 hover:bg-surface-muted focus-ring"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-700 disabled:opacity-30 hover:bg-surface-muted focus-ring"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-500 hover:text-danger focus-ring"
                >
                  Smazat
                </button>
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Otázka">
                <Input
                  value={it.question}
                  onChange={(e) => updateItem(i, { question: e.target.value })}
                  placeholder="Pro koho je akce určená?"
                />
              </Field>
              <Field label="Odpověď">
                <textarea
                  value={it.answer}
                  onChange={(e) => updateItem(i, { answer: e.target.value })}
                  rows={3}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="w-full rounded-md border border-dashed border-border-strong bg-surface px-3 py-2 text-sm font-medium text-ink-700 hover:border-brand hover:bg-surface-muted focus-ring"
      >
        + Přidat otázku
      </button>
    </div>
  );
}
