import type { ReactNode } from "react";

/**
 * Whitelist + branded ikony pro workspace.social_links.
 *
 * `key` = slug uložený v `social_links` JSON; `label` = lidská
 * varianta v editoru; `Icon` = inline SVG (žádná knihovna, nechci
 * každou stránku ředit 100kB lucide bundle).
 *
 * Email má speciální flow — místo URL otevíráme contact form (modal),
 * který post-uje na backend, ten pošle e-mail na adresu v
 * `social_links.email`. User tak nikdy adresu na public stránce
 * neuvidí — chrání workspace owner-a před spamem a šedými boty.
 */

interface IconProps {
  size?: number;
}

function InstagramIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function StravaIcon({ size = 16 }: IconProps) {
  // Oficiální Strava chevron forma — zjednodušený glyph, čitelný
  // i v 14 px.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11 2 L4 14 L8 14 L11 8.4 L13.9 14 L17.7 14 L11 2 Z" />
      <path
        d="M13.9 14 L11 19 L8.1 14 L11 14 L11 17 L11.4 16.2 L13.9 14 Z"
        opacity="0.6"
      />
    </svg>
  );
}

function WebIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function EmailIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface SocialService {
  key: string;
  label: string;
  placeholder: string;
  Icon: (p: IconProps) => ReactNode;
  /** True = renderer ho zobrazí jako kontaktní formulář (modal), ne
   *  jako URL. Aktuálně jen `email`. */
  isContactForm?: boolean;
}

export const SOCIAL_SERVICES: SocialService[] = [
  {
    key: "web",
    label: "Web",
    placeholder: "https://olafadventures.com",
    Icon: WebIcon,
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/olafadventures",
    Icon: InstagramIcon,
  },
  {
    key: "strava",
    label: "Strava",
    placeholder: "https://strava.com/clubs/olafadventures",
    Icon: StravaIcon,
  },
  {
    key: "email",
    label: "Email",
    placeholder: "ahoj@olafadventures.com",
    Icon: EmailIcon,
    isContactForm: true,
  },
];

/** Vrátí jen ty entries z `social_links`, které:
 *  - jsou v aktuálním whitelistu (SOCIAL_SERVICES),
 *  - mají vyplněnou hodnotu.
 *  Tím legacy keys (např. `facebook` po jeho odebrání) nepropadnou
 *  do veřejného renderingu. */
export function filteredSocials(
  socialLinks: Record<string, string> | undefined | null,
): Array<{ service: SocialService; value: string }> {
  if (!socialLinks) return [];
  return SOCIAL_SERVICES.flatMap((s) => {
    const value = (socialLinks[s.key] || "").trim();
    if (!value) return [];
    return [{ service: s, value }];
  });
}
