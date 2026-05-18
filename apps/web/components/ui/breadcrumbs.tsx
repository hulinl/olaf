import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  items: Crumb[];
  className?: string;
}

/**
 * Hierarchical navigation. Last item is the current page (no href).
 * Use instead of "← Back" links so users can jump up multiple levels.
 */
export function Breadcrumbs({ items, className = "" }: Props) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={["text-sm text-ink-500", className].join(" ")}
    >
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-x-1.5">
              {i > 0 ? (
                <span aria-hidden="true" className="text-ink-300">
                  /
                </span>
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded-sm transition-colors hover:text-ink-900 focus-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "font-medium text-ink-900" : ""}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
