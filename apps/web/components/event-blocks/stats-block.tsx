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
        "border-t border-border py-14",
        dark
          ? "bg-ink-900 text-ink-inverse"
          : "bg-surface-muted/40 text-ink-900",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4">
        <div className="grid grid-cols-2 gap-8 text-center sm:grid-cols-4">
          {payload.tiles.map((t, i) => (
            <div key={i}>
              <p
                className={[
                  "text-3xl font-semibold tracking-tight sm:text-4xl",
                  dark ? "text-ink-inverse" : "text-ink-900",
                ].join(" ")}
              >
                {t.value}
              </p>
              <p
                className={[
                  "mt-2 text-xs font-medium uppercase tracking-widest",
                  dark ? "text-ink-inverse/70" : "text-ink-500",
                ].join(" ")}
              >
                {t.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
