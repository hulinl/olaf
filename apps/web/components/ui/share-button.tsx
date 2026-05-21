"use client";

import { useState } from "react";

interface Props {
  /** Absolute or root-relative URL to share. Relative paths get
   *  resolved against window.location.origin at click time. */
  url: string;
  /** Title for Web Share + screen readers. */
  title: string;
  /** Optional descriptive text for Web Share. */
  text?: string;
  /** Visual style — defaults to "ghost" (border + surface bg) which
   *  works on both Tvůrce headers and public landings. "soft" is a
   *  smaller chip for tight corners. */
  variant?: "ghost" | "soft";
  /** Optional accessible label override (e.g. "Sdílet akci"). */
  label?: string;
}

/**
 * Single share affordance: Web Share API on capable devices (mobile
 * gives the native share sheet), otherwise copies the URL to the
 * clipboard with a brief "✓ Zkopírováno" confirmation. Sharing your
 * own event/komunita is high-leverage organic distribution — every
 * place a user lands on their own thing should have this button.
 */
export function ShareButton({
  url,
  title,
  text,
  variant = "ghost",
  label = "Sdílet",
}: Props) {
  const [state, setState] = useState<"idle" | "copied" | "shared">("idle");

  async function handle() {
    const absoluteUrl =
      typeof window === "undefined"
        ? url
        : new URL(url, window.location.origin).toString();

    // Web Share API: native sheet on mobile, AirDrop/Messages on macOS Safari.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url: absoluteUrl });
        setState("shared");
        setTimeout(() => setState("idle"), 1500);
        return;
      } catch (err) {
        // AbortError = user cancelled the share sheet; treat as no-op.
        if ((err as DOMException)?.name === "AbortError") return;
        // Anything else, fall through to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      // Last resort: surface a prompt so the user can grab the URL.
      window.prompt("Zkopíruj odkaz", absoluteUrl);
    }
  }

  // Icon-only everywhere — the share glyph is universally recognised
  // and the text label ate a chunk of horizontal real estate on the
  // Tvůrce header row next to "Upravit akci →" / "Veřejný náhled ↗".
  // Label still lives in aria-label + title for screen readers and
  // tooltips. Ghost variant = 36 × 36 square (matches button-md
  // height); soft variant = 32 × 32 (cramped public header).
  const isGhost = variant === "ghost";
  const className = isGhost
    ? "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
    : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring";
  const stateLabel =
    state === "copied"
      ? "Zkopírováno"
      : state === "shared"
        ? "Sdíleno"
        : label;

  return (
    <button
      type="button"
      onClick={handle}
      className={className}
      aria-label={stateLabel}
      title={stateLabel}
    >
      {state === "copied" || state === "shared" ? (
        <span aria-hidden className="text-success">
          ✓
        </span>
      ) : (
        <ShareIcon />
      )}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="3.5" r="1.75" />
      <circle cx="4" cy="8" r="1.75" />
      <circle cx="12" cy="12.5" r="1.75" />
      <line x1="5.5" y1="7.1" x2="10.5" y2="4.4" />
      <line x1="5.5" y1="8.9" x2="10.5" y2="11.6" />
    </svg>
  );
}
