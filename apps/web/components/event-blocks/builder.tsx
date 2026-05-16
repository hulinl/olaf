"use client";

import { useState } from "react";

import {
  BLOCK_TYPE_LABELS,
  type BlockType,
  type EventBlock,
} from "@/lib/event-blocks";

import { DaysForm } from "./forms/days-form";
import { HeroForm } from "./forms/hero-form";
import { IncludedSplitForm } from "./forms/included-split-form";
import { ProseForm } from "./forms/prose-form";
import { StatsForm } from "./forms/stats-form";

interface Props {
  blocks: EventBlock[];
  onChange: (blocks: EventBlock[]) => void;
}

const ADD_OPTIONS: BlockType[] = [
  "hero",
  "prose",
  "stats",
  "days",
  "included_split",
];

export function Builder({ blocks, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(blocks[0]?.id ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  function add(type: BlockType) {
    const block = makeBlock(type);
    onChange([...blocks, block]);
    setOpenId(block.id);
    setPickerOpen(false);
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
                  onClick={() => {
                    if (confirm("Opravdu smazat tento blok?")) remove(block.id);
                  }}
                  className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-500 hover:text-danger focus-ring"
                >
                  Smazat
                </button>
              </span>
            </header>
            {isOpen && (
              <div className="px-4 py-4">
                <BlockForm block={block} onChange={(p) => update(block.id, p)} />
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-2">
        {pickerOpen ? (
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
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-md border border-dashed border-border-strong bg-surface px-3 py-3 text-sm font-medium text-ink-700 hover:border-brand hover:bg-surface-muted focus-ring"
          >
            + Přidat blok
          </button>
        )}
      </div>
    </div>
  );
}

function BlockForm({
  block,
  onChange,
}: {
  block: EventBlock;
  onChange: (payload: EventBlock["payload"]) => void;
}) {
  switch (block.type) {
    case "hero":
      return <HeroForm payload={block.payload} onChange={onChange} />;
    case "prose":
      return <ProseForm payload={block.payload} onChange={onChange} />;
    case "stats":
      return <StatsForm payload={block.payload} onChange={onChange} />;
    case "days":
      return <DaysForm payload={block.payload} onChange={onChange} />;
    case "included_split":
      return (
        <IncludedSplitForm payload={block.payload} onChange={onChange} />
      );
    default:
      return null;
  }
}

function makeBlock(type: BlockType): EventBlock {
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
  }
}
