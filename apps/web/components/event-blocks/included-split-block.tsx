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
    <section className="border-t border-border bg-ink-900 text-ink-inverse">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="mb-10 inline-block bg-ink-inverse px-3 py-1.5 text-xl font-semibold text-ink-900">
          CO JE V CENĚ
        </h2>
        <div className="grid gap-12 md:grid-cols-2">
          {hasIncluded && (
            <div>
              <h3 className="mb-5 text-base font-semibold uppercase tracking-wide text-ink-inverse">
                ✓ Zahrnuto
              </h3>
              <ul className="space-y-4 border-l-2 border-brand pl-6">
                {payload.included.map((item, i) => (
                  <li key={i}>
                    <p className="font-medium text-ink-inverse">{item.label}</p>
                    {item.desc && (
                      <p className="mt-0.5 text-sm text-ink-inverse/70">
                        {item.desc}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasNotIncluded && (
            <div>
              <h3 className="mb-5 text-base font-semibold uppercase tracking-wide text-ink-inverse/80">
                × Hradíš sám
              </h3>
              <ul className="space-y-4 border-l-2 border-white/30 pl-6">
                {payload.not_included.map((item, i) => (
                  <li key={i}>
                    <p className="font-medium text-ink-inverse">{item.label}</p>
                    {item.desc && (
                      <p className="mt-0.5 text-sm text-ink-inverse/70">
                        {item.desc}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {hasPrice && (
          <div className="mt-12 grid items-center gap-8 rounded-lg bg-ink-inverse/5 p-8 ring-1 ring-white/10 md:grid-cols-[1.2fr_1fr] md:p-12">
            <div>
              <h3 className="text-2xl font-semibold text-ink-inverse">
                Cena výpravy
              </h3>
              {payload.price_note && (
                <p className="mt-3 text-sm text-ink-inverse/70">
                  {payload.price_note}
                </p>
              )}
            </div>
            <div className="rounded-md bg-ink-inverse/5 px-6 py-8 text-center ring-1 ring-white/10">
              <p className="text-5xl font-semibold text-ink-inverse">
                {payload.price_value}
                {payload.price_unit && (
                  <span className="ml-2 text-lg text-ink-inverse/70">
                    {payload.price_unit}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
