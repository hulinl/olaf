import type { ReactNode } from "react";

/**
 * „Chrome" komponenty — realistické rámečky pro device mockupy v
 * marketing landing. Design převzatý z best4b/system-21 a přizpůsobený
 * OLAF paletě: light-mode canvas, amber accents, žádné motion knihovny.
 *
 * Použití:
 *   <LaptopFrame>
 *     <BrowserBar url="olaf.events/olaf-adventures" />
 *     <AdminCockpitScreen />
 *   </LaptopFrame>
 *
 * Frame držáky se stylují CSS třídami definovanými v globals.css
 * (blok „Marketing device chromes"). Inline styles držíme minimálně,
 * aby se dark/light preferences reflektovala v jednom místě.
 */

export function LaptopFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`chrome-laptop ${className}`}>
      <div className="chrome-laptop-screen">{children}</div>
    </div>
  );
}

export function PhoneFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`chrome-phone ${className}`}>
      <div className="chrome-phone-screen">
        <div className="chrome-phone-notch" aria-hidden />
        {children}
      </div>
    </div>
  );
}

/**
 * Browser chrome — traffic lights (macOS style) + URL bar. Používá se
 * uvnitř LaptopFrame jako první element, dá screenu produktový kontext
 * (uživatel vidí `olaf.events/…` v adresáku).
 */
export function BrowserBar({ url }: { url: string }) {
  return (
    <div className="chrome-browser-bar">
      <div className="chrome-browser-dots" aria-hidden>
        <span className="dot" style={{ background: "#ff5f57" }} />
        <span className="dot" style={{ background: "#febc2e" }} />
        <span className="dot" style={{ background: "#28c840" }} />
      </div>
      <div className="chrome-browser-url">
        <svg
          viewBox="0 0 16 16"
          width="9"
          height="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chrome-browser-lock"
          aria-hidden
        >
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5 7V5a3 3 0 016 0v2" />
        </svg>
        <span className="chrome-browser-url-text">{url}</span>
      </div>
    </div>
  );
}
