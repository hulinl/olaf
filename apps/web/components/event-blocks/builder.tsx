"use client";

import { useState } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  BLOCK_TYPE_LABELS,
  type BlockType,
  type EventBlock,
} from "@/lib/event-blocks";

import { PresetPicker } from "./preset-picker";
import { DaysForm } from "./forms/days-form";
import { FaqForm } from "./forms/faq-form";
import { GalleryForm } from "./forms/gallery-form";
import { GearForm } from "./forms/gear-form";
import { HeroForm } from "./forms/hero-form";
import { IncludedSplitForm } from "./forms/included-split-form";
import { MapForm } from "./forms/map-form";
import { OrganizersForm } from "./forms/organizers-form";
import { PracticalForm } from "./forms/practical-form";
import { ProseForm } from "./forms/prose-form";
import { StatsForm } from "./forms/stats-form";

interface EventPriceContext {
  amount: string | null;
  currency: string;
  note: string;
}

interface Props {
  blocks: EventBlock[];
  onChange: (blocks: EventBlock[]) => void;
  /** Both optional so the builder can render in a create flow. When present,
   *  block forms expose upload buttons next to image URL inputs. */
  workspaceSlug?: string;
  eventSlug?: string;
  /** Surfaced to the included_split form so it can render price + currency
   *  + note as read-only (single source of truth = event detail). */
  eventPrice?: EventPriceContext;
  /** Event-level `location_url` z Detaily formu. Předplníme se ho do
   *  nově přidaného Map blocku (`map_url`), aby user nemusel URL
   *  zadávat dvakrát. Backend pak po save synchronizuje obě pole. */
  eventLocationUrl?: string;
}

const ADD_OPTIONS: BlockType[] = [
  "hero",
  "prose",
  "stats",
  "days",
  "included_split",
  "gallery",
  "map",
  "faq",
  "practical",
  "gear",
  "organizers",
];

