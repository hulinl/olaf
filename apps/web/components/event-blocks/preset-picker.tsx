"use client";

import { useState } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  EVENT_BLOCK_PRESETS,
  type EventBlockPreset,
} from "@/lib/event-block-presets";
import type { EventBlock } from "@/lib/event-blocks";

/**
 * Modal/inline picker pro výběr block presetu.
 *
 * `hasExistingBlocks=true` zobrazí warning, že presety nahradí existující
 * bloky. Confirmace přes prompt — žádný external dialog modal, držíme to
 * native pro V1.
 */
export function PresetPicker({
  hasExistingBlocks,
  onPick,
  onCancel,
}: {
  hasExistingBlocks: boolean;
  onPick: (blocks: EventBlock[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<EventBlockPreset | null>(null);
  const confirmDialog = useConfirm();

  async function confirm() {
    if (!selected) return;
    if (hasExistingBlocks) {
      const ok = await confirmDialog({
        title: "Nahradit existující bloky?",
        description:
          "V akci už nějaké bloky jsou. Použitím vzoru se přepíšou — pak je můžeš upravit nebo přidat další.",
        confirmLabel: "Nahradit vzorem",
        variant: "danger",
      });
      if (!ok) return;
    }
    onPick(selected.build());
  }

  return (
    <div className="rounded-md border border-border bg-canvas p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink-900">Použít vzor</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Vyber šablonu — bloky se předvyplní, pak je doupravíš v builderu.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-ink-500 hover:text-ink-900 focus-ring"
        >
          Zavřít
        </button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3">
        {EVENT_BLOCK_PRESETS.map((p) => {
          const isActive = selected?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p)}
                className={[
                  "flex h-full w-full flex-col gap-1.5 rounded-md border bg-surface px-3 py-3 text-left transition-colors focus-ring",
                  isActive
                    ? "border-brand ring-2 ring-brand/20"
                    : "border-border hover:border-brand/40",
                ].join(" ")}
                aria-pressed={isActive}
              >
                <span className="text-sm font-semibold text-ink-900">
                  {p.name}
                </span>
                <span className="text-xs text-ink-500">{p.tagline}</span>
                <span className="mt-auto pt-1 font-mono text-[11px] uppercase tracking-wide text-ink-400">
                  {p.blockCount} bloků
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div className="mt-4 rounded-md border border-brand/20 bg-brand/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-brand">
            {selected.name}
          </p>
          <p className="mt-1.5 text-sm text-ink-700">{selected.description}</p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
        >
          Zrušit
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!selected}
          className="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-ink-900 hover:bg-brand-hover disabled:opacity-40 focus-ring"
        >
          {hasExistingBlocks ? "Nahradit bloky" : "Použít vzor"}
        </button>
      </div>
    </div>
  );
}
