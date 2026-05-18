import { ReactNode } from "react";

interface Props {
  location?: string | null;
  memberCount?: number | null;
  /** Sorted [key, url] entries from workspace.social_links. */
  socials: [string, string][];
  className?: string;
}

/**
 * One-line meta — "{location} · {N} členů · web ↗ · instagram ↗ …"
 * Replaces the legacy multi-row treatment with separate chip strip.
 */
export function WorkspaceMetaLine({
  location,
  memberCount,
  socials,
  className = "",
}: Props) {
  const parts: ReactNode[] = [];
  if (location) parts.push(<span key="loc">{location}</span>);
  if (memberCount != null) {
    parts.push(<span key="mem">{memberCount} členů</span>);
  }
  socials.forEach(([key, url]) => {
    parts.push(
      <a
        key={`social-${key}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-baseline gap-0.5 text-ink-700 underline-offset-2 hover:text-ink-900 hover:underline"
      >
        {key}
        <span aria-hidden="true">↗</span>
      </a>,
    );
  });
  if (parts.length === 0) return null;
  return (
    <p
      className={[
        "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-500",
        className,
      ].join(" ")}
    >
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-baseline gap-2">
          {i > 0 && (
            <span aria-hidden="true" className="text-ink-300">
              ·
            </span>
          )}
          {p}
        </span>
      ))}
    </p>
  );
}
