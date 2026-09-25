/**
 * Replica of workspace profile `/{workspace}` — cover s logem, název
 * komunity, join CTA, upcoming events grid. Match OLAF Adventures live
 * layout, aby marketing landing věrně ukazoval reálný workspace.
 *
 * Použití: v LaptopFrame (široký layout — logo vlevo, socials/join vpravo).
 */
export function WorkspaceProfileScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-ink-900 text-[7px] font-bold text-canvas">
            o
          </span>
          <span className="text-[9px] font-medium text-ink-500">olaf · komunita</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[7px] font-medium text-ink-700">Přihlásit se</span>
        </div>
      </div>

      {/* Hero cover */}
      <div className="relative h-[45%] flex-shrink-0 overflow-hidden bg-ink-900">
        <div className="absolute inset-0 topo-bg-amber opacity-60" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute right-8 top-4 h-40 w-40 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,199,25,0.32) 0%, transparent 65%)",
            filter: "blur(28px)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.85) 100%)",
          }}
        />

        {/* Cover content — logo circle + název + socials/join */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 px-6 pb-5">
          <div className="flex items-end gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-canvas bg-canvas shadow-md">
              <span className="text-[16px] font-bold text-ink-900">O</span>
            </div>
            <div>
              <h1 className="text-[18px] font-semibold leading-tight tracking-tight text-canvas text-shadow-strong">
                Olaf Adventures
              </h1>
              <p className="mt-0.5 text-[8px] text-canvas/85">
                Rožnov · Beskydy · outdoor komunita
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-canvas/70">142 členů</span>
            <span className="inline-flex items-center rounded-sm bg-brand px-2 py-1 text-[8px] font-semibold text-brand-ink">
              Přidej se →
            </span>
          </div>
        </div>
      </div>

      {/* Bio + section head */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        <p className="max-w-md text-[8px] leading-[1.55] text-ink-700">
          Parta lidí, kterou baví hory a společný pohyb. Kempy, víkendovky
          a tréninky přes celý rok — pro každého, kdo si chce vyrazit.
        </p>

        <div className="mt-4 flex items-baseline justify-between border-b border-border pb-2">
          <p className="mono-tag text-[7px] text-ink-500">Nadcházející akce</p>
          <span className="text-[7px] text-ink-500">Ukázat vše →</span>
        </div>

        {/* Events grid */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <EventCard
            eyebrow="16. – 19. 5."
            title="Spring Camp Beskydy"
            meta="18 / 24 · 1 800 Kč"
          />
          <EventCard
            eyebrow="6. – 8. 6."
            title="Ferrata Slovakia weekend"
            meta="12 / 15 · 2 400 Kč"
          />
          <EventCard
            eyebrow="12. 6."
            title="Trailový trénink Lysá"
            meta="8 / 20 · zdarma"
          />
        </div>
      </div>
    </div>
  );
}

function EventCard({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-sm bg-ink-900 p-2 text-canvas">
      <div
        aria-hidden
        className="absolute inset-0 topo-bg-amber opacity-45"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.85) 100%)",
        }}
      />
      <p className="relative mono-tag text-[6px] text-canvas/85">{eyebrow}</p>
      <p className="relative mt-1 text-[9px] font-semibold leading-tight text-canvas">
        {title}
      </p>
      <p className="relative mt-1 text-[6px] text-canvas/80">{meta}</p>
    </div>
  );
}
