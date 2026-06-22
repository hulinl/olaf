import type { ReactNode } from "react";

/**
 * Shared "small markdown" renderer for block body text. ProseBlock,
 * DaysBlock and (future) any other block that emits human-written body
 * use this so a hand-typed Notion source or a Claude-extracted body
 * renders consistently: bullet lines become <ul>, **foo** becomes
 * <strong>, *foo* / _foo_ becomes <em>.
 *
 * Deliberately tiny — no links, no code spans, no headings inside body
 * (heading lives in a separate field). Swap for react-markdown if the
 * surface grows.
 */

type Chunk =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] };

export function chunkBody(body: string): Chunk[] {
  const blocks = body
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Chunk[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const allBullets =
      lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l.trim()));
    if (allBullets) {
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

export function renderInline(text: string): ReactNode[] {
  const boldParts = text.split(/\*\*([^*]+?)\*\*/g);
  const out: ReactNode[] = [];
  boldParts.forEach((part, i) => {
    if (i % 2 === 1) {
      out.push(
        <strong key={`b${i}`} className="font-semibold text-current">
          {renderItalic(part, `bi${i}`)}
        </strong>,
      );
    } else {
      out.push(...renderItalic(part, `t${i}`));
    }
  });
  return out;
}

function renderItalic(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(
    /(?:^|(?<=\s))[*_]([^\s*_][^*_]*[^\s*_]|[^\s*_])[*_](?=\s|$|[.,;:!?])/g,
  );
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      out.push(<em key={`${keyPrefix}i${i}`}>{part}</em>);
    } else if (part) {
      out.push(part);
    }
  });
  return out;
}

interface FormattedBodyProps {
  body: string;
  /** Tailwind classes for the <ul> bullets. Defaults to brand-marker. */
  ulClassName?: string;
  /** Tailwind classes for paragraphs. Defaults to empty (caller provides
   *  outer space-y on the container). */
  pClassName?: string;
}

/**
 * One-shot helper: hand it a body string, get back the rendered React
 * tree with paragraphs, bullets and inline bold/italic in place. Use
 * this from blocks that already own their wrapper container styling.
 */
export function FormattedBody({
  body,
  ulClassName = "ml-5 list-disc space-y-1.5 marker:text-brand",
  pClassName = "whitespace-pre-line",
}: FormattedBodyProps) {
  const chunks = chunkBody(body);
  if (chunks.length === 0) return null;
  return (
    <>
      {chunks.map((c, i) =>
        c.kind === "ul" ? (
          <ul key={i} className={ulClassName}>
            {c.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className={pClassName}>
            {renderInline(c.lines.join("\n"))}
          </p>
        ),
      )}
    </>
  );
}
