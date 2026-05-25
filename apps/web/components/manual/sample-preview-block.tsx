"use client";

import type {
  DaysBlockPayload,
  FaqBlockPayload,
  GalleryBlockPayload,
  HeroBlockPayload,
  IncludedSplitBlockPayload,
  MapBlockPayload,
  PracticalBlockPayload,
  ProseBlockPayload,
  StatsBlockPayload,
} from "@/lib/event-blocks";
import type { SampleBlock } from "@/lib/sample-event-landing";

/**
 * Zjednodušený náhled vzorového bloku — ne renderer pro production
 * stránku, ale „ilustrační karta", která ukáže, co blok přibližně dělá.
 * Klik na kartu vybírá blok v pravém detail panelu.
 *
 * Záměrně držíme rendering jednoduchý — žádné fotky, žádný embed map.
 * Cílem je struktura, ne pixel-perfect kopie produkční landing.
 */
export function SamplePreviewBlock({
  block,
  index,
  isSelected,
  onSelect,
  registerRef,
}: {
  block: SampleBlock;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={registerRef}
      data-block-id={block.id}
      className={[
        "relative rounded-2xl border bg-surface transition-colors",
        isSelected
          ? "border-brand ring-2 ring-brand/20"
          : "border-border hover:border-brand/40",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 z-10 rounded-2xl focus-ring"
        aria-label={`Vybrat blok ${block.label}`}
      />
      <div className="pointer-events-none relative px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-500">
            <span
              className={[
                "mr-2 font-mono tabular-nums",
                isSelected ? "text-brand" : "text-ink-300",
              ].join(" ")}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {block.label}
          </p>
        </div>

        <div className="mt-3">
          <BlockPreview block={block} />
        </div>
      </div>
    </div>
  );
}

function BlockPreview({ block }: { block: SampleBlock }) {
  switch (block.type) {
    case "hero":
      return <HeroPreview payload={block.payload as HeroBlockPayload} />;
    case "prose":
      return <ProsePreview payload={block.payload as ProseBlockPayload} />;
    case "stats":
      return <StatsPreview payload={block.payload as StatsBlockPayload} />;
    case "days":
      return <DaysPreview payload={block.payload as DaysBlockPayload} />;
    case "included_split":
      return (
        <IncludedSplitPreview
          payload={block.payload as IncludedSplitBlockPayload}
        />
      );
    case "gallery":
      return <GalleryPreview payload={block.payload as GalleryBlockPayload} />;
    case "map":
      return <MapPreview payload={block.payload as MapBlockPayload} />;
    case "faq":
      return <FaqPreview payload={block.payload as FaqBlockPayload} />;
    case "practical":
      return (
        <PracticalPreview payload={block.payload as PracticalBlockPayload} />
      );
    case "gear":
      return <GearPreview />;
    default:
      return null;
  }
}

function HeroPreview({ payload }: { payload: HeroBlockPayload }) {
  return (
    <div className="overflow-hidden rounded-xl bg-gradient-to-br from-amber-100 via-amber-50 to-canvas p-5">
      {payload.eyebrow && (
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-700">
          {payload.eyebrow}
        </p>
      )}
      <h3
        className="mt-2 text-xl font-semibold text-ink-900"
        style={{ letterSpacing: "-0.02em" }}
      >
        {payload.title_override || "Název akce"}
      </h3>
      {payload.subtitle && (
        <p className="mt-2 text-sm text-ink-700">{payload.subtitle}</p>
      )}
      {payload.meta && payload.meta.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          {payload.meta.map((m, i) => (
            <div key={i} className="rounded-md border border-amber-200/50 bg-white/60 p-2">
              <dt className="font-medium uppercase tracking-[0.12em] text-amber-700">
                {m.k}
              </dt>
              <dd className="mt-0.5 font-medium text-ink-900">{m.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ProsePreview({ payload }: { payload: ProseBlockPayload }) {
  return (
    <div>
      {payload.eyebrow && (
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">
          {payload.eyebrow}
        </p>
      )}
      {payload.heading && (
        <h3 className="mt-1 text-lg font-semibold text-ink-900">
          {payload.heading}
        </h3>
      )}
      <p className="mt-2 line-clamp-4 text-sm text-ink-700">
        {payload.body?.replace(/\*\*/g, "").replace(/\n/g, " ")}
      </p>
    </div>
  );
}

function StatsPreview({ payload }: { payload: StatsBlockPayload }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {payload.tiles.map((t, i) => (
        <div
          key={i}
          className="rounded-md border border-border bg-canvas p-3 text-center"
        >
          <dt className="text-xl font-semibold text-ink-900">{t.value}</dt>
          <dd className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-ink-500">
            {t.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DaysPreview({ payload }: { payload: DaysBlockPayload }) {
  return (
    <div>
      {payload.lead && (
        <p className="mb-3 text-sm text-ink-700">{payload.lead}</p>
      )}
      <ol className="space-y-2">
        {payload.days.slice(0, 3).map((d, i) => (
          <li
            key={i}
            className="rounded-md border border-border bg-canvas px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-ink-900">
                <span className="font-mono text-xs text-ink-500">
                  {d.label || `Den ${d.num || i + 1}`} ·
                </span>{" "}
                {d.title}
              </p>
              {(d.distance || d.ascent) && (
                <p className="font-mono text-[11px] text-ink-500">
                  {[d.distance, d.ascent && `${d.ascent} ↑`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            {d.route && (
              <p className="mt-1 text-xs italic text-ink-500">{d.route}</p>
            )}
          </li>
        ))}
        {payload.days.length > 3 && (
          <li className="px-3 py-1 text-xs italic text-ink-500">
            … a další {payload.days.length - 3} {payload.days.length - 3 === 1 ? "den" : "dny"}
          </li>
        )}
      </ol>
    </div>
  );
}

function IncludedSplitPreview({
  payload,
}: {
  payload: IncludedSplitBlockPayload;
}) {
  return (
    <div>
      {payload.price_value && (
        <p className="mb-4 text-2xl font-semibold text-ink-900">
          {payload.price_value}
          <span className="ml-1.5 text-sm font-normal text-ink-500">
            {payload.price_unit}
          </span>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700">
            V ceně
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-700">
            {payload.included.slice(0, 4).map((item, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-emerald-600">
                  ✓
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500">
            Není v ceně
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-700">
            {payload.not_included.slice(0, 4).map((item, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-ink-400">
                  −
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function GalleryPreview({ payload }: { payload: GalleryBlockPayload }) {
  return (
    <div>
      {payload.eyebrow && (
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">
          {payload.eyebrow}
        </p>
      )}
      {payload.title && (
        <h3 className="mt-1 text-lg font-semibold text-ink-900">
          {payload.title}
        </h3>
      )}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="aspect-square rounded-md bg-gradient-to-br from-canvas to-amber-50"
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

function MapPreview({ payload }: { payload: MapBlockPayload }) {
  return (
    <div>
      {payload.eyebrow && (
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">
          {payload.eyebrow}
        </p>
      )}
      {payload.title && (
        <h3 className="mt-1 text-lg font-semibold text-ink-900">
          {payload.title}
        </h3>
      )}
      <div
        className="mt-3 flex aspect-video items-center justify-center rounded-md border border-border bg-gradient-to-br from-canvas to-emerald-50 text-xs font-mono uppercase tracking-[0.16em] text-emerald-700"
        aria-hidden
      >
        mapy.cz embed
      </div>
      {payload.caption && (
        <p className="mt-2 text-xs italic text-ink-500">{payload.caption}</p>
      )}
    </div>
  );
}

function FaqPreview({ payload }: { payload: FaqBlockPayload }) {
  return (
    <div>
      {payload.eyebrow && (
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">
          {payload.eyebrow}
        </p>
      )}
      {payload.title && (
        <h3 className="mt-1 text-lg font-semibold text-ink-900">
          {payload.title}
        </h3>
      )}
      <ul className="mt-3 space-y-2">
        {payload.items.slice(0, 3).map((item, i) => (
          <li key={i} className="border-t border-border pt-2 first:border-0 first:pt-0">
            <p className="text-sm font-medium text-ink-900">{item.question}</p>
            <p className="mt-1 line-clamp-2 text-xs text-ink-500">{item.answer}</p>
          </li>
        ))}
        {payload.items.length > 3 && (
          <li className="text-xs italic text-ink-500">
            … a {payload.items.length - 3} dalších otázek
          </li>
        )}
      </ul>
    </div>
  );
}

function PracticalPreview({ payload }: { payload: PracticalBlockPayload }) {
  const level = payload.difficulty_level ?? 0;
  return (
    <div>
      {payload.eyebrow && (
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">
          {payload.eyebrow}
        </p>
      )}
      {payload.title && (
        <h3 className="mt-1 text-lg font-semibold text-ink-900">
          {payload.title}
        </h3>
      )}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {payload.transport && (
          <PracticalCell label="Doprava" body={payload.transport} />
        )}
        {payload.accommodation && (
          <PracticalCell label="Ubytování" body={payload.accommodation} />
        )}
        {payload.gear && (
          <PracticalCell label="Výbava" body={payload.gear} />
        )}
        {level > 0 && (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500">
              Náročnost
            </dt>
            <dd className="mt-1 text-sm">
              <span aria-label={`${level} z 5`} className="text-brand">
                {"●".repeat(level)}
              </span>
              <span aria-hidden className="text-ink-300">
                {"○".repeat(5 - level)}
              </span>
              {payload.difficulty_note && (
                <span className="ml-2 text-xs text-ink-500">{level}/5</span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function PracticalCell({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-1 line-clamp-2 text-sm text-ink-700">
        {body.replace(/\*\*/g, "")}
      </dd>
    </div>
  );
}

function GearPreview() {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">
        Co si vzít
      </p>
      <h3 className="mt-1 text-lg font-semibold text-ink-900">
        Doporučený packing
      </h3>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-700">
        {[
          "30–40l batoh",
          "Hladký softshell",
          "Spacák podšívka",
          "Trail boty B/B-C",
          "Pršiplášť",
          "Čelovka",
          "Termoska / lahev 1l",
          "Lékárnička",
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="text-brand">
              □
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
