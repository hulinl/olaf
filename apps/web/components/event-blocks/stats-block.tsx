import type { BlockTone, StatsBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: StatsBlockPayload;
  tone?: BlockTone;
}

export function StatsBlock({ payload, tone: _tone = "canvas" }: Props) {
  if (!payload.tiles || payload.tiles.length === 0) return null;

  // Stats is the single intentional dark statement on the public landing
  // (Pitztal-style: warm/light page with one ink accent that carries the
  // numbers). The `tone` prop and the legacy `payload.dark` are accepted
  // for forward compat but the block always renders ink.
  const dark = true;

  return (
    <section
      className={[
        "py-12 sm:py-14",
        dark
          ? "bg-ink-900 text-ink-inverse"
          : "bg-canvas text-ink-900",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
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
                  "mt-2 text-3xl font-semibold sm:text-4xl",
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
