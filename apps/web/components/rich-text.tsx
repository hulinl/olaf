"use client";

import { Fragment } from "react";

// Http(s) URL: schema + hostname + path without whitespace, quotes, or
// bracket chars that typically wrap URLs in prose. Trailing punctuation
// (. , ; : ! ?) gets stripped afterwards so „viz https://example.com."
// linkifies the URL without swallowing the sentence-ending period.
const URL_REGEX = /(https?:\/\/[^\s<>()"']+)/g;
const TRAILING_PUNCT = /[.,!?;:]+$/;

/**
 * Renders plain text with URLs auto-linkified and newlines preserved.
 * Used on the discussion wall (topics + comments) where users paste
 * event details ("checkin: https://…", "chata: https://…") and expect
 * links to open on click. No markdown — just linkify + line breaks;
 * emoji + bullet dashes render as-is via unicode.
 */
export function RichText({
  text,
  className,
  linkClassName,
}: {
  text: string;
  className?: string;
  /** Override the default link styling. */
  linkClassName?: string;
}) {
  const parts = text.split(URL_REGEX);
  const linkCls =
    linkClassName ??
    "break-words text-brand underline underline-offset-2 hover:opacity-80";

  return (
    <span className={["whitespace-pre-wrap", className].filter(Boolean).join(" ")}>
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          return <Fragment key={i}>{part}</Fragment>;
        }
        const trailing = part.match(TRAILING_PUNCT)?.[0] ?? "";
        const url = trailing ? part.slice(0, -trailing.length) : part;
        return (
          <Fragment key={i}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={linkCls}
            >
              {url}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </span>
  );
}
