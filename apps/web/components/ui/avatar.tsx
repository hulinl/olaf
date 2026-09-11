import Link from "next/link";

import { assetUrl } from "@/lib/api";

interface AvatarProps {
  firstName: string;
  lastName: string;
  /** URL avatar obrázku (z UserSerializer.avatar_url). Prázdný string
   *  nebo `undefined` = spadneme na iniciálový avatar. */
  avatarUrl?: string;
  /** Focal + zoom uložené z PhotoEditor komponenty. Rendrujeme přes
   *  CSS object-position + transform:scale. Defaults 50/50/100 =
   *  centrovaná fotka bez zoomu. */
  focalX?: number;
  focalY?: number;
  zoom?: number;
  size?: number;
  /** Když je set (id z UserSerializer), obalíme avatar do Linku na
   *  `/u/<id>` — public profile page. Undefined = ne-klikatelný
   *  (např. pro anon signaturu, nebo když ID neznáme).
   *  2026-09-11: preferuj `userSlug` — dnes canonical URL je
   *  `/u/<profile_slug>`. `userId` zůstává jako backward-compat,
   *  aby callsite s legacy payloadem nespadl. */
  userId?: number | null;
  userSlug?: string | null;
}

/** Circular avatar. Když má user avatar_url, ukazuje obrázek zarámovaný
 *  podle uloženého focal + zoom (viz PhotoEditor). Jinak fallback na
 *  pastel-tinted iniciály (deterministický background dělá
 *  DiscussionWall separátně; tady necháváme neutrální surface-strong
 *  ať to fituje kdekoliv v UI).
 *
 *  Když je `userId` set, kliknutím se skočí na `/u/<id>`, což je
 *  public profile view. Bez userId zůstává avatar decorative-only
 *  (matches původní chování, backward compat).
 */
export function Avatar({
  firstName,
  lastName,
  avatarUrl,
  focalX = 50,
  focalY = 50,
  zoom = 100,
  size = 36,
  userId,
  userSlug,
}: AvatarProps) {
  // Prefer slug (canonical URL) — fallback na numerické id pro
  // backward compat s callsite kde slug ještě není v payloadu.
  const profileHref = userSlug
    ? `/u/${userSlug}`
    : userId
      ? `/u/${userId}`
      : null;
  const src = avatarUrl ? assetUrl(avatarUrl) : "";
  const visual = src ? (
    <span
      aria-hidden="true"
      className="inline-block overflow-hidden rounded-full bg-surface-strong"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        style={{
          objectPosition: `${focalX}% ${focalY}%`,
          transform: `scale(${zoom / 100})`,
          transformOrigin: `${focalX}% ${focalY}%`,
        }}
      />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full bg-surface-strong font-semibold text-ink-900"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        lineHeight: 1,
      }}
    >
      {(
        `${firstName.charAt(0) ?? ""}${lastName.charAt(0) ?? ""}`.toUpperCase() ||
        "?"
      )}
    </span>
  );
  if (profileHref) {
    return (
      <Link
        href={profileHref}
        aria-label={`Profil uživatele ${firstName} ${lastName}`.trim()}
        className="inline-block rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        {visual}
      </Link>
    );
  }
  return visual;
}
