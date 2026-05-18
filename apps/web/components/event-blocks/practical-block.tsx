import { SectionHead } from "@/components/ui/section-head";
import type { BlockTone, PracticalBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: PracticalBlockPayload;
  tone?: BlockTone;
}

/**
 * Practical info — up to three free-text columns (transport / accommodation /
 * gear) plus an optional difficulty rail. Replaces the legacy hard-coded
 * "Praktické info" + "Náročnost" sections that used to render directly from
 * Event.transport_info / accommodation_info / gear_info / difficulty_level.
 */
export function PracticalBlock({ payload, tone = "canvas" }: Props) {
  const dark = tone === "ink";
  const eyebrow = payload.eyebrow || "Praktické info";
  const title = payload.title || "Doprava, ubytování, výbava";
  const cols: { label: string; body: string }[] = [];
  if (payload.transport) cols.push({ label: "Doprava", body: payload.transport });
  if (payload.accommodation)
    cols.push({ label: "Ubytování a strava", body: payload.accommodation });
  if (payload.gear) cols.push({ label: "Výbava", body: payload.gear });

  const lvl = payload.difficulty_level ?? 0;
  const hasDifficulty = lvl > 0 || Boolean(payload.difficulty_note);

  if (cols.length === 0 && !hasDifficulty) return null;

  return (
    <section
      className={[
        "border-t",
        dark ? "border-transparent bg-ink-900" : "border-border bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-14 sm:py-16">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          tone={dark ? "dark" : "light"}
        />

        {cols.length > 0 && (
          <div
            className={[
              "grid gap-10 sm:gap-12",
              cols.length === 1
                ? "sm:max-w-2xl"
                : cols.length === 2
                  ? "sm:grid-cols-2"
                  : "sm:grid-cols-3",
            ].join(" ")}
          >
            {cols.map((c, i) => (
              <div key={i}>
                <p
                  className={[
                    "font-mono text-[11px] font-medium uppercase tracking-[0.18em]",
                    dark ? "text-white/60" : "text-ink-500",
                  ].join(" ")}
                >
                  {c.label}
                </p>
                <p
                  className={[
                    "mt-4 whitespace-pre-line",
                    dark ? "text-white/80" : "text-ink-700",
                  ].join(" ")}
                  style={{ fontSize: 16, lineHeight: 1.6 }}
                >
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {hasDifficulty && (
          <div
            className={[
              "mt-14 rounded-2xl border p-8 sm:p-10",
              dark
                ? "border-white/10 bg-white/[0.03]"
                : "border-border bg-surface",
            ].join(" ")}
          >
            <p
              className={[
                "font-mono text-[11px] font-medium uppercase tracking-[0.18em]",
                dark ? "text-white/60" : "text-ink-500",
              ].join(" ")}
            >
              Náročnost {lvl > 0 ? `${lvl} z 5` : ""}
            </p>
            {lvl > 0 && (
              <div className="mt-3 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={[
                      "h-2 w-12 rounded-full",
                      n <= lvl
                        ? "bg-brand"
                        : dark
                          ? "bg-white/15"
                          : "bg-border",
                    ].join(" ")}
                  />
                ))}
              </div>
            )}
            {payload.difficulty_note && (
              <p
                className={[
                  "mt-5 max-w-2xl whitespace-pre-line",
                  dark ? "text-white/80" : "text-ink-700",
                ].join(" ")}
                style={{ fontSize: 16, lineHeight: 1.6 }}
              >
                {payload.difficulty_note}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
