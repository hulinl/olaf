/**
 * Stats strip pod hero — krátká, mono-tone vyznívající "co umí" tabulka.
 * Žádné fake metriky (žádné "1000+ users") — drží se reálných
 * capability čísel, které z aplikace skutečně vidíš.
 */
export function StatsStrip() {
  const stats = [
    { value: "9+", label: "typů landing bloků" },
    { value: "6", label: "kategorií rizik (risk checklist)" },
    { value: "QR", label: "Platba + faktury PDF" },
    { value: "PWA", label: "iOS + Android push" },
  ];

  return (
    <section className="border-y border-border-strong/20 bg-surface-muted/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 md:grid-cols-4 md:py-14">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-start gap-1">
            <div
              className="font-mono text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl"
              style={{ letterSpacing: "-0.02em" }}
            >
              {s.value}
            </div>
            <div className="text-sm text-ink-500">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
