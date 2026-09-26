"use client";

import { useState } from "react";

/**
 * Sdílecí karta viditelná jen na vlastním profilu — user vidí URL,
 * jedním klikem zkopíruje do schránky. Vysvětluje na co se to hodí:
 * poslat lidem přehled závodů, biografii atd.
 */
export function ShareProfileCard({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${slug}`
      : `/u/${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback pro browsery bez clipboard API (např. iOS Safari
      // v starých verzích) — vybere text v inputu, user musí Cmd+C.
      const input = document.getElementById(
        "share-profile-input",
      ) as HTMLInputElement | null;
      input?.select();
    }
  };

  const share = async () => {
    if (typeof navigator === "undefined" || !navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({
        title: "Můj olaf profil",
        text: "Mrkni na můj race plán a profil",
        url,
      });
    } catch {
      /* user cancel */
    }
  };

  return (
    <div className="mt-6 overflow-hidden rounded-md border border-brand/40 bg-brand-soft/30">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="mono-tag text-brand">Sdílej svůj profil</p>
          <p className="mt-1 text-sm text-ink-700">
            Pošli tuhle URL komukoli — uvidí tvoji bio a race plán bez
            nutnosti loginu.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-hover focus-ring"
            aria-label="Sdílet profil"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 10a3 3 0 106 0 3 3 0 00-6 0zM14 6l3-3M14 14l3 3M6 10L3 10" />
            </svg>
            Sdílet
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-brand/20 bg-canvas/60 px-4 py-2">
        <input
          id="share-profile-input"
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate bg-transparent text-[13px] text-ink-700 focus:outline-none"
          aria-label="URL profilu"
        />
        <button
          type="button"
          onClick={copy}
          className={`shrink-0 rounded-sm px-2 py-1 text-[12px] font-semibold transition-colors focus-ring ${
            copied
              ? "bg-success text-canvas"
              : "bg-ink-900 text-canvas hover:brightness-110"
          }`}
        >
          {copied ? "Zkopírováno ✓" : "Kopírovat"}
        </button>
      </div>
    </div>
  );
}
