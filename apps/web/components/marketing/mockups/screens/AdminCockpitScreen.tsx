/**
 * Replica of `/tvurce/akce/<ws>/<slug>` cockpit — H1 s meta pill
 * toolbarem, StatTiles, roster preview.
 *
 * Font sizing: relative `em` jednotky navázané na
 * `.chrome-laptop-screen { font-size: 1.5cqi }` v globals.css. Text
 * škáluje s frame width: na 500 px = 7.5 px base, na 340 px = 5.1 px
 * base, na 700 px (hero) = 10.5 px base. Používáme inline `style`
 * s em hodnotami, Tailwind arbitrary values pro em nemají spolehlivou
 * podporu v atomic build path.
 */
type Em = string;
const FS = {
  h1: "1.7em",
  sub: "0.85em",
  pill: "0.8em",
  eyebrow: "0.75em",
  stat: "1.5em",
  body: "0.9em",
  tiny: "0.72em",
} satisfies Record<string, Em>;

export function AdminCockpitScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar */}
      <div
        className="flex items-center justify-between border-b border-border px-4 py-1.5"
        style={{ fontSize: FS.eyebrow }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-sm bg-ink-900 font-bold text-canvas"
            style={{ width: "1.7em", height: "1.7em", fontSize: "0.8em" }}
          >
            o
          </span>
          <span className="truncate font-medium text-ink-500">
            Tvůrce · Spring Camp Beskydy
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span className="mono-tag text-ink-500" style={{ fontSize: "0.75em" }}>
            TVŮRCE
          </span>
          <span
            className="inline-flex items-center justify-center rounded-full bg-ink-900 font-semibold text-canvas"
            style={{ width: "1.7em", height: "1.7em", fontSize: "0.8em" }}
          >
            O
          </span>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="flex-1 overflow-hidden px-5 py-3.5">
        {/* Back link */}
        <p className="text-ink-500" style={{ fontSize: FS.tiny }}>
          ← Všechny akce
        </p>

        {/* H1 + subtitle + published badge */}
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="truncate font-semibold leading-tight tracking-tight text-ink-900"
              style={{ fontSize: FS.h1 }}
            >
              Spring Camp Beskydy
            </h1>
            <p
              className="mt-0.5 text-ink-500"
              style={{ fontSize: FS.sub }}
            >
              16.–19. května 2026 · Rožnov pod Radhoštěm
            </p>
          </div>
          <span
            className="mono-tag inline-flex flex-shrink-0 items-center gap-1 rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 font-medium text-ink-700"
            style={{ fontSize: "0.72em" }}
          >
            <span
              className="inline-block rounded-full bg-success"
              style={{ width: "0.45em", height: "0.45em" }}
            />
            Publikováno
          </span>
        </div>

        {/* Pill toolbar — 3 hlavní akce */}
        <div className="mt-3 flex flex-wrap gap-1" style={{ fontSize: FS.pill }}>
          {["Upravit akci", "Obsah", "Dokumenty"].map((label, i) => (
            <span
              key={label}
              className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-medium ${
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

        {/* Roster preview */}
        <div className="mt-3 overflow-hidden rounded-sm border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-2 py-1">
            <p className="mono-tag text-ink-500" style={{ fontSize: "0.7em" }}>
              Roster · 27 účastníků
            </p>
            <span className="text-ink-500" style={{ fontSize: FS.tiny }}>
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
      <p className="mono-tag text-ink-500" style={{ fontSize: "0.7em" }}>
        {label}
      </p>
      <p
        className={`font-semibold leading-none tracking-tight tabular-nums ${
          warning ? "text-warning" : "text-ink-900"
        }`}
        style={{ fontSize: FS.stat }}
      >
        {value}
      </p>
      <p className="text-ink-500" style={{ fontSize: FS.tiny }}>
        {sub}
      </p>
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
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink-900 font-semibold text-canvas"
        style={{ width: "1.7em", height: "1.7em", fontSize: "0.9em" }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className="truncate font-medium text-ink-900"
            style={{ fontSize: FS.body }}
          >
            {name}
          </p>
          {paid && (
            <span
              aria-label="Zaplaceno"
              className="inline-block flex-shrink-0 rounded-full bg-success"
              style={{ width: "0.5em", height: "0.5em" }}
            />
          )}
        </div>
        <p className="truncate text-ink-500" style={{ fontSize: FS.tiny }}>
          {email}
        </p>
      </div>
      <span
        className={`mono-tag inline-flex flex-shrink-0 items-center rounded-sm border px-1.5 py-0.5 font-medium ${statusClass[status]}`}
        style={{ fontSize: "0.7em" }}
      >
        {statusLabel[status]}
      </span>
      <span
        className="w-10 flex-shrink-0 text-right text-ink-500"
        style={{ fontSize: FS.tiny }}
      >
        {age}
      </span>
    </div>
  );
}
