/**
 * Replica of public event landing `/{ws}/e/{event}`. Cover s topo
 * pattern gradient (simuluje mountain photograph), sticky-style header,
 * hero H1, meta pill + amber CTA, prose blok pod tím.
 *
 * Použije se v PhoneFrame (mobilní pohled) i LaptopFrame (široký).
 * Sizing přizpůsobený tak, aby na PhoneFrame ~128 px šířky texty
 * seděly čitelně a nekřížily se.
 */
export function EventLandingScreen() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* Cover — ~46% výšky obrazovky, topo pattern + tmavý gradient */}
      <div className="relative h-[46%] flex-shrink-0 overflow-hidden bg-ink-900">
        <div className="absolute inset-0 topo-bg-amber opacity-70" aria-hidden />
        {/* Sunrise glow subtle top-left */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-4 -top-4 h-20 w-20 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,199,25,0.35) 0%, transparent 70%)",
            filter: "blur(14px)",
          }}
        />
        {/* Progresivní darkening gradient bottom → čitelnost H1 */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.9) 100%)",
          }}
        />
        {/* Sticky-style header uvnitř coveru */}
        <div className="relative flex items-center justify-between px-3 pt-2">
          <span className="mono-tag text-[6px] text-canvas/85">
            OLAF ADVENTURES
          </span>
          <span className="text-[7px] text-canvas/85">↗</span>
        </div>

        {/* Content zóna dole u coveru — kompaktní stack, žádný overflow */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-3 pb-2.5">
          <span className="mono-tag inline-flex w-fit items-center rounded-sm bg-brand px-1.5 py-0.5 text-[6px] text-brand-ink">
            Posledních 6 míst
          </span>
          <h1 className="text-[11px] font-semibold leading-[1.1] tracking-tight text-canvas text-shadow-strong">
            Spring Camp Beskydy
          </h1>
          <p className="text-[7px] leading-tight text-canvas/85">
            16.–19. 5. · Rožnov · 18/24
          </p>
          <span className="mt-1 inline-flex w-fit items-center rounded-sm bg-brand px-2 py-0.5 text-[7px] font-semibold text-brand-ink">
            Přihlásit se →
          </span>
        </div>
      </div>

      {/* Prose block pod coverem — začátek popisu */}
      <div className="flex-1 overflow-hidden px-3 py-3">
        <p className="mono-tag text-[5px] text-brand">01 · O AKCI</p>
        <h2 className="mt-1 text-[9px] font-semibold leading-tight text-ink-900">
          Čtyři dny v horách, kde{" "}
          <span className="text-amber-glow">začíná dobrodružství</span>
        </h2>
        <p className="mt-1.5 text-[6.5px] leading-[1.55] text-ink-700">
          Klasický jarní kemp — noční přechod, hřeben, traverz Lysé hory,
          spaní v Bumbálce.
        </p>
        {/* Meta tiles — Kdy / Kde / Kdo */}
        <div className="mt-2.5 grid grid-cols-3 gap-1">
          {[
            { label: "Kdy", value: "16.–19. 5." },
            { label: "Kde", value: "Beskydy" },
            { label: "Cena", value: "1 800 Kč" },
          ].map((tile) => (
            <div
              key={tile.label}
              className="rounded-sm border border-border bg-surface p-1"
            >
              <p className="mono-tag text-[4.5px] text-ink-500">{tile.label}</p>
              <p className="mt-0.5 text-[7px] font-semibold leading-tight text-ink-900">
                {tile.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
