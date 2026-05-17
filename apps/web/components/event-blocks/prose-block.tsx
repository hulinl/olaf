import { assetUrl } from "@/lib/api";
import type { ProseBlockPayload } from "@/lib/event-blocks";
import { SectionHead } from "@/components/ui/section-head";

interface Props {
  payload: ProseBlockPayload;
}

export function ProseBlock({ payload }: Props) {
  const image = assetUrl(payload.image_url);
  const side = payload.image_side ?? "right";
  const paragraphs = (payload.body ?? "").split(/\n\n+/).filter(Boolean);

  if (!payload.eyebrow && !payload.heading && paragraphs.length === 0 && !image) {
    return null;
  }

  return (
    <section className="border-t border-border bg-canvas">
      <div
        className={[
          "mx-auto max-w-5xl px-4 py-16 sm:py-20",
          image ? "grid gap-12 md:grid-cols-2 md:items-start" : "",
        ].join(" ")}
      >
        {image && side === "left" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-[4/5] w-full rounded-md object-cover"
          />
        )}
        <div>
          {(payload.eyebrow || payload.heading) && (
            <SectionHead
              eyebrow={payload.eyebrow}
              title={payload.heading ?? ""}
            />
          )}
          <div
            className="space-y-4 text-ink-700"
            style={{ fontSize: 16, lineHeight: 1.6 }}
          >
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
        {image && side === "right" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-[4/5] w-full rounded-md object-cover"
          />
        )}
      </div>
    </section>
  );
}
