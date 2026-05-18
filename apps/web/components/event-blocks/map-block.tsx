import { SectionHead } from "@/components/ui/section-head";
import {
  type BlockTone,
  type MapBlockPayload,
  ensureMapyFrameParam,
  isMapyEmbedUrl,
} from "@/lib/event-blocks";

interface Props {
  payload: MapBlockPayload;
  tone?: BlockTone;
}

export function MapBlock({ payload, tone = "canvas" }: Props) {
  if (!payload.map_url) return null;
  const embeddable = isMapyEmbedUrl(payload.map_url);
  const eyebrow = payload.eyebrow || "Mapa";
  const title = payload.title || "Kudy poběžíme";
  const dark = tone === "ink";

  return (
    <section
      className={[
        "",
        dark ? "bg-ink-900" : "bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          tone={dark ? "dark" : "light"}
        />
        {embeddable ? (
          <div
            className={[
              "relative w-full overflow-hidden rounded-md border",
              dark
                ? "border-white/10 bg-white/[0.04]"
                : "border-border bg-surface",
            ].join(" ")}
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              loading="lazy"
              src={ensureMapyFrameParam(payload.map_url)}
              title={title}
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        ) : (
          <a
            href={payload.map_url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "inline-flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium focus-ring",
              dark
                ? "border-white/15 bg-white/[0.04] text-ink-inverse hover:bg-white/[0.08]"
                : "border-border bg-surface text-ink-900 hover:bg-surface-muted",
            ].join(" ")}
          >
            Otevřít mapu →
          </a>
        )}
        {(payload.caption || embeddable) && (
          <div
            className={[
              "mt-3 flex flex-wrap items-center justify-between gap-3 text-sm",
              dark ? "text-white/60" : "text-ink-500",
            ].join(" ")}
          >
            {payload.caption && <span>{payload.caption}</span>}
            {embeddable && (
              <a
                href={payload.map_url}
                target="_blank"
                rel="noopener noreferrer"
                className={[
                  "ml-auto font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
                  dark
                    ? "text-white/80 hover:text-ink-inverse"
                    : "text-ink-700 hover:text-ink-900",
                ].join(" ")}
              >
                Otevřít v Mapy.cz ↗
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
