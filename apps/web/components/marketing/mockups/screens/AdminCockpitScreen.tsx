/**
 * Replica of `/tvurce/akce/<ws>/<slug>` cockpit — H1 s meta pill
 * toolbarem, StatTiles, roster preview. Match reálné app UI (sharp
 * corners per OA design DNA). Sizing přizpůsobený tak, aby na
 * LaptopFrame ~500 px šířky texty držely čitelně a bez overlapu.
 */
export function AdminCockpitScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-ink-900 text-[6px] font-bold text-canvas">
            o
          </span>
          <span className="truncate text-[8px] font-medium text-ink-500">
            Tvůrce · Spring Camp Beskydy
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span className="mono-tag text-[6px] text-ink-500">TVŮRCE</span>
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[6px] font-semibold text-canvas">
            O
          </span>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="flex-1 overflow-hidden px-5 py-3.5">
        {/* Back link */}
        <p className="text-[7px] text-ink-500">← Všechny akce</p>

        {/* H1 + subtitle + published badge */}
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[12px] font-semibold leading-tight tracking-tight text-ink-900">
              Spring Camp Beskydy
            </h1>
            <p className="mt-0.5 text-[8px] text-ink-500">
              16.–19. května 2026 · Rožnov pod Radhoštěm
            </p>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-[7px] font-medium text-ink-700">
            <span className="inline-block h-1 w-1 rounded-full bg-success" />
            Publikováno
          </span>
        </div>

        {/* Pill toolbar — jen 3 nejdůležitější akce (jinak přetéká) */}
        <div className="mt-2.5 flex flex-wrap gap-1">
          {["Upravit akci", "Obsah", "Dokumenty"].map((label, i) => (
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
          ))}
        </div>

        {/* Stat Tiles */}
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <StatTile label="Přihlášeno" value="27 / 30" sub="celkem 28" active />
          <StatTile label="Čeká" value="2" sub="ke schválení" warning />
          <StatTile label="Neplaceno" value="5" sub="čeká na VS" />
          <StatTile label="Waitlist" value="4" sub="v pořadí" />
        </div>

        {/* Roster preview — zjednodušený na 3 sloupce (avatar+info /
            status / age), payment badge se sloučil do „info" jako
            mini colored dot */}
        <div className="mt-3 overflow-hidden rounded-sm border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-2 py-1">
            <p className="mono-tag text-[6px] text-ink-500">
              Roster · 27 účastníků
            </p>
            <span className="text-[6px] text-ink-500">
              Nejnovější ↓
            </span>
          </div>
          <div>
            <RosterRow
              initials="MN"
              name="Marta Nová"
              email="marta.nova@example.cz"
              status="yes"
              paid
              age="12 min"
            />
            <RosterRow
              initials="JV"
              name="Jan Veselý"
              email="jvesely@gmail.com"
              status="yes"
              age="1 h"
            />
            <RosterRow
              initials="LK"
              name="Lucie Kadlecová"
              email="lucka@outlook.com"
              status="pending"
              age="dnes"
            />
            <RosterRow
              initials="DP"
              name="David Procházka"
              email="d.prochazka@example.cz"
              status="yes"
              paid
              age="včera"
            />
            <RosterRow
              initials="TT"
              name="Tereza Tichá"
              email="t.ticha@example.cz"
              status="waitlist"
              age="2 dny"
              last
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  active,
  warning,
}: {
  label: string;
  value: string;
  sub: string;
  active?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-sm border p-1.5 ${
        active
          ? "border-brand bg-brand-soft/40"
          : warning
            ? "border-warning/40 bg-warning/5"
            : "border-border bg-surface"
      }`}
    >
      <p className="mono-tag text-[6px] text-ink-500">{label}</p>
      <p
        className={`text-[11px] font-semibold leading-none tracking-tight tabular-nums ${
          warning ? "text-warning" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[6px] text-ink-500">{sub}</p>
    </div>
  );
}

function RosterRow({
  initials,
  name,
  email,
  status,
  paid,
  age,
  last,
}: {
  initials: string;
  name: string;
  email: string;
  status: "yes" | "pending" | "waitlist";
  paid?: boolean;
  age: string;
  last?: boolean;
}) {
  const statusLabel: Record<typeof status, string> = {
    yes: "Potvrzeno",
    pending: "Čeká",
    waitlist: "Waitlist",
  };
  const statusClass: Record<typeof status, string> = {
    yes: "border-success/40 bg-success/5 text-success",
    pending: "border-warning/40 bg-warning/5 text-warning",
    waitlist: "border-ink-300 bg-surface-muted text-ink-700",
  };
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[7px] font-semibold text-canvas">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[8px] font-medium text-ink-900">
            {name}
          </p>
          {paid && (
            <span
              aria-label="Zaplaceno"
              className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success"
            />
          )}
        </div>
        <p className="truncate text-[6px] text-ink-500">{email}</p>
      </div>
      <span
        className={`inline-flex flex-shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-[6px] font-medium ${statusClass[status]}`}
      >
        {statusLabel[status]}
      </span>
      <span className="w-10 flex-shrink-0 text-right text-[6px] text-ink-500">
        {age}
      </span>
    </div>
  );
}
