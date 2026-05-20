"use client";

import { useEffect, useState } from "react";

/** SHA the current bundle was built from. Set in CI via
 *  NEXT_PUBLIC_BUILD_SHA — empty in local dev. */
const CLIENT_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";

/** Poll interval while the tab is foregrounded. We *also* poll on
 *  visibilitychange so iPhone PWAs returning from background catch the
 *  newest deploy without waiting for the next tick. */
const POLL_MS = 5 * 60 * 1000;

interface ServerVersion {
  sha?: string;
  built_at?: string;
}

/**
 * Live-update detector for the PWA. When the running bundle's commit
 * sha no longer matches the deployed /version.json, surface a small
 * non-blocking toast at the bottom of the screen so the user can
 * one-tap reload. Without this the iPhone home-screen PWA will
 * happily keep showing months-old code.
 *
 * Skip entirely in local dev (no CLIENT_SHA → no comparison to make).
 */
export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!CLIENT_SHA) return; // dev mode

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function check() {
      try {
        // no-store skips both the HTTP cache and any CDN-side response
        // cache (Azure SWA serves this as a tiny static file; the
        // round-trip is sub-30 KB).
        const res = await fetch("/version.json", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ServerVersion;
        if (cancelled) return;
        if (data.sha && data.sha !== CLIENT_SHA) {
          setUpdateAvailable(true);
        }
      } catch {
        // Network blip — ignore; we'll try again on the next tick.
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }

    // First check shortly after mount (don't block initial paint), then
    // tick on an interval and on tab return.
    const initial = setTimeout(check, 4000);
    interval = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-brand/40 bg-canvas/95 px-4 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-canvas/85">
        <span className="text-sm font-medium text-ink-900">
          K dispozici je nová verze
        </span>
        <button
          type="button"
          onClick={() => {
            // Hard reload — bypasses bfcache + any stale memory state
            // the iOS PWA might have held across launches.
            window.location.reload();
          }}
          className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-ink hover:opacity-90 focus-ring"
        >
          Aktualizovat
        </button>
      </div>
    </div>
  );
}
