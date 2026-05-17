import type { StatsBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: StatsBlockPayload;
}

export function StatsBlock({ payload }: Props) {
  if (!payload.tiles || payload.tiles.length === 0) return null;

  const dark = Boolean(payload.dark);

  return (
    <section
      className={[
        "border-t py-16 sm:py-20",
        dark
          ? "border-transparent bg-ink-900 text-ink-inverse"
          : "border-border bg-canvas text-ink-900",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          {payload.tiles.map((t, i) => (
            <div key={i}>
              <dt
                className={[
                  "font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
                  dark ? "text-white/60" : "text-ink-500",
                ].join(" ")}
              >
                {t.label}
              </dt>
              <dd
                className={[
                  "mt-2 text-4xl font-semibold sm:text-5xl",
                  dark ? "text-ink-inverse" : "text-ink-900",
                ].join(" ")}
                style={{ letterSpacing: "-0.035em", lineHeight: 1 }}
              >
                {t.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
