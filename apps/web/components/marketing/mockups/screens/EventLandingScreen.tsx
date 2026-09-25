/**
 * Replica of public event landing `/{ws}/e/{event}`. Cover s topo
 * pattern gradient (simuluje mountain photograph), sticky-style header,
 * hero H1 „Spring Camp Beskydy", meta pills, amber CTA + count, první
 * prose blok pod tím.
 *
 * Použití: uvnitř <PhoneFrame> (portrait) nebo <LaptopFrame> (široký).
 * Autotický přizpůsobí layout přes aspect frame — obsah scrolluje z
 * top-down.
 */
export function EventLandingScreen() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* Cover — ~50% výšky obrazovky, topo pattern + tmavý gradient */}
      <div className="relative h-[52%] flex-shrink-0 overflow-hidden bg-ink-900">
        {/* Simulace mountain photo: dark canvas + topo pattern amber */}
        <div className="absolute inset-0 topo-bg-amber opacity-70" aria-hidden />
        {/* Sunrise glow subtle top-left */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,199,25,0.35) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        {/* Progresivní darkening gradient bottom → čitelnost H1 */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.9) 100%)",
          }}
        />
        {/* Sticky-style header uvnitř coveru */}
        <div className="relative flex items-center justify-between px-4 pt-3">
          <span className="mono-tag text-[7px] text-canvas/85">OLAF ADVENTURES</span>
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-canvas/40 text-[8px] text-canvas/85">
            ↗
          </span>
        </div>

        {/* Content zóna dole u coveru */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
          <span className="inline-flex items-center rounded-sm bg-brand px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-brand-ink">
            Posledních 6 míst
          </span>
          <h1
            className="mt-2 text-[18px] font-semibold leading-[1.05] tracking-tight text-canvas text-shadow-strong"
          >
            Spring Camp Beskydy
          </h1>
          <p className="mt-1 text-[8px] text-canvas/85">
            16. – 19. května 2026 · Rožnov pod Radhoštěm
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center rounded-sm bg-brand px-2.5 py-1 text-[8px] font-semibold text-brand-ink">
              Přihlásit se
            </span>
            <span className="text-[7px] text-canvas/85">18 / 24 přihlášeno</span>
          </div>
        </div>
      </div>

      {/* Prose block pod coverem — začátek popisu */}
      <div className="flex-1 overflow-hidden px-4 py-4">
        <p className="mono-tag text-[6px] text-brand">01 · O AKCI</p>
        <h2 className="mt-1 text-[11px] font-semibold leading-tight text-ink-900">
          Čtyři dny v horách, kde <span className="text-amber-glow">začíná dobrodružství</span>.
        </h2>
        <p className="mt-1.5 text-[7px] leading-[1.55] text-ink-700">
          Klasický jarní kemp — noční přechod, hřeben, traverz Lysé hory,
          spaní v Bumbálce, snídaně v panství. Chytneš druhý dech.
        </p>
        {/* Meta tiles — Kdy / Kde / Kdo */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            { label: "Kdy", value: "16.–19. 5." },
            { label: "Kde", value: "Beskydy" },
            { label: "Cena", value: "1 800 Kč" },
          ].map((tile) => (
            <div
              key={tile.label}
              className="rounded-sm border border-border bg-surface p-1.5"
            >
              <p className="mono-tag text-[5px] text-ink-500">{tile.label}</p>
              <p className="mt-0.5 text-[9px] font-semibold text-ink-900">
                {tile.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
