import { SectionHead } from "@/components/ui/section-head";
import type { BlockTone, FaqBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: FaqBlockPayload;
  tone?: BlockTone;
}

/**
 * FAQ — collapsible cards-style list. Renders on the paper canvas by
 * default; ink variant supported for completeness but rarely used.
 */
export function FaqBlock({ payload, tone = "canvas" }: Props) {
  if (!payload.items || payload.items.length === 0) return null;
  const dark = tone === "ink";
  const eyebrow = payload.eyebrow || "FAQ";
  const title = payload.title || "Časté dotazy";

  return (
    <section
      className={[
        "",
        dark ? "bg-ink-900" : "bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          tone={dark ? "dark" : "light"}
        />
        <div className="grid gap-4 sm:gap-5">
          {payload.items.map((item, i) => (
            <article
              key={i}
              className={[
                "rounded-2xl border p-7 sm:p-8",
                dark
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-border bg-surface",
              ].join(" ")}
            >
              <h3
                className={[
                  "text-lg font-semibold sm:text-xl",
                  dark ? "text-ink-inverse" : "text-ink-900",
                ].join(" ")}
                style={{ letterSpacing: "-0.015em" }}
              >
                {item.question}
              </h3>
              <p
                className={[
                  "mt-3 whitespace-pre-line",
                  dark ? "text-white/75" : "text-ink-700",
                ].join(" ")}
                style={{ fontSize: 16, lineHeight: 1.6 }}
              >
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
