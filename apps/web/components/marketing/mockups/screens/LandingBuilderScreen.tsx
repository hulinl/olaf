/**
 * Replica of `/tvurce/akce/<ws>/<slug>/edit/obsah` — block editor pro
 * public landing akce. Split view: block list panel vlevo, preview
 * canvas vpravo. Match reálné app UI aby marketing landing věrně
 * ukazoval landing builder feature.
 */
export function LandingBuilderScreen() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink-900">
      {/* App shell topbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-ink-900 text-[7px] font-bold text-canvas">
            o
          </span>
          <span className="text-[9px] font-medium text-ink-500">
            Tvůrce · Spring Camp Beskydy · Obsah
          </span>
        </div>
        <span className="inline-flex items-center rounded-sm bg-brand px-2 py-0.5 text-[7px] font-semibold text-brand-ink">
          Uložit změny
        </span>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Block list — left rail */}
        <div className="w-[38%] flex-shrink-0 overflow-hidden border-r border-border bg-surface-muted/60 p-2">
          <p className="mockup-mono mb-2 text-[6px] text-ink-500">
            Bloky · přetáhni
          </p>
          <div className="flex flex-col gap-1">
            <BlockRow icon="H" label="Hero" active />
            <BlockRow icon="¶" label="Prose · O akci" />
            <BlockRow icon="≡" label="Program · 4 dny" />
            <BlockRow icon="◈" label="Meta tiles" />
            <BlockRow icon="⚑" label="Mapa · Rožnov" />
            <BlockRow icon="◱" label="Gallery · 6 fotek" />
            <BlockRow icon="?" label="FAQ · 5 otázek" />
            <BlockRow icon="+" label="+ přidat blok" ghost />
          </div>
        </div>

        {/* Preview canvas — right */}
        <div className="flex-1 overflow-hidden bg-canvas">
          <div className="mx-auto flex h-full max-w-md flex-col">
            {/* Preview: hero blok — mini EventLanding */}
            <div className="relative h-[52%] flex-shrink-0 overflow-hidden bg-ink-900">
              <div
                aria-hidden
                className="absolute inset-0 topo-bg-amber opacity-55"
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.85) 100%)",
                }}
              />
              <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                <span className="mockup-mono inline-flex rounded-sm bg-brand px-1.5 py-0.5 text-[6px] text-brand-ink">
                  16.–19. 5.
                </span>
                <p className="mt-1.5 text-[10px] font-semibold leading-tight text-canvas">
                  Spring Camp Beskydy
                </p>
              </div>
              {/* Edit chip */}
              <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border border-brand bg-brand/90 px-1.5 py-0.5 text-[6px] font-semibold text-brand-ink">
                <span aria-hidden>✎</span>
                Upravit hero
              </div>
            </div>

            {/* Preview: prose block s edit chip */}
            <div className="relative border-b border-border px-3 py-3">
              <p className="mockup-mono text-[6px] text-brand">01 · O AKCI</p>
              <p className="mt-1 text-[9px] font-semibold text-ink-900">
                Čtyři dny v horách
              </p>
              <p className="mt-1 text-[6px] leading-[1.55] text-ink-700">
                Klasický jarní kemp — noční přechod, hřeben, traverz…
              </p>
              <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border border-border bg-canvas px-1 py-0.5 text-[6px] text-ink-700">
                <span aria-hidden>✎</span>
                Upravit
              </div>
            </div>

            {/* Preview: program bloky (mini) */}
            <div className="relative px-3 py-2">
              <p className="mockup-mono text-[6px] text-brand">02 · PROGRAM</p>
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-muted px-1.5 py-1 text-[7px]">
                  <span className="inline-flex h-3 w-3 items-center justify-center rounded-sm bg-brand-soft text-[6px] font-bold text-ink-900">
                    Pá
                  </span>
                  <span className="text-ink-900">Sraz + noční přechod</span>
                </div>
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-muted px-1.5 py-1 text-[7px]">
                  <span className="inline-flex h-3 w-3 items-center justify-center rounded-sm bg-brand-soft text-[6px] font-bold text-ink-900">
                    So
                  </span>
                  <span className="text-ink-900">Radhošť → Pustevny</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockRow({
  icon,
  label,
  active,
  ghost,
}: {
  icon: string;
  label: string;
  active?: boolean;
  ghost?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-sm px-1.5 py-1 text-[7px] ${
        active
          ? "border border-brand bg-brand-soft/40 text-ink-900"
          : ghost
            ? "border border-dashed border-border text-ink-500"
            : "border border-border bg-canvas text-ink-700"
      }`}
    >
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[7px] font-semibold ${
          active
            ? "bg-brand text-brand-ink"
            : ghost
              ? "text-ink-500"
              : "bg-surface-muted text-ink-700"
        }`}
      >
        {icon}
      </span>
      <span className={active ? "font-medium" : ""}>{label}</span>
      {!ghost && (
        <span className="ml-auto text-[6px] text-ink-500" aria-hidden>
          ⋮⋮
        </span>
      )}
    </div>
  );
}
