/**
 * Replica of `/admin/audit` — append-only audit log s filtrem + tabulkou
 * (actor, action, target, timestamp). Match `audit` app v OLAF, aby
 * marketing landing věrně ukazoval audit + koš feature.
 */
export function AuditLogScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-ink-900 text-[7px] font-bold text-canvas">
            o
          </span>
          <span className="text-[9px] font-medium text-ink-500">
            Tvůrce · Audit &amp; koš
          </span>
        </div>
        <span className="text-[7px] text-ink-500">Append-only · retence 30 dní</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden px-5 py-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-[16px] font-semibold leading-tight tracking-tight text-ink-900">
              Audit log
            </h1>
            <p className="mt-0.5 text-[8px] text-ink-500">
              128 událostí · workspace Olaf Adventures
            </p>
          </div>
          <div className="flex items-center gap-1">
            {["Vše", "Registrace", "Platby", "Diskuze", "Role"].map(
              (label, i) => (
                <span
                  key={label}
                  className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[7px] font-medium ${
                    i === 0
                      ? "border-ink-900 bg-ink-900 text-canvas"
                      : "border-border bg-canvas text-ink-700"
                  }`}
                >
                  {label}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Vyhledávání */}
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-border bg-surface-muted px-2 py-1">
          <span className="text-[8px] text-ink-500">⌕</span>
          <span className="text-[7px] text-ink-500">
            Hledat podle jména / akce / typu…
          </span>
        </div>

        {/* Audit table — 4 sloupce (actor / co · target / typ badge / kdy).
            Předtím měl 5 sloupců s duplicitním „Objekt" column, což
            texty šoupalo přes sebe. */}
        <div className="mt-3 overflow-hidden rounded-sm border border-border bg-surface">
          <div className="grid grid-cols-[18px_1fr_80px_50px] items-center gap-2 border-b border-border bg-surface-muted px-2 py-1.5">
            <span aria-hidden />
            <span className="mono-tag text-[6px] text-ink-500">Kdo · Co · Kde</span>
            <span className="mono-tag text-[6px] text-ink-500">Typ</span>
            <span className="mono-tag text-[6px] text-ink-500 text-right">Kdy</span>
          </div>
          <AuditRow
            actor="O"
            action="Schválil"
            target="RSVP · Marta Nová"
            kind="Registrace"
            kindTone="success"
            age="před 12 min"
          />
          <AuditRow
            actor="O"
            action="Vystavil fakturu"
            target="INV-2026-018"
            kind="Platby"
            kindTone="brand"
            age="před 1 h"
          />
          <AuditRow
            actor="K"
            action="Přidal komentář"
            target="Kdo bere karimatky?"
            kind="Diskuze"
            kindTone="neutral"
            age="dnes"
          />
          <AuditRow
            actor="O"
            action="Upravil akci"
            target="Spring Camp Beskydy"
            kind="Akce"
            kindTone="brand"
            age="včera"
          />
          <AuditRow
            actor="J"
            action="Smazal RSVP"
            target="Jakub Dvořák"
            kind="Registrace"
            kindTone="danger"
            age="včera"
          />
          <AuditRow
            actor="O"
            action="Přidal roli admin"
            target="Karel Novák"
            kind="Role"
            kindTone="warning"
            age="před 2 dny"
            last
          />
        </div>

        {/* Trash notice */}
        <div className="mt-3 flex items-center justify-between rounded-sm border border-dashed border-ink-300 bg-surface-muted/60 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-ink-900 text-[8px] text-canvas"
            >
              ⌫
            </span>
            <div>
              <p className="text-[8px] font-medium text-ink-900">
                Koš · 3 položky
              </p>
              <p className="text-[6px] text-ink-500">
                Auto-purge za 27 dní, restore kliknutím
              </p>
            </div>
          </div>
          <span className="text-[7px] font-medium text-brand">Otevřít →</span>
        </div>
      </div>
    </div>
  );
}

function AuditRow({
  actor,
  action,
  target,
  kind,
  kindTone,
  age,
  last,
}: {
  actor: string;
  action: string;
  target: string;
  kind: string;
  kindTone: "success" | "brand" | "neutral" | "danger" | "warning";
  age: string;
  last?: boolean;
}) {
  const toneClass = {
    success: "border-success/40 bg-success/5 text-success",
    brand: "border-brand/40 bg-brand-soft/40 text-ink-900",
    neutral: "border-border bg-surface-muted text-ink-700",
    danger: "border-danger/40 bg-danger-soft/40 text-danger",
    warning: "border-warning/40 bg-warning/5 text-warning",
  }[kindTone];
  return (
    <div
      className={`grid grid-cols-[18px_1fr_80px_50px] items-center gap-2 px-2 py-1.5 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[7px] font-semibold text-canvas">
        {actor}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[7px] text-ink-900">
          <span className="font-medium">{action}</span>
          <span className="mx-1 text-ink-500">·</span>
          <span className="text-ink-700">{target}</span>
        </p>
      </div>
      <span
        className={`inline-flex items-center justify-center rounded-sm border px-1 py-0.5 text-[6px] font-medium ${toneClass}`}
      >
        {kind}
      </span>
      <span className="text-right text-[6px] text-ink-500">{age}</span>
    </div>
  );
}
