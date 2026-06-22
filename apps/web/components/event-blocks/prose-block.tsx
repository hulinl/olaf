import { assetUrl } from "@/lib/api";
import type { BlockTone, ProseBlockPayload } from "@/lib/event-blocks";
import { SectionHead } from "@/components/ui/section-head";
import { FormattedBody, chunkBody } from "@/lib/prose-format";

interface Props {
  payload: ProseBlockPayload;
  tone?: BlockTone;
}

export function ProseBlock({ payload, tone = "canvas" }: Props) {
  const image = assetUrl(payload.image_url);
  const side = payload.image_side ?? "right";
  const hasBody = chunkBody(payload.body ?? "").length > 0;

  if (!payload.eyebrow && !payload.heading && !hasBody && !image) {
    return null;
  }

  const dark = tone === "ink";

  return (
    <section
      className={["", dark ? "bg-ink-900" : "bg-canvas"].join(" ")}
    >
      <div
        className={[
          "mx-auto max-w-5xl px-4 py-10 sm:py-12",
          image ? "grid gap-12 md:grid-cols-2 md:items-start" : "",
        ].join(" ")}
      >
        {image && side === "left" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-[4/5] w-full rounded-md object-cover"
            loading="lazy"
            decoding="async"
          />
        )}
        <div>
          {(payload.eyebrow || payload.heading) && (
            <SectionHead
              eyebrow={payload.eyebrow}
              title={payload.heading ?? ""}
              tone={dark ? "dark" : "light"}
            />
          )}
          <div
            className={[
              "space-y-4",
              dark ? "text-white/80" : "text-ink-700",
            ].join(" ")}
            style={{ fontSize: 16, lineHeight: 1.6 }}
          >
            <FormattedBody body={payload.body ?? ""} />
          </div>
        </div>
        {image && side === "right" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-[4/5] w-full rounded-md object-cover"
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
    </section>
  );
}
