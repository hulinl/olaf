import { EventGallery } from "@/components/event-gallery";
import { SectionHead } from "@/components/ui/section-head";
import { type EventImage } from "@/lib/api";
import type { BlockTone, GalleryBlockPayload } from "@/lib/event-blocks";

interface Props {
  payload: GalleryBlockPayload;
  images: EventImage[];
  tone?: BlockTone;
}

/**
 * Gallery block — owner-positioned grid of all event.images.
 *
 * Renders heading-less by default — the gallery speaks for itself and the
 * owner usually just wants a strip of photos between two text-heavy blocks.
 * When the owner does fill in `eyebrow` or `title` we render a SectionHead
 * (e.g. "Z minulých kempů"), but it's opt-in, not a fallback.
 */
export function GalleryBlock({ payload, images, tone = "canvas" }: Props) {
  if (images.length === 0) return null;
  const eyebrow = (payload.eyebrow ?? "").trim();
  const title = (payload.title ?? "").trim();
  const hasHead = Boolean(eyebrow || title);
  const dark = tone === "ink";
  return (
    <section
      className={[
        "",
        dark ? "bg-ink-900" : "bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        {hasHead && (
          <SectionHead
            eyebrow={eyebrow || undefined}
            title={title}
            tone={dark ? "dark" : "light"}
          />
        )}
        <EventGallery images={images} chrome={false} />
      </div>
    </section>
  );
}
