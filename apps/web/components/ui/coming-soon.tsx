/**
 * Placeholder for admin agendas that are scoped but not yet implemented.
 * Sets expectations for the owner so they know what's coming + when to
 * check back.
 */
export function ComingSoon({
  title,
  body,
  bullets,
}: {
  title: string;
  body: string;
  bullets?: string[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex items-baseline gap-3">
          <p className="text-sm font-medium text-brand">Správce</p>
          <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] text-ink-500">
            Brzy
          </span>
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-ink-500">{body}</p>
      </header>

      {bullets && bullets.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted/40 p-6">
          <p className="mb-4 text-sm font-medium uppercase tracking-wide text-ink-500">
            Co bude umět
          </p>
          <ul className="flex flex-col gap-3">
            {bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-ink-700"
              >
                <span
                  aria-hidden
                  className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-brand"
                />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
