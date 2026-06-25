import { ReactNode } from "react";

interface Props {
  location?: string | null;
  memberCount?: number | null;
  className?: string;
}

/**
 * Tenká meta line: „{location} · {N} členů". Social linky se dnes
 * renderují přes `<WorkspaceSocialsRow>` (značkové ikony, contact
 * form místo mailto) — držet je tady jako text-only odkazy by
 * vedlo k duplicitě nebo nekonzistenci.
 */
export function WorkspaceMetaLine({
  location,
  memberCount,
  className = "",
}: Props) {
  const parts: ReactNode[] = [];
  if (location) parts.push(<span key="loc">{location}</span>);
  if (memberCount != null) {
    parts.push(<span key="mem">{memberCount} členů</span>);
  }
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
