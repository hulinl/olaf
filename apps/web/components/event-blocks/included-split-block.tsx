import { SectionHead } from "@/components/ui/section-head";
import type {
  BlockTone,
  IncludedSplitBlockPayload,
} from "@/lib/event-blocks";

interface Props {
  payload: IncludedSplitBlockPayload;
  tone?: BlockTone;
}

export function IncludedSplitBlock({ payload, tone = "canvas" }: Props) {
  const hasIncluded = payload.included && payload.included.length > 0;
  const hasNotIncluded = payload.not_included && payload.not_included.length > 0;
  const hasPrice = Boolean(payload.price_value);
  if (!hasIncluded && !hasNotIncluded && !hasPrice) return null;

  const dark = tone === "ink";

  return (
    <section
      className={[
        "border-t",
        dark ? "border-transparent bg-ink-900" : "border-border bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <SectionHead
          eyebrow="Cena"
          title="Co dostaneš a za co platíš"
          tone={dark ? "dark" : "light"}
        />

        <div className="grid gap-12 md:grid-cols-2">
          {hasIncluded && (
            <ItemColumn
              eyebrow="V ceně"
              items={payload.included}
              accent="amber"
              dark={dark}
            />
          )}
          {hasNotIncluded && (
            <ItemColumn
              eyebrow="Hradíš sám"
              items={payload.not_included}
              accent="muted"
              dark={dark}
            />
          )}
        </div>

        {hasPrice && (
          <div
            className={[
              "mt-12 flex flex-wrap items-baseline justify-between gap-6 border-t pt-10",
              dark ? "border-white/15" : "border-border",
            ].join(" ")}
          >
            <div>
              <p
                className={[
                  "font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
                  dark ? "text-white/60" : "text-ink-500",
                ].join(" ")}
              >
                Cena výpravy
              </p>
              {payload.price_note && (
                <p
                  className={[
                    "mt-3 max-w-md",
                    dark ? "text-white/80" : "text-ink-700",
                  ].join(" ")}
                  style={{ fontSize: 16, lineHeight: 1.55 }}
                >
                  {payload.price_note}
                </p>
              )}
            </div>
            <p
              className={[
                "text-5xl font-semibold sm:text-6xl",
                dark ? "text-ink-inverse" : "text-ink-900",
              ].join(" ")}
              style={{ letterSpacing: "-0.035em", lineHeight: 1 }}
            >
              {payload.price_value}
              {payload.price_unit && (
                <span
                  className={[
                    "ml-3 font-mono text-base font-medium uppercase tracking-[0.14em]",
                    dark ? "text-white/60" : "text-ink-500",
                  ].join(" ")}
                >
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
  dark,
}: {
  eyebrow: string;
  items: { label: string; desc?: string }[];
  accent: "amber" | "muted";
  dark: boolean;
}) {
  return (
    <div>
      <p
        className={[
          "mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
          accent === "amber"
            ? dark
              ? "text-ink-inverse"
              : "text-ink-900"
            : dark
              ? "text-white/60"
              : "text-ink-500",
        ].join(" ")}
      >
        {eyebrow}
      </p>
      <ul
        className={[
          "space-y-5 border-l-2 pl-6",
          accent === "amber"
            ? "border-brand"
            : dark
              ? "border-white/30"
              : "border-border-strong",
        ].join(" ")}
      >
        {items.map((item, i) => (
          <li key={i}>
            <p
              className={[
                "font-medium",
                dark ? "text-ink-inverse" : "text-ink-900",
              ].join(" ")}
            >
              {item.label}
            </p>
            {item.desc && (
              <p
                className={[
                  "mt-1",
                  dark ? "text-white/65" : "text-ink-500",
                ].join(" ")}
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
