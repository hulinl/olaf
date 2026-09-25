/**
 * Replica of `/tvurce/akce/<ws>/<slug>` cockpit view — H1 s meta pill
 * toolbarem, StatTiles (Přihlášeno / Čeká / Neplaceno / Waitlist),
 * roster preview table. Match reálné app UI (sharp corners per OA
 * design DNA), aby marketing landing vypadal jako screenshot appky,
 * ne jako toy mockup.
 *
 * Použití: uvnitř <LaptopFrame> (dodá bezel + camera + hinge).
 * Pokud chceš přidat browser barr, wrapni <BrowserBar url="…" />
 * jako první child v LaptopFrame.
 *
 * Dimenze uvnitř screenu jsou v `text-[Xpx]` škále, aby to při
 * shrinku (mockup je typicky 500-700px wide) vypadalo proporcionálně
 * — reálná aplikace používá text-sm/base, tady používáme 6-11px, což
 * simuluje že se díváme na plochu 1280×800 zmenšenou na 500px šířky.
 */
export function AdminCockpitScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar — logo + nav */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-ink-900 text-[7px] font-bold text-canvas">
            o
          </span>
          <span className="text-[9px] font-medium text-ink-500">
            olaf · Tvůrce · Akce · Spring Camp Beskydy
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="mono-tag text-[7px] text-ink-500">TVŮRCE</span>
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[7px] font-semibold text-canvas">
            O
          </span>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="flex-1 overflow-hidden px-6 py-5">
        {/* Back link */}
        <p className="text-[8px] text-ink-500">← Všechny akce</p>

        {/* H1 + subtitle */}
        <div className="mt-1 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold leading-tight tracking-tight text-ink-900">
              Spring Camp Beskydy
            </h1>
            <p className="mt-0.5 text-[9px] text-ink-500">
              16.–19. května 2026 · Rožnov pod Radhoštěm
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-[7px] font-medium text-ink-700">
            <span className="inline-block h-1 w-1 rounded-full bg-success" />
            Publikováno
          </span>
        </div>

        {/* Pill toolbar */}
        <div className="mt-3 flex flex-wrap gap-1">
          {["Upravit akci", "Obsah", "Dokumenty", "Kalkulace", "Veřejný náhled"].map(
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

        {/* Stat Tiles */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatTile label="Přihlášeno" value="27 / 30" sub="celkem 28 (s org.)" active />
          <StatTile label="Čeká" value="2" sub="pending approval" warning />
          <StatTile label="Neplaceno" value="5" sub="čeká na platbu" />
          <StatTile label="Waitlist" value="4" sub="pořadí připraveno" />
        </div>

        {/* Roster preview */}
        <div className="mt-4 overflow-hidden rounded-sm border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-2 py-1">
            <p className="text-[7px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              Roster · 27 účastníků
            </p>
            <div className="flex items-center gap-1">
              <span className="text-[7px] text-ink-500">Řadit:</span>
              <span className="text-[7px] font-medium text-ink-700">Nejnovější ↓</span>
            </div>
          </div>
          <div>
            <RosterRow
              initials="MN"
              name="Marta Nová"
              email="marta.nova@example.cz"
              status="yes"
              payment="paid"
              age="před 12 min"
            />
            <RosterRow
              initials="JV"
              name="Jan Veselý"
              email="jvesely@gmail.com"
              status="yes"
              payment="pending"
              age="před 1 h"
            />
            <RosterRow
              initials="LK"
              name="Lucie Kadlecová"
              email="lucka@outlook.com"
              status="pending"
              payment="—"
              age="dnes"
            />
            <RosterRow
              initials="DP"
              name="David Procházka"
              email="d.prochazka@example.cz"
              status="yes"
              payment="paid"
              age="včera"
            />
            <RosterRow
              initials="TT"
              name="Tereza Tichá"
              email="t.ticha@example.cz"
              status="waitlist"
              payment="—"
              age="před 2 dny"
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
      className={`flex flex-col gap-1 rounded-sm border p-2 ${
        active
          ? "border-brand bg-brand-soft/40"
          : warning
            ? "border-warning/40 bg-warning/5"
            : "border-border bg-surface"
      }`}
    >
      <p className="mono-tag text-[6px] text-ink-500">{label}</p>
      <p
        className={`text-[16px] font-semibold leading-none tracking-tight tabular-nums ${
          warning ? "text-warning" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      <p className="text-[6px] text-ink-500">{sub}</p>
    </div>
  );
}

function RosterRow({
  initials,
  name,
  email,
  status,
  payment,
  age,
  last,
}: {
  initials: string;
  name: string;
  email: string;
  status: "yes" | "pending" | "waitlist";
  payment: "paid" | "pending" | "—";
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
  const paymentClass = payment === "paid"
    ? "text-success"
    : payment === "pending"
      ? "text-warning"
      : "text-ink-500";
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
        <p className="truncate text-[8px] font-medium text-ink-900">{name}</p>
        <p className="truncate text-[6px] text-ink-500">{email}</p>
      </div>
      <span
        className={`inline-flex items-center rounded-sm border px-1 py-0.5 text-[6px] font-medium ${statusClass[status]}`}
      >
        {statusLabel[status]}
      </span>
      <span className={`w-10 text-right text-[6px] font-medium ${paymentClass}`}>
        {payment === "paid" ? "Zaplaceno" : payment === "pending" ? "Čeká" : "—"}
      </span>
      <span className="w-12 text-right text-[6px] text-ink-500">{age}</span>
    </div>
  );
}
