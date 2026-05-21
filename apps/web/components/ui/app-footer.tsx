/**
 * Shared footer for every olaf surface — public landings, in-app
 * pages, owner cockpit. The "Powered by BI Factory" attribution is
 * the same pattern the user has on their other product (Slotly);
 * keep it small, monospace, low-volume.
 *
 * Wrap once at the layout level so we don't duplicate the markup on
 * every page. Use the `variant="bare"` mode for the in-app layout
 * where the surrounding chrome (sidebar, content padding) already
 * defines bounds; "framed" adds a top border line for standalone
 * public pages.
 */
export function AppFooter({
  variant = "framed",
}: {
  variant?: "framed" | "bare";
}) {
  const wrapperClass =
    variant === "framed"
      ? "border-t border-border bg-canvas"
      : "bg-canvas";

  return (
    <footer className={wrapperClass}>
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} olaf</span>
        <span>
          Powered by{" "}
          <a
            href="https://bifactory.cz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-700 transition-colors hover:text-ink-900"
          >
            BI Factory
          </a>
        </span>
      </div>
    </footer>
  );
}
