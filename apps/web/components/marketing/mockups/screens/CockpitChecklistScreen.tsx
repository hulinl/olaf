/**
 * Variant of admin cockpit — focus na roadmap checklist místo roster.
 * Používá se pro „Cockpit" feature sekci, aby se AdminCockpit
 * (focus na roster) neopakoval.
 */
export function CockpitChecklistScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-ink-900 text-[7px] font-bold text-canvas">
            o
          </span>
          <span className="text-[9px] font-medium text-ink-500">
            Tvůrce · Spring Camp Beskydy · Přehled
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-[7px] font-medium text-ink-700">
          <span className="inline-block h-1 w-1 rounded-full bg-success" />
          Publikováno
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden px-5 py-4">
        {/* H1 + subtitle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[12px] font-semibold leading-tight tracking-tight text-ink-900">
              Spring Camp Beskydy
            </h1>
            <p className="mt-0.5 text-[8px] text-ink-500">
              16.–19. května 2026 · 24 dní do akce
            </p>
          </div>
          <span className="mono-tag text-[7px] text-brand">
            85 % · připraveno
          </span>
        </div>

        {/* StatTiles zjednodušené */}
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <MiniStat label="Přihlášeno" value="27 / 30" />
          <MiniStat label="Čeká" value="2" warning />
          <MiniStat label="Neplaceno" value="5" />
          <MiniStat label="Waitlist" value="4" />
        </div>

        {/* Roadmap checklist */}
        <div className="mt-3 rounded-sm border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-2 py-1">
            <p className="mono-tag text-[6px] text-ink-500">
              Roadmapa akce · checklist
            </p>
            <span className="text-[6px] text-ink-500">17 z 20 hotovo</span>
          </div>
          <div className="p-2">
            <ChecklistCategory
              title="Základy"
              items={[
                { label: "Termín potvrzený", done: true },
                { label: "Cena a kapacita nastavené", done: true },
                { label: "Landing publikován", done: true },
              ]}
            />
            <ChecklistCategory
              title="Přihlášky"
              items={[
                { label: "Formulář otázek hotový", done: true },
                { label: "Přijímání spuštěné", done: true },
                { label: "Čekají 2 pending → schválit", done: false, warning: true },
              ]}
            />
            <ChecklistCategory
              title="Komunikace"
              items={[
                { label: "Uvítací e-mail (T-14)", done: true, scheduled: "za 8 dní" },
                { label: "Pokyny k platbě (T-7)", done: false, scheduled: "za 15 dní" },
                { label: "Sraz + počasí (T-1)", done: false, scheduled: "za 23 dní" },
              ]}
              last
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-sm border p-1.5 ${
        warning
          ? "border-warning/40 bg-warning/5"
          : "border-border bg-surface"
      }`}
    >
      <p className="mono-tag text-[5px] text-ink-500">{label}</p>
      <p
        className={`mt-0.5 text-[9px] font-semibold leading-none tracking-tight tabular-nums ${
          warning ? "text-warning" : "text-ink-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChecklistCategory({
  title,
  items,
  last,
}: {
  title: string;
  items: { label: string; done: boolean; warning?: boolean; scheduled?: string }[];
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-2 border-b border-border pb-2"}>
      <p className="mono-tag mb-1 text-[6px] text-ink-500">{title}</p>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-center gap-1.5 text-[7px]"
          >
            <span
              className={`inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-sm border ${
                it.done
                  ? "border-success bg-success text-canvas"
                  : it.warning
                    ? "border-warning bg-warning/10 text-warning"
                    : "border-border bg-canvas text-ink-500"
              }`}
            >
              {it.done ? "✓" : it.warning ? "!" : ""}
            </span>
            <span
              className={
                it.done ? "text-ink-500 line-through" : "text-ink-900"
              }
            >
              {it.label}
            </span>
            {it.scheduled && (
              <span className="ml-auto text-[6px] text-ink-500">
                {it.scheduled}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
