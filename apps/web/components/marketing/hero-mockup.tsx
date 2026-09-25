"use client";

/**
 * HTML-only mockup „telefonu s otevřenou akcí" v hero. Bez PNG,
 * bez SVG frame — všechno je JSX + Tailwind, což znamená:
 *
 *  - žádné regrese když se změní design tokens (barvy, radii, fonty)
 *  - žádný downscale / retina blur
 *  - obsah reaguje na CZ locale bez rebuildu obrázku
 *
 * Floating cards vedle telefonu bobají skrz `.animate-float` z
 * globals.css se staggerovaným `animation-delay`.
 *
 * Ne-interaktivní — jen dekorativní prezentace. Fake data zámerně
 * ne-výmyslné (Beskyd Camp), aby uživatel viděl reálný typ akce.
 */
export function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      {/* Ambient amber blob za mockupem — zvýrazní frame na canvase */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 animate-drift-a rounded-[50%] bg-brand/25 blur-3xl"
      />

      {/* „Telefon" frame — rounded, subtilní outline + hluboký stín */}
      <div
        className="animate-float relative overflow-hidden rounded-[36px] border border-ink-900/10 bg-canvas shadow-[0_40px_80px_-24px_rgba(0,0,0,0.35)]"
        style={{ animationDelay: "0ms" }}
      >
        {/* Notch */}
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-4 w-24 rounded-full bg-ink-900" />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-5 pb-1 text-[10px] font-medium text-ink-700">
          <span>9:41</span>
          <span className="tracking-tighter">••• 5G ▮</span>
        </div>

        {/* Cover — amber sunrise gradient + hory silueta */}
        <div className="relative h-32 overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, #ffe084 0%, #ffc719 55%, #ffb800 100%)",
            }}
          />
          {/* Slunce */}
          <div
            aria-hidden
            className="absolute left-1/2 top-6 h-16 w-16 -translate-x-1/2 rounded-full bg-white/40 blur-md"
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-8 h-10 w-10 -translate-x-1/2 rounded-full bg-white/80"
          />
          {/* Hory silueta — jednoduchý SVG polygon */}
          <svg
            aria-hidden
            viewBox="0 0 380 60"
            className="absolute inset-x-0 bottom-0 h-14 w-full"
            preserveAspectRatio="none"
          >
            <polygon
              points="0,60 60,25 110,45 170,10 230,35 290,20 340,40 380,25 380,60"
              fill="rgba(0,0,0,0.75)"
            />
          </svg>
          {/* Title na coveru */}
          <div className="absolute bottom-2 left-4 right-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/80">
              Beskydy · Kemp
            </p>
            <p className="mt-0.5 text-base font-semibold leading-tight text-white">
              Spring Camp Beskydy
            </p>
          </div>
        </div>

        {/* Metadata pod coverem */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 text-[11px] text-ink-700">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>📅</span>
            <span className="font-medium">16.–19. května</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>👥</span>
            <span className="font-medium">18 / 24</span>
          </span>
        </div>

        {/* Program preview — 4 dny */}
        <div className="px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            Program
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <MockDay day="Pá" title="Sraz + noční přechod" />
            <MockDay day="So" title="Radhošť → Pustevny" />
            <MockDay day="Ne" title="Lysá hora traverz" />
            <MockDay day="Po" title="Snídaně + odjezd" />
          </div>
        </div>

        {/* CTA pill */}
        <div className="px-4 pb-4 pt-1">
          <div className="flex h-9 items-center justify-center rounded-md bg-brand text-[12px] font-semibold text-brand-ink">
            Přihlásit se
          </div>
          <p className="mt-2 text-center text-[10px] text-ink-500">
            Zdarma · Do 30. dubna
          </p>
        </div>
      </div>

      {/* Floating card #1 — „6 nových přihlášek" */}
      <div
        className="animate-float absolute -left-6 top-24 hidden w-40 rounded-2xl border border-border bg-canvas p-3 shadow-lg sm:block"
        style={{ animationDelay: "1.2s" }}
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
          Přihlášky
        </p>
        <p className="mt-1 text-sm font-semibold leading-tight text-ink-900">
          6 nových
        </p>
        <p className="mt-1 text-[11px] text-ink-500">poslední hodinu</p>
        <div className="mt-2 flex -space-x-1.5">
          {["#f97316", "#ef4444", "#3b82f6", "#22c55e"].map((c) => (
            <span
              key={c}
              className="inline-block h-5 w-5 rounded-full border-2 border-canvas"
              style={{ background: c }}
            />
          ))}
          <span className="inline-flex h-5 items-center justify-center rounded-full border-2 border-canvas bg-ink-900 px-1.5 text-[8px] font-semibold text-white">
            +2
          </span>
        </div>
      </div>

      {/* Floating card #2 — „Platba přijata" */}
      <div
        className="animate-float absolute -right-4 bottom-24 hidden w-44 rounded-2xl border border-border bg-canvas p-3 shadow-lg sm:block"
        style={{ animationDelay: "2.4s" }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success">
            ✓
          </span>
          <p className="text-[11px] font-semibold text-ink-900">
            Platba přijata
          </p>
        </div>
        <p className="mt-2 text-[10px] text-ink-500">
          Fio import spároval podle VS
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-ink-900">
          1 800 Kč · VS 2600018
        </p>
      </div>
    </div>
  );
}

function MockDay({ day, title }: { day: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-ink-900">
        {day}
      </span>
      <span className="text-[12px] leading-tight text-ink-900">{title}</span>
    </div>
  );
}
