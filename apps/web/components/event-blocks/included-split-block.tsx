import { SectionHead } from "@/components/ui/section-head";
import type { IncludedSplitBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: IncludedSplitBlockPayload;
}

export function IncludedSplitBlock({ payload }: Props) {
  const hasIncluded = payload.included && payload.included.length > 0;
  const hasNotIncluded = payload.not_included && payload.not_included.length > 0;
  const hasPrice = Boolean(payload.price_value);
  if (!hasIncluded && !hasNotIncluded && !hasPrice) return null;

  return (
    <section className="border-t border-border bg-canvas">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <SectionHead eyebrow="Cena" title="Co dostaneš a za co platíš" />

        <div className="grid gap-12 md:grid-cols-2">
          {hasIncluded && (
            <ItemColumn
              eyebrow="V ceně"
              items={payload.included}
              accent="amber"
            />
          )}
          {hasNotIncluded && (
            <ItemColumn
              eyebrow="Hradíš sám"
              items={payload.not_included}
              accent="muted"
            />
          )}
        </div>

        {hasPrice && (
          <div className="mt-12 flex flex-wrap items-baseline justify-between gap-6 border-t border-border pt-10">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
                Cena výpravy
              </p>
              {payload.price_note && (
                <p
                  className="mt-3 max-w-md text-ink-700"
                  style={{ fontSize: 16, lineHeight: 1.55 }}
                >
                  {payload.price_note}
                </p>
              )}
            </div>
            <p
              className="text-5xl font-semibold text-ink-900 sm:text-6xl"
              style={{ letterSpacing: "-0.035em", lineHeight: 1 }}
            >
              {payload.price_value}
              {payload.price_unit && (
                <span className="ml-3 font-mono text-base font-medium uppercase tracking-[0.14em] text-ink-500">
                  {payload.price_unit}
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ItemColumn({
  eyebrow,
  items,
  accent,
}: {
  eyebrow: string;
  items: { label: string; desc?: string }[];
  accent: "amber" | "muted";
}) {
  return (
    <div>
      <p
        className={[
          "mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
          accent === "amber" ? "text-ink-900" : "text-ink-500",
        ].join(" ")}
      >
        {eyebrow}
      </p>
      <ul
        className={[
          "space-y-5 border-l-2 pl-6",
          accent === "amber" ? "border-brand" : "border-border-strong",
        ].join(" ")}
      >
        {items.map((item, i) => (
          <li key={i}>
            <p className="font-medium text-ink-900">{item.label}</p>
            {item.desc && (
              <p
                className="mt-1 text-ink-500"
                style={{ fontSize: 14, lineHeight: 1.55 }}
              >
                {item.desc}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
