"use client";

export function SubmitRaceButton() {
  return (
    <button
      type="button"
      onClick={() =>
        document.dispatchEvent(new CustomEvent("olaf:open-race-submit"))
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-brand bg-brand-soft px-3 py-1.5 text-sm font-medium text-ink-900 transition-colors hover:bg-brand hover:text-brand-ink focus-ring"
    >
      <span aria-hidden>➕</span>
      Chybí tu závod?
    </button>
  );
}
