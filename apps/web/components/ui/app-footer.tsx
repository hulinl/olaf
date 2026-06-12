import Link from "next/link";

/**
 * Global footer — Slotly-style single centered row with copyright +
 * BIfactory attribution, plus a small marketing nav above it.
 *
 *   Web · Návody
 *   © 2026 olaf · Powered by [BIfactory logo]
 *
 * Marketing nav is intentionally minimal — Web + Návody. „Přihlásit"
 * a „Účet zdarma" sem nepatří; přihlášený user už login chrome vidí
 * v headeru, anonymní visitor stejně skončí v hero CTA dřív než
 * doscrolluje k patičce. Blog link je dočasně skrytý, vrátí se až
 * bude kurátovaný obsah.
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
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 text-xs text-ink-500">
        <nav
          aria-label="Patička"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
        >
          <Link href="/" className="text-ink-700 hover:text-ink-900">
            Web
          </Link>
          <Link href="/manual" className="text-ink-700 hover:text-ink-900">
            Návody
          </Link>
          <Link
            href="/legal/zasady-ochrany-osobnich-udaju"
            className="text-ink-700 hover:text-ink-900"
          >
            Zásady OÚ
          </Link>
          <Link
            href="/legal/cookies"
            className="text-ink-700 hover:text-ink-900"
          >
            Cookies
          </Link>
        </nav>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="whitespace-nowrap">
            © {new Date().getFullYear()}{" "}
            <Link href="/" className="font-semibold text-brand hover:underline">
              olaf
            </Link>
          </span>
          <span aria-hidden className="text-ink-300">
            ·
          </span>
          <a
            href="https://bifactory.cz"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 whitespace-nowrap font-medium text-ink-700 transition-colors hover:text-ink-900"
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
      </div>
    </footer>
  );
}
