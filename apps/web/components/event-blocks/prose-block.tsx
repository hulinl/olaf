import { assetUrl } from "@/lib/api";
import type { ProseBlockPayload } from "@/lib/event-blocks";

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
    <section className="border-t border-border">
      <div
        className={[
          "mx-auto max-w-5xl px-4 py-16",
          image ? "grid gap-10 md:grid-cols-2" : "",
        ].join(" ")}
      >
        {image && side === "left" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-[4/5] w-full rounded-lg object-cover"
          />
        )}
        <div>
          {payload.eyebrow && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
              {payload.eyebrow}
            </p>
          )}
          {payload.heading && (
            <h2 className="mb-6 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
              {payload.heading}
            </h2>
          )}
          <div className="space-y-4 text-ink-700">
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
            className="aspect-[4/5] w-full rounded-lg object-cover"
          />
        )}
      </div>
    </section>
  );
}
