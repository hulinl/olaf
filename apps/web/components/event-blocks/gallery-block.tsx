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
 * Gallery block — owner-positioned grid of all event.images. The actual
 * grid + lightbox is shared with the auto-render fallback in EventGallery
 * (client island). This wrapper just lets the owner add an eyebrow/title
 * override and place the gallery anywhere in the block order.
 */
export function GalleryBlock({ payload, images, tone = "canvas" }: Props) {
  if (images.length === 0) return null;
  const eyebrow = payload.eyebrow || "Galerie";
  const title = payload.title || "Z minulých kempů";
  const dark = tone === "ink";
  return (
    <section
      className={[
        "border-t",
        dark ? "border-transparent bg-ink-900" : "border-border bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-24 sm:py-28">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          tone={dark ? "dark" : "light"}
        />
        <EventGallery images={images} chrome={false} />
      </div>
    </section>
  );
}
