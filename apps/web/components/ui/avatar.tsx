interface AvatarProps {
  firstName: string;
  lastName: string;
  size?: number;
}

/** Initial-based circular avatar. Image-backed avatars land with the upload feature. */
export function Avatar({ firstName, lastName, size = 36 }: AvatarProps) {
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
