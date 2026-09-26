/**
 * Replica of workspace profile `/{workspace}` — cover s logem, název
 * komunity, join CTA, upcoming events grid. Rozlayoutované tak, aby
 * na LaptopFrame ~500 px šířky texty seděly bez overlapu.
 */
export function WorkspaceProfileScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-ink-900 text-[6px] font-bold text-canvas">
            o
          </span>
          <span className="text-[8px] font-medium text-ink-500">
            olaf · komunita
          </span>
        </div>
        <span className="text-[7px] font-medium text-ink-700">
          Přihlásit se
        </span>
      </div>

      {/* Hero cover */}
      <div className="relative h-[40%] flex-shrink-0 overflow-hidden bg-ink-900">
        <div className="absolute inset-0 topo-bg-amber opacity-60" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-3 h-28 w-28 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,199,25,0.32) 0%, transparent 65%)",
            filter: "blur(18px)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.85) 100%)",
          }}
        />

        {/* Cover content — logo circle + název (vlevo), members+join
            (vpravo, jen na md+ frame širších). Sizing kompaktní. */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-3">
          <div className="flex min-w-0 items-end gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-canvas bg-canvas shadow-md">
              <span className="text-[12px] font-bold text-ink-900">O</span>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[13px] font-semibold leading-tight tracking-tight text-canvas text-shadow-strong">
                Olaf Adventures
              </h1>
              <p className="mt-0.5 text-[6.5px] text-canvas/85">
                Rožnov · Beskydy · outdoor komunita
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span className="text-[6.5px] text-canvas/70">142 členů</span>
            <span className="inline-flex items-center rounded-sm bg-brand px-1.5 py-0.5 text-[7px] font-semibold text-brand-ink">
              Přidej se
            </span>
          </div>
        </div>
      </div>

      {/* Bio + section head */}
      <div className="flex-1 overflow-hidden px-4 py-3">
        <p className="max-w-md text-[7px] leading-[1.55] text-ink-700">
          Parta lidí, kterou baví hory a společný pohyb. Kempy, víkendovky
          a tréninky přes celý rok.
        </p>

        <div className="mt-3 flex items-baseline justify-between border-b border-border pb-1.5">
          <p className="mono-tag text-[6px] text-ink-500">Nadcházející akce</p>
          <span className="text-[6px] text-ink-500">Ukázat vše →</span>
        </div>

        {/* Events grid */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <EventCard
            eyebrow="16.–19. 5."
            title="Spring Camp Beskydy"
            meta="18/24 · 1 800 Kč"
          />
          <EventCard
            eyebrow="6.–8. 6."
            title="Ferrata Slovakia"
            meta="12/15 · 2 400 Kč"
          />
          <EventCard
            eyebrow="12. 6."
            title="Trail Lysá hora"
            meta="8/20 · zdarma"
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
    <div className="relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-sm bg-ink-900 p-1.5 text-canvas">
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
      <p className="relative mono-tag text-[5px] text-canvas/85">{eyebrow}</p>
      <p className="relative mt-0.5 text-[7.5px] font-semibold leading-tight text-canvas">
        {title}
      </p>
      <p className="relative mt-0.5 text-[5px] text-canvas/80">{meta}</p>
    </div>
  );
}
