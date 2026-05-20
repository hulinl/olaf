import { SectionHead } from "@/components/ui/section-head";
import { assetUrl, type PublicGearList } from "@/lib/api";
import type { BlockTone, GearBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: GearBlockPayload;
  /** Inline gear-list payload from event.gear_lists_by_slug. Undefined
   *  when the referenced list is private or doesn't exist — block then
   *  renders empty (returns null). */
  list?: PublicGearList | null;
  tone?: BlockTone;
}

/**
 * Gear block — embeds a creator's gear list inline on the event landing.
 * Items grouped by category, total weight + count summary, each outbound
 * link routes through the affiliate-tracking redirect so the creator's
 * click counters update from event traffic too.
 */
export function GearBlock({ payload, list, tone = "canvas" }: Props) {
  if (!list || list.entries.length === 0) return null;
  const dark = tone === "ink";
  const eyebrow = payload.eyebrow || "Vybavení";
  const title = payload.title || list.name;
  // Apply the owner's curated subset (`featured_entry_ids`) before
  // anything else — empty / missing = show all (back-compat with
  // pre-feature blocks).
  const featured = payload.featured_entry_ids ?? [];
  const featuredEntries =
    featured.length > 0
      ? list.entries.filter((e) => featured.includes(e.id))
      : list.entries;
  if (featuredEntries.length === 0) return null;

  // Recompute summary numbers off the visible subset so the header
  // doesn't lie when the owner only featured a few items.
  const visibleCount = featuredEntries.reduce((n, e) => n + e.quantity, 0);
  const visibleWeightG = featuredEntries.reduce(
    (n, e) => n + (e.item.weight_g ?? 0) * e.quantity,
    0,
  );
  const totalKg = visibleWeightG / 1000;

  // Group entries by category for visual grouping (same shape as the
  // public /gear/[slug] landing for consistency).
  const byCategory = new Map<string, PublicGearList["entries"]>();
  for (const e of featuredEntries) {
    const cat = e.item.category || "Ostatní";
    const arr = byCategory.get(cat) ?? [];
    arr.push(e);
    byCategory.set(cat, arr);
  }

  return (
    <section className={dark ? "bg-ink-900" : "bg-canvas"}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          tone={dark ? "dark" : "light"}
        />

        <div
          className={[
            "mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm",
            dark ? "text-white/75" : "text-ink-500",
          ].join(" ")}
        >
          <span>
            <strong
              className={
                dark ? "text-ink-inverse tabular-nums" : "text-ink-900 tabular-nums"
              }
            >
              {visibleCount}
            </strong>{" "}
            {visibleCount === 1
              ? "položka"
              : visibleCount < 5
                ? "položky"
                : "položek"}
          </span>
          {visibleWeightG > 0 && (
            <span>
              ·{" "}
              <strong
                className={
                  dark
                    ? "text-ink-inverse tabular-nums"
                    : "text-ink-900 tabular-nums"
                }
              >
                {totalKg.toFixed(2)} kg
              </strong>{" "}
              celkem
            </span>
          )}
          <a
            href={`/gear/${list.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "ml-auto font-medium underline-offset-4 hover:underline",
              dark ? "text-ink-inverse" : "text-brand",
            ].join(" ")}
          >
            Otevřít list ↗
          </a>
        </div>

        <div className="flex flex-col gap-5">
          {[...byCategory.entries()].map(([cat, entries]) => (
            <div key={cat}>
              <h3
                className={[
                  "text-[10px] font-semibold uppercase tracking-[0.16em]",
                  dark ? "text-white/60" : "text-ink-500",
                ].join(" ")}
              >
                {cat}
              </h3>
              <ul
                className={[
                  "mt-2 divide-y rounded-md border",
                  dark
                    ? "divide-white/10 border-white/10 bg-white/[0.03]"
                    : "divide-border border-border bg-surface",
                ].join(" ")}
              >
                {entries.map((e) => {
                  const href = e.item.url
                    ? assetUrl(`/api/gear/g/${list.slug}/${e.id}/`)
                    : null;
                  const weightLabel =
                    e.item.weight_g != null
                      ? e.quantity > 1
                        ? `${e.quantity}× ${e.item.weight_g} g`
                        : `${e.item.weight_g} g`
                      : null;
                  return (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex flex-col">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className={[
                              "font-medium",
                              dark
                                ? "text-ink-inverse hover:text-brand"
                                : "text-ink-900 hover:text-brand",
                            ].join(" ")}
                          >
                            {e.item.name} ↗
                          </a>
                        ) : (
                          <span
                            className={
                              dark
                                ? "font-medium text-ink-inverse"
                                : "font-medium text-ink-900"
                            }
                          >
                            {e.item.name}
                          </span>
                        )}
                        {e.item.note && (
                          <span
                            className={[
                              "text-xs",
                              dark ? "text-white/60" : "text-ink-500",
                            ].join(" ")}
                          >
                            {e.item.note}
                          </span>
                        )}
                      </div>
                      {weightLabel && (
                        <span
                          className={[
                            "font-mono text-xs tabular-nums",
                            dark ? "text-white/75" : "text-ink-700",
                          ].join(" ")}
                        >
                          {weightLabel}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
