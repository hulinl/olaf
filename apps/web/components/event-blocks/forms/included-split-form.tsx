"use client";

import Link from "next/link";

import { Field, Input } from "@/components/ui/field";
import { formatEventPrice } from "@/lib/api";
import type {
  BlockListItem,
  IncludedSplitBlockPayload,
} from "@/lib/event-blocks";

interface Props {
  payload: IncludedSplitBlockPayload;
  onChange: (p: IncludedSplitBlockPayload) => void;
  /** Single source of truth for price/currency/note — pulled from
   *  Event.price_amount/_currency/_note set in /edit/detaily. Editing
   *  the values here would diverge from what the rest of the app uses
   *  (RSVP payment amount, QR Platba, faktura), so we lock them. */
  eventPrice?: {
    amount: string | null;
    currency: string;
    note: string;
  };
  workspaceSlug?: string;
  eventSlug?: string;
}

type ListKey = "included" | "not_included";

export function IncludedSplitForm({
  payload,
  onChange,
  eventPrice,
  workspaceSlug,
  eventSlug,
}: Props) {
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

  // Mirror the event-level price into the block payload so the public
  // renderer doesn't need to know about both sources. Falls back to the
  // legacy in-block values for events with no price_amount set.
  const priceValue = eventPrice?.amount ?? payload.price_value ?? "";
  const priceUnit = eventPrice?.currency || payload.price_unit || "";
  const priceNote = eventPrice?.note ?? payload.price_note ?? "";
  const formattedPrice = eventPrice?.amount
    ? formatEventPrice(eventPrice.amount, eventPrice.currency)
    : "";

  const detailsHref =
    workspaceSlug && eventSlug
      ? `/admin/eventy/${workspaceSlug}/${eventSlug}/edit/detaily`
      : null;

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

      <div className="rounded-md border border-border bg-surface-muted/40 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-ink-900">
            Cena, jednotka, poznámka
          </p>
          {detailsHref && (
            <Link
              href={detailsHref}
              className="text-xs font-medium text-brand hover:underline"
            >
              Upravit v detailech akce →
            </Link>
          )}
        </div>
        <p className="mb-3 text-xs text-ink-500">
          Tato pole se dotahují z <strong>Detailů akce</strong> (sekce
          „Cena"), aby zůstala konzistentní s pokyny k platbě a fakturou.
          Tady je nemůžeš měnit.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Cena (hodnota)">
            <Input
              value={
                formattedPrice
                  ? formattedPrice.split(" ")[0]
                  : priceValue || ""
              }
              disabled
              readOnly
              placeholder="Nastav v detailech akce"
            />
          </Field>
          <Field label="Jednotka / měna">
            <Input
              value={priceUnit}
              disabled
              readOnly
              placeholder="CZK"
            />
          </Field>
          <Field label="Poznámka">
            <Input
              value={priceNote}
              disabled
              readOnly
              placeholder="záloha při přihlášení..."
            />
          </Field>
        </div>
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
