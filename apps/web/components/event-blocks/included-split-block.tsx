import { formatEventPrice } from "@/lib/api";
import { SectionHead } from "@/components/ui/section-head";
import type {
  BlockTone,
  IncludedSplitBlockPayload,
} from "@/lib/event-blocks";

interface Props {
  payload: IncludedSplitBlockPayload;
  tone?: BlockTone;
  /** Event-level price (preferred). Falls back to the block payload's
   *  legacy price_value/_unit/_note when not set. */
  eventPrice?: {
    amount: string | null;
    currency: string;
    note: string;
  };
}

/**
 * Included / Not-included — Pitztal-style split list with circle check / cross
 * icons inline with each item, plus a standalone dark price card at the bottom.
 * The whole section ALWAYS renders ink (dark) — it's the second deliberate
 * dark statement on the landing (after Stats), framing the price decision.
 */
export function IncludedSplitBlock({
  payload,
  tone: _tone = "canvas",
  eventPrice,
}: Props) {
  const hasIncluded = payload.included && payload.included.length > 0;
  const hasNotIncluded = payload.not_included && payload.not_included.length > 0;

  // Prefer event-level price (single source of truth across landing + RSVP
  // + invoice). Falls back to in-block legacy values so older events with
  // no Event.price_amount keep rendering.
  const formattedPrice = eventPrice?.amount
    ? formatEventPrice(eventPrice.amount, eventPrice.currency)
    : null;
  const priceValue =
    formattedPrice?.split(" ")[0] ?? payload.price_value ?? "";
  const priceUnit =
    formattedPrice?.split(" ").slice(1).join(" ") ||
    payload.price_unit ||
    "";
  const priceNote = eventPrice?.note || payload.price_note || "";
  const hasPrice = Boolean(priceValue);

  if (!hasIncluded && !hasNotIncluded && !hasPrice) return null;

  return (
    <section className="bg-ink-900">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <SectionHead
          eyebrow="Cena"
          title="Co dostaneš a za co platíš"
          tone="dark"
        />

        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          {hasIncluded && (
            <ItemColumn
              eyebrow="V ceně"
              items={payload.included}
              variant="check"
            />
          )}
          {hasNotIncluded && (
            <ItemColumn
              eyebrow="Hradíš zvlášť"
              items={payload.not_included}
              variant="cross"
            />
          )}
        </div>

        {hasPrice && (
          <PriceCard value={priceValue} unit={priceUnit} note={priceNote} />
        )}
      </div>
    </section>
  );
}

function ItemColumn({
  eyebrow,
  items,
  variant,
}: {
  eyebrow: string;
  items: { label: string; desc?: string }[];
  variant: "check" | "cross";
}) {
  return (
    <div>
      <h3 className="mb-6 text-lg font-semibold text-ink-inverse">
        {variant === "check" ? "✓ " : "× "}
        {eyebrow}
      </h3>
      <ul className="list-none p-0 m-0">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-4 border-b border-white/10 py-4 last:border-b-0"
          >
            <span
              className={[
                "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                variant === "check"
                  ? "bg-brand/20 text-brand"
                  : "bg-white/8 text-white/55",
              ].join(" ")}
              aria-hidden
            >
              {variant === "check" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-inverse">{item.label}</p>
              {item.desc && (
                <p
                  className="mt-1 text-white/55"
                  style={{ fontSize: 14, lineHeight: 1.55 }}
                >
                  {item.desc}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriceCard({
  value,
  unit,
  note,
}: {
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div
      className="mt-14 flex flex-col gap-8 rounded-2xl p-10 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-14 sm:p-12"
      style={{
        background: "linear-gradient(135deg, #0e1a26 0%, #1a2c3e 100%)",
      }}
    >
      <div className="flex-1">
        <h3
          className="text-2xl font-semibold text-ink-inverse sm:text-3xl"
          style={{ letterSpacing: "-0.025em", lineHeight: 1.2 }}
        >
          Celková cena
        </h3>
      </div>
      <div className="shrink-0 sm:max-w-xs sm:border-l sm:border-white/15 sm:pl-14 sm:text-right">
        <p
          className="text-5xl font-semibold text-ink-inverse sm:text-7xl"
          style={{ letterSpacing: "-0.04em", lineHeight: 1 }}
        >
          {value}
          {unit && (
            <span className="ml-2 text-2xl font-medium text-white/60">
              {unit}
            </span>
          )}
        </p>
        {note && (
          <p
            className="mt-4 text-white/70"
            style={{ fontSize: 14, lineHeight: 1.55 }}
          >
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
