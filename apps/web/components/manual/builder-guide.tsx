"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BLOCK_CATALOG, type BlockCatalogEntry } from "@/lib/block-catalog";
import { SAMPLE_OUTLINE, type SampleBlock } from "@/lib/sample-event-landing";

import { SamplePreviewBlock } from "./sample-preview-block";

/**
 * Interaktivní průvodce stavbou stránky akce.
 *
 * Layout: 2-col split na desktop, stack na mobile.
 *   - Levá strana: vzorová stránka akce skládaná z bloků. Každý blok
 *     je klikací — fokus se přepne na detail v pravém panelu.
 *   - Pravá strana: sticky outline (numerovaný seznam bloků) +
 *     detail aktuálně vybraného bloku (kdy použít, klíčová pole, tip).
 *
 * Sync: klik vlevo → highlight + výběr detailu. Klik vpravo v outline →
 * smooth-scroll k preview bloku + výběr detailu.
 */
export function BuilderGuide() {
  const [selectedId, setSelectedId] = useState<string>(SAMPLE_OUTLINE[0].id);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedBlock = SAMPLE_OUTLINE.find((b) => b.id === selectedId);
  const catalogEntry = selectedBlock
    ? BLOCK_CATALOG.find((c) => c.type === selectedBlock.type)
    : undefined;

  const handleSelectFromOutline = useCallback((id: string) => {
    setSelectedId(id);
    const el = blockRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Když user scrolluje preview, sync detail panel na block nejblíž viewportu.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute("data-block-id");
          if (id) setSelectedId(id);
        }
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: 0 },
    );

    for (const id of Object.keys(blockRefs.current)) {
      const el = blockRefs.current[id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      {/* Levý sloupec — vzorová stránka */}
      <div className="min-w-0 flex-1 lg:max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
          Vzorová stránka
        </p>
        <h2
          className="mt-2 text-2xl font-semibold tracking-tight text-ink-900"
          style={{ letterSpacing: "-0.02em" }}
        >
          Takhle vypadá kompletně sestavená akce
        </h2>
        <p className="mt-3 text-sm text-ink-700">
          Klikni na kterýkoli blok — vpravo uvidíš, co znamená, kdy ho použít
          a jaká pole se v něm vyplňují.
        </p>

        <div className="mt-6 space-y-4">
          {SAMPLE_OUTLINE.map((block, index) => (
            <SamplePreviewBlock
              key={block.id}
              block={block}
              index={index}
              isSelected={selectedId === block.id}
              onSelect={() => setSelectedId(block.id)}
              registerRef={(el) => {
                blockRefs.current[block.id] = el;
              }}
            />
          ))}
        </div>
      </div>

      {/* Pravý sloupec — outline + detail */}
      <aside className="lg:sticky lg:top-24 lg:h-max lg:w-80 lg:shrink-0">
        <BuilderOutline
          blocks={SAMPLE_OUTLINE}
          selectedId={selectedId}
          onSelect={handleSelectFromOutline}
        />
        <BlockDetailPanel block={selectedBlock} catalog={catalogEntry} />
      </aside>
    </div>
  );
}

function BuilderOutline({
  blocks,
  selectedId,
  onSelect,
}: {
  blocks: SampleBlock[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-500">
        Outline stránky
      </p>
      <ol className="mt-3 flex flex-col gap-1">
        {blocks.map((b, i) => {
          const isActive = selectedId === b.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                className={[
                  "flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-ring",
                  isActive
                    ? "bg-brand/10 text-brand"
                    : "text-ink-700 hover:bg-canvas hover:text-ink-900",
                ].join(" ")}
                aria-current={isActive ? "true" : undefined}
              >
                <span
                  className={[
                    "font-mono text-[11px] tabular-nums",
                    isActive ? "text-brand" : "text-ink-300",
                  ].join(" ")}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={isActive ? "font-medium" : ""}>{b.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BlockDetailPanel({
  block,
  catalog,
}: {
  block: SampleBlock | undefined;
  catalog: BlockCatalogEntry | undefined;
}) {
  if (!block || !catalog) return null;

  return (
    <div className="mt-5 rounded-2xl border border-border bg-surface p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
        {catalog.title} · {catalog.subtitle}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        {catalog.description}
      </p>

      <DetailGroup title="Kdy ho použít">
        <ul className="space-y-1.5 text-sm text-ink-700">
          {catalog.whenToUse.map((point, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-1 text-brand">
                ●
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </DetailGroup>

      {catalog.whenNotToUse.length > 0 && (
        <DetailGroup title="Kdy ho NEpoužít">
          <ul className="space-y-1.5 text-sm text-ink-700">
            {catalog.whenNotToUse.map((point, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-1 text-ink-300">
                  ○
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </DetailGroup>
      )}

      <DetailGroup title="Klíčová pole">
        <dl className="space-y-2 text-sm">
          {catalog.keyFields.map((f, i) => (
            <div key={i}>
              <dt className="font-medium text-ink-900">{f.label}</dt>
              <dd className="text-ink-700">{f.hint}</dd>
            </div>
          ))}
        </dl>
      </DetailGroup>

      <DetailGroup title="Příklad">
        <p className="text-sm italic text-ink-700">{catalog.example}</p>
      </DetailGroup>

      {catalog.tip && (
        <div className="mt-5 rounded-lg border border-brand/20 bg-brand/5 p-3 text-sm text-ink-900">
          <span className="font-medium text-brand">Tip · </span>
          {catalog.tip}
        </div>
      )}
    </div>
  );
}

function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
