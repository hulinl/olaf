import Link from "next/link";

/**
 * Global footer — same structure as Slotly's so both apps share the
 * brand pattern; only the app name + its color change. Two
 * attributions on a single centered line:
 *
 *   [app] · Powered by [BIfactory logo]
 *
 * The app name links home in the OLAF brand-amber; the BIfactory
 * link points to bifactory.cz with the company logo (light variant
 * for now — dark logo lives in public/ for future dark-mode pages).
 */
export function AppFooter({
  variant = "framed",
}: {
  /** "framed" adds a top divider line + light bg (standalone public
   *  pages). "bare" drops both for use inside the in-app shell. */
  variant?: "framed" | "bare";
}) {
  const wrapperClass =
    variant === "framed"
      ? "mt-auto border-t border-border bg-canvas py-5 px-4 sm:px-6"
      : "mt-auto bg-canvas py-5 px-4 sm:px-6";

  return (
    <footer className={wrapperClass}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-500">
        <Link
          href="/"
          className="font-semibold text-brand hover:underline"
        >
          olaf
        </Link>
        <span aria-hidden className="text-ink-300">
          ·
        </span>
        <a
          href="https://bifactory.cz"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 font-medium text-ink-700 transition-colors hover:text-ink-900"
        >
          <span>Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bifactory-logo.png"
            alt="BIfactory s.r.o."
            className="h-6 w-6"
          />
        </a>
      </div>
    </footer>
  );
}
