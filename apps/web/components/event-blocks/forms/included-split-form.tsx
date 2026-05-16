"use client";

import { Field, Input } from "@/components/ui/field";
import type {
  BlockListItem,
  IncludedSplitBlockPayload,
} from "@/lib/event-blocks";

interface Props {
  payload: IncludedSplitBlockPayload;
  onChange: (p: IncludedSplitBlockPayload) => void;
}

type ListKey = "included" | "not_included";

export function IncludedSplitForm({ payload, onChange }: Props) {
  function updateItem(
    key: ListKey,
    i: number,
    patch: Partial<BlockListItem>,
  ) {
    const list = payload[key] ?? [];
    onChange({
      ...payload,
      [key]: list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    });
  }

  function addItem(key: ListKey) {
    const list = payload[key] ?? [];
    onChange({ ...payload, [key]: [...list, { label: "", desc: "" }] });
  }

  function removeItem(key: ListKey, i: number) {
    const list = payload[key] ?? [];
    onChange({ ...payload, [key]: list.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="flex flex-col gap-6">
      <ListEditor
        title="V ceně"
        items={payload.included ?? []}
        onAdd={() => addItem("included")}
        onRemove={(i) => removeItem("included", i)}
        onUpdate={(i, p) => updateItem("included", i, p)}
      />
      <ListEditor
        title="Není v ceně"
        items={payload.not_included ?? []}
        onAdd={() => addItem("not_included")}
        onRemove={(i) => removeItem("not_included", i)}
        onUpdate={(i, p) => updateItem("not_included", i, p)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Cena (hodnota)">
          <Input
            placeholder="8 900"
            value={payload.price_value ?? ""}
            onChange={(e) =>
              onChange({ ...payload, price_value: e.target.value })
            }
          />
        </Field>
        <Field label="Jednotka">
          <Input
            placeholder="Kč / osoba"
            value={payload.price_unit ?? ""}
            onChange={(e) =>
              onChange({ ...payload, price_unit: e.target.value })
            }
          />
        </Field>
        <Field label="Poznámka">
          <Input
            placeholder="záloha 3 000 Kč při přihlášení"
            value={payload.price_note ?? ""}
            onChange={(e) =>
              onChange({ ...payload, price_note: e.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}

interface ListEditorProps {
  title: string;
  items: BlockListItem[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, patch: Partial<BlockListItem>) => void;
}

function ListEditor({
  title,
  items,
  onAdd,
  onRemove,
  onUpdate,
}: ListEditorProps) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
        >
          + Přidat položku
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
          Zatím prázdné.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_2fr_auto] items-start gap-2"
            >
              <Input
                placeholder="Ubytování"
                value={it.label ?? ""}
                onChange={(e) => onUpdate(i, { label: e.target.value })}
              />
              <Input
                placeholder="3 noci v horské chatě (polopenze)"
                value={it.desc ?? ""}
                onChange={(e) => onUpdate(i, { desc: e.target.value })}
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="self-stretch rounded-md border border-border bg-surface px-3 text-xs text-ink-500 hover:text-danger"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
