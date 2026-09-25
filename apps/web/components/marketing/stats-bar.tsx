/**
 * Proof-points řádek mezi hero a feature tour. Ne živá čísla —
 * kvalitativní ukazatele, které Olaf verifikoval jako pravdivé
 * (multi-day akce, QR platba, PWA push, GDPR-native). Když
 * čísla později budou live, přepíše se to na fetch z backendu.
 */
export function StatsBar() {
  return (
    <section aria-label="Klíčové vlastnosti" className="border-y border-border bg-surface-muted">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4 sm:gap-8 sm:py-12">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            data-reveal
            style={{ ["--reveal-delay" as string]: `${i * 80}ms` }}
            className="flex flex-col"
          >
            <p className="text-3xl font-semibold leading-none tracking-tight text-ink-900 sm:text-4xl">
              {s.value}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              {s.label}
            </p>
            <p className="mt-1 text-sm leading-snug text-ink-500">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STATS: { value: string; label: string; body: string }[] = [
  {
    value: "9+",
    label: "Typů bloků",
    body: "Skládáš landing z hero, programu, mapy, FAQ, galerie a dalších.",
  },
  {
    value: "QR",
    label: "Platba",
    body: "Česká QR Platba se stabilním VS, faktura PDF v jednom kroku.",
  },
  {
    value: "PWA",
    label: "Mobil",
    body: "Přidej si olaf na plochu, push notifikace o dění na akcích.",
  },
  {
    value: "GDPR",
    label: "Data v EU",
    body: "Vše hostované v Evropě, audit log, soft-delete s 30denní retencí.",
  },
];