export function Builder({
  blocks,
  onChange,
  workspaceSlug,
  eventSlug,
  eventPrice,
  eventLocationUrl,
}: Props) {
  // Default to all blocks collapsed — opening the builder with a
  // long page used to dump every form on screen at once, eating
  // scroll on phones. Owners explicitly expand the block they want
  // to edit.
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const confirmDialog = useConfirm();

  function add(type: BlockType) {
    const block = makeBlock(type, { eventLocationUrl });
    onChange([...blocks, block]);
    setOpenId(block.id);
    setPickerOpen(false);
  }

  function applyPreset(presetBlocks: EventBlock[]) {
    onChange(presetBlocks);
    setOpenId(null);
    setPresetPickerOpen(false);
  }

  function update(id: string, payload: EventBlock["payload"]) {
    onChange(
      blocks.map((b) =>
        b.id === id ? ({ ...b, payload } as EventBlock) : b,
      ),
    );
  }

  function remove(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
    if (openId === id) setOpenId(null);
  }

  function move(id: string, direction: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const j = i + direction;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-6 text-center text-sm text-ink-500">
          Zatím žádné bloky. Začni přidáním <strong>Hero</strong> bloku.
        </p>
      )}

      {blocks.map((block, i) => {
        const isOpen = openId === block.id;
        return (
          <div
            key={block.id}
            className="rounded-md border border-border bg-canvas"
          >
            <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-muted/40 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                #{i + 1}
              </span>
              <span className="text-sm font-medium text-ink-900">
                {BLOCK_TYPE_LABELS[block.type]}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(block.id, -1)}
                  disabled={i === 0}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-700 disabled:opacity-30 hover:bg-surface-muted focus-ring"
                  aria-label="Posunout nahoru"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(block.id, 1)}
                  disabled={i === blocks.length - 1}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-700 disabled:opacity-30 hover:bg-surface-muted focus-ring"
                  aria-label="Posunout dolů"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : block.id)}
                  className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
                >
                  {isOpen ? "Sbalit" : "Upravit"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: "Smazat blok?",
                      description: `Blok „${BLOCK_TYPE_LABELS[block.type] ?? block.type}" zmizí z landing page. Můžeš ho znovu přidat z palety bloků.`,
                      confirmLabel: "Smazat",
                      variant: "danger",
                    });
                    if (ok) remove(block.id);
                  }}
                  className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-500 hover:text-danger focus-ring"
                >
                  Smazat
                </button>
              </span>
            </header>
            {isOpen && (
              <div className="px-4 py-4">
                <BlockForm
                  block={block}
                  onChange={(p) => update(block.id, p)}
                  workspaceSlug={workspaceSlug}
                  eventSlug={eventSlug}
                  eventPrice={eventPrice}
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-2 flex flex-col gap-2">
        {presetPickerOpen ? (
          <PresetPicker
            hasExistingBlocks={blocks.length > 0}
            onPick={applyPreset}
            onCancel={() => setPresetPickerOpen(false)}
          />
        ) : pickerOpen ? (
          <div className="rounded-md border border-border bg-canvas p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink-900">Vyber typ bloku</p>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs text-ink-500 hover:text-ink-900"
              >
                Zavřít
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ADD_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => add(t)}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-ink-900 hover:border-brand hover:bg-surface-muted focus-ring"
                >
                  {BLOCK_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex-1 rounded-md border border-dashed border-border-strong bg-surface px-3 py-3 text-sm font-medium text-ink-700 hover:border-brand hover:bg-surface-muted focus-ring"
            >
              + Přidat blok
            </button>
            <button
              type="button"
              onClick={() => setPresetPickerOpen(true)}
              className="rounded-md border border-border bg-surface px-3 py-3 text-sm font-medium text-ink-700 hover:border-brand hover:bg-surface-muted focus-ring sm:px-5"
              title="Začni od šablony — předvyplněné bloky pro typické scénáře"
            >
              Použít vzor…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockForm({
  block,
  onChange,
  workspaceSlug,
  eventSlug,
  eventPrice,
}: {
  block: EventBlock;
  onChange: (payload: EventBlock["payload"]) => void;
  workspaceSlug?: string;
  eventSlug?: string;
  eventPrice?: EventPriceContext;
}) {
  switch (block.type) {
    case "hero":
      return (
        <HeroForm
          payload={block.payload}
          onChange={onChange}
          workspaceSlug={workspaceSlug}
          eventSlug={eventSlug}
        />
      );
    case "prose":
      return (
        <ProseForm
          payload={block.payload}
          onChange={onChange}
          workspaceSlug={workspaceSlug}
          eventSlug={eventSlug}
        />
      );
    case "stats":
      return <StatsForm payload={block.payload} onChange={onChange} />;
    case "days":
      return (
        <DaysForm
          payload={block.payload}
          onChange={onChange}
          workspaceSlug={workspaceSlug}
          eventSlug={eventSlug}
        />
      );
    case "included_split":
      return (
        <IncludedSplitForm
          payload={block.payload}
          onChange={onChange}
          eventPrice={eventPrice}
          workspaceSlug={workspaceSlug}
          eventSlug={eventSlug}
        />
      );
    case "gallery":
      return <GalleryForm payload={block.payload} onChange={onChange} />;
    case "map":
      return <MapForm payload={block.payload} onChange={onChange} />;
    case "faq":
      return <FaqForm payload={block.payload} onChange={onChange} />;
    case "practical":
      return <PracticalForm payload={block.payload} onChange={onChange} />;
    case "gear":
      return <GearForm payload={block.payload} onChange={onChange} />;
    case "organizers":
      return (
        <OrganizersForm
          payload={block.payload}
          onChange={onChange}
          workspaceSlug={workspaceSlug}
          eventSlug={eventSlug}
        />
      );
    default:
      return null;
  }
}

function makeBlock(
  type: BlockType,
  defaults: { eventLocationUrl?: string } = {},
): EventBlock {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  switch (type) {
    case "hero":
      return { id, type, payload: {} };
    case "prose":
      return { id, type, payload: {} };
    case "stats":
      return { id, type, payload: { tiles: [] } };
    case "days":
      return { id, type, payload: { days: [] } };
    case "included_split":
      return { id, type, payload: { included: [], not_included: [] } };
    case "gallery":
      return { id, type, payload: {} };
    case "map":
      // Prefill z event.location_url když ho user vyplnil v Detaily —
      // ušetří mu druhý paste. Sync v backendu pak drží oba fieldy
      // konzistentní.
      return {
        id,
        type,
        payload: { map_url: defaults.eventLocationUrl ?? "" },
      };
    case "faq":
      return { id, type, payload: { items: [] } };
    case "practical":
      return { id, type, payload: {} };
    case "gear":
      return { id, type, payload: { list_slug: "" } };
    case "organizers":
      return { id, type, payload: { user_ids: [] } };
  }
}
