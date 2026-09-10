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
}

/** Circular avatar. Když má user avatar_url, ukazuje obrázek zarámovaný
 *  podle uloženého focal + zoom (viz PhotoEditor). Jinak fallback na
 *  pastel-tinted iniciály (deterministický background dělá
 *  DiscussionWall separátně; tady necháváme neutrální surface-strong
 *  ať to fituje kdekoliv v UI).
 */
export function Avatar({
  firstName,
  lastName,
  avatarUrl,
  focalX = 50,
  focalY = 50,
  zoom = 100,
  size = 36,
}: AvatarProps) {
  const src = avatarUrl ? assetUrl(avatarUrl) : "";
  if (src) {
    return (
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
    );
  }
  const initials =
    `${firstName.charAt(0) ?? ""}${lastName.charAt(0) ?? ""}`.toUpperCase() ||
    "?";
  return (
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
      {initials}
    </span>
  );
}
