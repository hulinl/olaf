import { assetUrl } from "@/lib/api";
import type { BlockTone, ProseBlockPayload } from "@/lib/event-blocks";
import { SectionHead } from "@/components/ui/section-head";

interface Props {
  payload: ProseBlockPayload;
  tone?: BlockTone;
}

/**
 * Parse a free-form body into renderable chunks. We're not running a
 * full markdown engine here — that's overkill for prose blocks. Just
 * enough to (a) keep blank-line-separated paragraphs as paragraphs and
 * (b) treat consecutive bullet lines (- foo / * foo) inside a chunk
 * as a single <ul>. Notion ingest emits "- " bullets via `_block_to_text`,
 * so this is the canonical shape Claude sees and re-emits.
 */
type ProseChunk =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] };

function chunkProse(body: string): ProseChunk[] {
  const blocks = body.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  const out: ProseChunk[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const allBullets = lines.every((l) => /^[-*]\s+/.test(l.trim()));
    if (allBullets && lines.length > 0) {
      out.push({
        kind: "ul",
        items: lines.map((l) => l.trim().replace(/^[-*]\s+/, "")),
      });
    } else {
      out.push({ kind: "p", lines });
    }
  }
  return out;
}

export function ProseBlock({ payload, tone = "canvas" }: Props) {
  const image = assetUrl(payload.image_url);
  const side = payload.image_side ?? "right";
  const chunks = chunkProse(payload.body ?? "");

  if (!payload.eyebrow && !payload.heading && chunks.length === 0 && !image) {
    return null;
  }

  const dark = tone === "ink";

  return (
    <section
      className={[
        "",
        dark ? "bg-ink-900" : "bg-canvas",
      ].join(" ")}
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
            className={["space-y-4", dark ? "text-white/80" : "text-ink-700"].join(
              " ",
            )}
            style={{ fontSize: 16, lineHeight: 1.6 }}
          >
            {chunks.map((c, i) =>
              c.kind === "ul" ? (
                <ul
                  key={i}
                  className="ml-5 list-disc space-y-1.5 marker:text-brand"
                >
                  {c.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              ) : (
                // Preserve single line breaks inside a paragraph block —
                // Notion bullet lists already got chunked into <ul> above,
                // so a multi-line "p" is a paragraph with intentional
                // line breaks (e.g. an address).
                <p key={i} className="whitespace-pre-line">
                  {c.lines.join("\n")}
                </p>
              ),
            )}
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
