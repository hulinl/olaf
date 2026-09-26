"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ApiError, auth, type User } from "@/lib/api";
import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  races,
  type Race,
  type RaceFilters,
  type RacePlanStatus,
  type RaceRegion,
} from "@/lib/races";

// Cyklus statusů pro click-to-cycle interakci. Pořadí odpovídá
// user journey: zájem → přípravy → potvrzeno → (waitlist / hotovo).
const STATUS_CYCLE: RacePlanStatus[] = [
  "interested",
  "waiting_registration",
  "registered",
  "waitlist",
  "completed",
];

/**
 * Ultra kalendář client — 1:1 replika layoutu z reference HTML.
 * Změny 2026-09-27:
 * - PL a SK rozdělené na dva samostatné regiony (dřív společný SKPL)
 * - Month + year chip rows nahrazené date range pickers (od-do)
 * - Star column přesunutý z prvního na poslední (aby lícoval s pravou
 *   hranou — user preference)
 * - Mobile: filter section je collapsible (defaultně sbalený), nový
 *   RaceCard layout s velkou touch-friendly star + čistým flex
 *   layoutem místo CSS table-row transformace přes data-l ::before
 */

type SortKey = "date" | "distance" | "elevation" | "steep" | "name";
type SortDir = "asc" | "desc";

const REGION_FILTERS: { value: RaceRegion; label: string; color: string }[] = [
  { value: "CZ", label: "Česko", color: "#c8102e" },
  { value: "SK", label: "Slovensko", color: "#1f8a4c" },
  { value: "PL", label: "Polsko", color: "#7b3fa6" },
  { value: "ALP", label: "Alpy", color: "#1d5fbf" },
  { value: "IBE", label: "Ibérie", color: "#e0671b" },
  { value: "BAL", label: "Balkán", color: "#8a5a2b" },
  { value: "SEV", label: "Sever", color: "#0a5f8a" },
  { value: "OST", label: "Ostrovy", color: "#e8b100" },
  { value: "SVET", label: "Svět", color: "#15231d" },
];

const LENGTH_PRESETS = [
  { label: "40+", min: 40, max: undefined },
  { label: "80+", min: 80, max: undefined },
  { label: "100+", min: 100, max: undefined },
  { label: "150+", min: 150, max: undefined },
  { label: "300+", min: 300, max: undefined },
];

const SERIES_FILTERS = [
  { value: "utmb" as const, label: "UTMB" },
  { value: "wtm" as const, label: "WTM" },
  { value: "sky" as const, label: "Sky" },
  { value: "major" as const, label: "Major" },
  { value: "indep" as const, label: "Nezávislý" },
];

const REG_FILTERS = [
  { value: "open" as const, label: "Volně", code: "V" },
  { value: "lottery" as const, label: "Losování", code: "L" },
  { value: "sold_out" as const, label: "Vyprodáno", code: "S" },
  { value: "qualifier" as const, label: "Kvalifikace", code: "K" },
  { value: "closed" as const, label: "Uzavřeno", code: "K" },
  { value: "unknown" as const, label: "Nejasné", code: "Q" },
];

const REG_CODE: Record<Race["registration_status"], string> = {
  open: "V",
  lottery: "L",
  sold_out: "S",
  qualifier: "K",
  closed: "K",
  unknown: "Q",
};
const REG_LABEL: Record<Race["registration_status"], string> = {
  open: "VOLNĚ",
  lottery: "LOSOVÁNÍ",
  sold_out: "VYPRODÁNO",
  qualifier: "KVALIFIKACE",
  closed: "UZAVŘENO",
  unknown: "TBA / NEJASNÉ",
};

const SERIES_TAG_CLASS: Record<Race["series"], string> = {
  utmb: "uk-tag uk-tag-utmb",
  wtm: "uk-tag uk-tag-wtm",
  sky: "uk-tag uk-tag-sky",
  major: "uk-tag uk-tag-major",
  indep: "uk-tag",
};

const REGION_LABEL_BY_CODE: Record<string, string> = REGION_FILTERS.reduce(
  (acc, r) => ({ ...acc, [r.value]: r.label }),
  {},
);
const REGION_COLOR_BY_CODE: Record<string, string> = REGION_FILTERS.reduce(
  (acc, r) => ({ ...acc, [r.value]: r.color }),
  {},
);

const STORAGE_KEY = "olaf.kalendar.filters.v1";

export function CalendarClient() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filters persist v localStorage — uživatel po refreshi neztratí
  // sport/region/období preference. `RaceFilters` je čistý JSON,
  // takže serialize+parse bezpečné.
  const [filters, setFilters] = useState<RaceFilters>(() => {
    if (typeof window === "undefined") {
      return { sport: "trail", topOnly: true };
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as RaceFilters;
    } catch {
      /* corrupted storage — reset */
    }
    return { sport: "trail", topOnly: true };
  });
  const [regFilter, setRegFilter] = useState<Race["registration_status"] | null>(
    null,
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "date",
    dir: "asc",
  });
  const [statsMount, setStatsMount] = useState<HTMLElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Persist filters change → localStorage. Debounce není potřeba,
  // setItem je synchronní a lightweight.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* quota / private mode — fine, silent skip */
    }
  }, [filters]);

  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setStatsMount(document.getElementById("kalendar-stats"));
    const mq = window.matchMedia("(max-width: 760px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const loadRaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await races.list(filters);
      setItems(resp.results);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Načtení kalendáře selhalo.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadRaces();
  }, [loadRaces]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: Race, b: Race): number => {
      switch (sort.key) {
        case "distance":
          return dir * (a.distance_km - b.distance_km);
        case "elevation":
          return dir * ((a.elevation_m ?? 0) - (b.elevation_m ?? 0));
        case "steep":
          return dir * ((a.elevation_per_km ?? 0) - (b.elevation_per_km ?? 0));
        case "name":
          return dir * a.name.localeCompare(b.name, "cs");
        case "date":
        default:
          return dir * a.date_start.localeCompare(b.date_start);
      }
    };
    const filtered = regFilter
      ? items.filter((r) => r.registration_status === regFilter)
      : items;
    return [...filtered].sort(cmp);
  }, [items, sort, regFilter]);

  const maxSteep = useMemo(
    () => Math.max(...items.map((r) => r.elevation_per_km ?? 0), 110),
    [items],
  );

  const stats = useMemo(
    () => ({
      total: items.length,
      trail: items.filter((r) => r.sport === "trail").length,
      skialp: items.filter((r) => r.sport === "skialp").length,
      favs: items.filter((r) => r.is_favorite).length,
    }),
    [items],
  );

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.from) c += 1;
    if (filters.to) c += 1;
    if (filters.region) c += 1;
    if (filters.minKm || filters.maxKm) c += 1;
    if (filters.series) c += 1;
    if (regFilter) c += 1;
    if (filters.favOnly) c += 1;
    return c;
  }, [filters, regFilter]);

  const setFilter = (patch: Partial<RaceFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };
  const clearFilters = () => {
    setFilters({ sport: filters.sport, topOnly: filters.topOnly });
    setRegFilter(null);
  };

  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      return { key, dir: s.dir === "asc" ? "desc" : "asc" };
    });
  };

  const toggleFavorite = async (race: Race) => {
    if (!user) {
      window.location.href = "/login?next=/kalendar";
      return;
    }
    const nextOn = !race.is_favorite;
    setItems((prev) =>
      prev.map((r) =>
        r.id === race.id
          ? {
              ...r,
              is_favorite: nextOn,
              plan_status: nextOn ? "interested" : null,
            }
          : r,
      ),
    );
    try {
      if (nextOn) {
        await races.addToPlan(race.slug);
      } else {
        await races.removeFromPlan(race.slug);
      }
    } catch {
      setItems((prev) =>
        prev.map((r) =>
          r.id === race.id
            ? {
                ...r,
                is_favorite: !nextOn,
                plan_status: !nextOn ? "interested" : null,
              }
            : r,
        ),
      );
    }
  };

  /** Set explicit status z picker menu. */
  const setStatus = async (race: Race, next: RacePlanStatus) => {
    if (!user) return;
    setItems((prev) =>
      prev.map((r) =>
        r.id === race.id ? { ...r, plan_status: next } : r,
      ),
    );
    try {
      await races.updatePlan(race.slug, { status: next });
    } catch {
      setItems((prev) =>
        prev.map((r) =>
          r.id === race.id ? { ...r, plan_status: race.plan_status } : r,
        ),
      );
    }
  };

  /** Save poznámky pro race v plánu. */
  const saveNote = async (race: Race, note: string) => {
    if (!user) return;
    try {
      await races.updatePlan(race.slug, { note });
      // Note se nedrží v items state (Race interface má jen plan_status),
      // proto se optimisticky neupdatuje. Po refresh se v public plánu
      // objeví. UI drží note lokálně v NoteEditor state.
    } catch {
      /* silently fail — UI musí ukázat error state per-component */
    }
  };

  // Na mobilu se filtry defaultně zavírají; na desktopu (isMobile=false)
  // je vždy expandováno.
  const showFilters = isMobile ? filtersOpen : true;

  return (
    <>
      {statsMount &&
        createPortal(
          <>
            <StatBlock label="závodů" value={stats.total} />
            <StatBlock label="běh" value={stats.trail} />
            <StatBlock label="skialp" value={stats.skialp} />
            <StatBlock label="v plánu" value={stats.favs} />
          </>,
          statsMount,
        )}

      <section className="mx-auto w-full max-w-[1320px] px-4 pb-16">
        {/* Sticky header — search + filter toggle + sort. Na mobilu
            navíc sport toggle (běh/skialp) jako second row protože je
            to nejčastější swap. */}
        <div className="sticky top-14 z-10 -mx-4 mb-3 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Hledat závod, zemi, pohoří…"
              value={filters.q ?? ""}
              onChange={(e) => setFilter({ q: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus-ring"
              aria-label="Hledat"
            />
            {isMobile && (
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                  filtersOpen || activeFilterCount > 0
                    ? "border-ink-900 bg-ink-900 text-canvas"
                    : "border-border bg-canvas text-ink-700"
                }`}
              >
                Filtry
                {activeFilterCount > 0 && ` (${activeFilterCount})`}
              </button>
            )}
            <select
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [
                  SortKey,
                  SortDir,
                ];
                setSort({ key, dir });
              }}
              className="rounded-md border border-border bg-canvas px-2 py-2 text-sm text-ink-900 focus-ring sm:px-3"
              aria-label="Řazení"
            >
              <option value="date:asc">Termín</option>
              <option value="distance:desc">Nejdelší</option>
              <option value="elevation:desc">Nejvyšší D+</option>
              <option value="steep:desc">Nejstrmější</option>
              <option value="name:asc">A→Z</option>
            </select>
          </div>
          {isMobile && (
            <div className="mt-2 flex items-center gap-2">
              <div className="uk-mode inline-flex" role="group" aria-label="Sport">
                <button
                  type="button"
                  aria-pressed={filters.sport === "trail"}
                  onClick={() => setFilter({ sport: "trail" })}
                  style={{ fontSize: 13, padding: "5px 12px" }}
                >
                  Běh
                </button>
                <button
                  type="button"
                  aria-pressed={filters.sport === "skialp"}
                  onClick={() => setFilter({ sport: "skialp" })}
                  style={{ fontSize: 13, padding: "5px 12px" }}
                >
                  Skialp
                </button>
              </div>
              <div className="uk-mode inline-flex" role="group" aria-label="Rozsah">
                <button
                  type="button"
                  aria-pressed={filters.topOnly === true}
                  onClick={() => setFilter({ topOnly: true })}
                  style={{ fontSize: 13, padding: "5px 12px" }}
                >
                  Top
                </button>
                <button
                  type="button"
                  aria-pressed={filters.topOnly !== true}
                  onClick={() => setFilter({ topOnly: false })}
                  style={{ fontSize: 13, padding: "5px 12px" }}
                >
                  Vše
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filter section — bottom sheet na mobilu (fixed overlay slide
            up), inline card na desktopu. Prevence tělo scroll když je
            sheet otevřený — user preference i iOS bug s viewport
            resize při native keyboardu. */}
        {isMobile && filtersOpen && (
          <button
            type="button"
            aria-label="Zavřít filtry"
            onClick={() => setFiltersOpen(false)}
            className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm"
          />
        )}
        {showFilters && (
          <section
            aria-label="Filtry"
            className={
              isMobile
                ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-border bg-canvas p-4 shadow-2xl"
                : "grid gap-3 rounded-md border border-border bg-surface p-4"
            }
          >
            {isMobile && (
              <>
                {/* Grab bar handle — visual affordance na swipeable
                    bottom sheet vypadá */}
                <div
                  aria-hidden
                  className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong"
                />
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-ink-900">
                    Filtry
                    {activeFilterCount > 0 && (
                      <span className="ml-1.5 text-brand">
                        ({activeFilterCount})
                      </span>
                    )}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    aria-label="Zavřít"
                    className="rounded-md p-1 text-ink-500 hover:bg-surface-muted"
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 20 20"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M4 4l12 12M16 4L4 16" />
                    </svg>
                  </button>
                </div>
              </>
            )}
            <div className={isMobile ? "grid gap-3" : "contents"}>
            {/* Row: sport + view mode toggles */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="uk-mode" role="group" aria-label="Sport">
                <button
                  type="button"
                  aria-pressed={filters.sport === "trail"}
                  onClick={() => setFilter({ sport: "trail" })}
                >
                  Běh
                </button>
                <button
                  type="button"
                  aria-pressed={filters.sport === "skialp"}
                  onClick={() => setFilter({ sport: "skialp" })}
                >
                  Skialp
                </button>
              </div>
              <div className="uk-mode" role="group" aria-label="Rozsah">
                <button
                  type="button"
                  aria-pressed={filters.topOnly === true}
                  onClick={() => setFilter({ topOnly: true })}
                >
                  Top výběr
                </button>
                <button
                  type="button"
                  aria-pressed={filters.topOnly !== true}
                  onClick={() => setFilter({ topOnly: false })}
                >
                  Vše
                </button>
              </div>
              {user && (
                <button
                  type="button"
                  className="uk-chip"
                  aria-pressed={filters.favOnly ?? false}
                  onClick={() => setFilter({ favOnly: !filters.favOnly })}
                >
                  ★ Jen můj plán
                </button>
              )}
            </div>

            {/* Date range — nahrazuje month + year chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="uk-lbl">Období</span>
              <label className="flex items-center gap-1.5 text-[13.5px] text-ink-500">
                Od
                <input
                  type="date"
                  value={filters.from ?? ""}
                  onChange={(e) => setFilter({ from: e.target.value || undefined })}
                  className="rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[13.5px] text-ink-500">
                Do
                <input
                  type="date"
                  value={filters.to ?? ""}
                  onChange={(e) => setFilter({ to: e.target.value || undefined })}
                  className="rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-ink-900 focus-ring"
                />
              </label>
              {(filters.from || filters.to) && (
                <button
                  type="button"
                  onClick={() => setFilter({ from: undefined, to: undefined })}
                  className="text-[13px] text-brand underline underline-offset-2 hover:no-underline"
                >
                  Zrušit
                </button>
              )}
            </div>

            <ChipRow label="Oblast">
              {REGION_FILTERS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className="uk-chip"
                  aria-pressed={filters.region === r.value}
                  onClick={() =>
                    setFilter({
                      region: filters.region === r.value ? undefined : r.value,
                    })
                  }
                >
                  <span
                    className="uk-mk"
                    style={{ ["--c" as string]: r.color }}
                    aria-hidden
                  />
                  {r.label}
                </button>
              ))}
            </ChipRow>

            <ChipRow label="Délka">
              {LENGTH_PRESETS.map((preset) => {
                const active =
                  filters.minKm === preset.min && filters.maxKm === preset.max;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className="uk-chip"
                    aria-pressed={active}
                    onClick={() =>
                      setFilter({
                        minKm: active ? undefined : preset.min,
                        maxKm: active ? undefined : preset.max,
                      })
                    }
                  >
                    {preset.label} km
                  </button>
                );
              })}
            </ChipRow>

            <ChipRow label="Série">
              {SERIES_FILTERS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="uk-chip"
                  aria-pressed={filters.series === s.value}
                  onClick={() =>
                    setFilter({
                      series: filters.series === s.value ? undefined : s.value,
                    })
                  }
                >
                  {s.label}
                </button>
              ))}
            </ChipRow>

            <ChipRow label="Přihláška">
              {REG_FILTERS.map((r) => {
                const active = regFilter === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    className="uk-chip"
                    aria-pressed={active}
                    onClick={() => setRegFilter(active ? null : r.value)}
                  >
                    <span
                      className={`uk-rg uk-rg-${r.code}`}
                      style={{ marginBottom: 0 }}
                    >
                      {r.code}
                    </span>
                    {r.label}
                  </button>
                );
              })}
            </ChipRow>

            </div>
            {isMobile && (
              <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex items-center justify-between border-t border-border bg-canvas px-4 py-3">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[13.5px] font-medium text-brand underline-offset-2 hover:underline"
                >
                  Zrušit filtry
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md bg-ink-900 px-5 py-2.5 text-sm font-semibold text-canvas focus-ring"
                >
                  Zobrazit {sorted.length} závodů
                </button>
              </div>
            )}
          </section>
        )}

        {/* Active filters — quick removal chips. Zobrazí se jen když
            jsou aktivní filtry, každý chip má × pro individual removal. */}
        {activeFilterCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="uk-lbl" style={{ minWidth: 0 }}>
              Aktivní:
            </span>
            {filters.from && (
              <ActiveFilterChip
                label={`Od ${filters.from}`}
                onRemove={() => setFilter({ from: undefined })}
              />
            )}
            {filters.to && (
              <ActiveFilterChip
                label={`Do ${filters.to}`}
                onRemove={() => setFilter({ to: undefined })}
              />
            )}
            {filters.region && (
              <ActiveFilterChip
                label={REGION_LABEL_BY_CODE[filters.region] || filters.region}
                onRemove={() => setFilter({ region: undefined })}
              />
            )}
            {(filters.minKm || filters.maxKm) && (
              <ActiveFilterChip
                label={`${filters.minKm ?? "?"}+ km`}
                onRemove={() =>
                  setFilter({ minKm: undefined, maxKm: undefined })
                }
              />
            )}
            {filters.series && (
              <ActiveFilterChip
                label={SERIES_FILTERS.find((s) => s.value === filters.series)?.label || filters.series}
                onRemove={() => setFilter({ series: undefined })}
              />
            )}
            {regFilter && (
              <ActiveFilterChip
                label={REG_LABEL[regFilter]}
                onRemove={() => setRegFilter(null)}
              />
            )}
            {filters.favOnly && (
              <ActiveFilterChip
                label="★ Můj plán"
                onRemove={() => setFilter({ favOnly: false })}
              />
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-[12.5px] text-brand underline underline-offset-2 hover:no-underline"
            >
              zrušit vše
            </button>
          </div>
        )}

        {/* Meta bar */}
        <div className="mt-3 mb-2 flex items-center justify-between text-[13.5px] text-ink-500">
          <span>
            {loading
              ? "Načítám…"
              : error
                ? "Chyba"
                : `Zobrazeno ${sorted.length} závodů`}
          </span>
        </div>

        {/* CONTENT */}
        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger-soft/40 p-4 text-sm text-danger">
            {error}
          </div>
        ) : loading ? (
          // Skeleton loader — 5 placeholder karet, mírně pulzují.
          // Lepší UX než spinner (uživatel vidí očekávaný layout,
          // ne prázdnou obrazovku).
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} isMobile={isMobile} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          // Empty state — friendly hero + CTA, ne strohá jedna věta.
          <div className="rounded-md border border-dashed border-border bg-surface/60 p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">
              <svg
                aria-hidden
                viewBox="0 0 48 48"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-ink-300"
              >
                {/* Mountain silhouette */}
                <path d="M4 40 L18 20 L28 32 L34 24 L44 40 Z" />
                <circle cx="34" cy="12" r="3" />
              </svg>
            </div>
            <p className="text-base font-medium text-ink-900">
              Žádný závod nesplňuje filtry
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13.5px] text-ink-500">
              Zkus rozšířit datum nebo region, případně{" "}
              <button
                type="button"
                onClick={clearFilters}
                className="font-medium text-brand underline underline-offset-2 hover:no-underline"
              >
                zruš filtry
              </button>{" "}
              a projdi celý kalendář.
            </p>
          </div>
        ) : isMobile ? (
          // Mobile: dedikované karty (žádný table transformation hack)
          <div className="flex flex-col gap-3">
            {sorted.map((r) => (
              <MobileRaceCard
                key={r.id}
                race={r}
                onFavorite={() => toggleFavorite(r)}
                onSetStatus={(s) => setStatus(r, s)}
                onSaveNote={(note) => saveNote(r, note)}
                maxSteep={maxSteep}
              />
            ))}
          </div>
        ) : (
          // Desktop table s star sloupcem NA KONCI
          <div className="uk-tblwrap overflow-x-auto rounded-md border border-border bg-surface">
            <table className="uk-tbl">
              <thead>
                <tr>
                  <ThSortable
                    label="Závod"
                    sortKey="name"
                    current={sort}
                    onToggle={toggleSort}
                  />
                  <th>Země</th>
                  <ThSortable
                    label="Termín"
                    sortKey="date"
                    current={sort}
                    onToggle={toggleSort}
                  />
                  <th>Přihláška</th>
                  <th>Tratě (km)</th>
                  <ThSortable
                    label="Hlavní"
                    sortKey="distance"
                    current={sort}
                    onToggle={toggleSort}
                    className="uk-num"
                  />
                  <ThSortable
                    label="D+"
                    sortKey="elevation"
                    current={sort}
                    onToggle={toggleSort}
                    className="uk-num"
                  />
                  <ThSortable
                    label="m/km"
                    sortKey="steep"
                    current={sort}
                    onToggle={toggleSort}
                    className="uk-num"
                  />
                  <th>Série</th>
                  <th style={{ width: 40, textAlign: "center" }}>Plán</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <DesktopRaceRow
                    key={r.id}
                    race={r}
                    onFavorite={() => toggleFavorite(r)}
                    onSetStatus={(s) => setStatus(r, s)}
                    maxSteep={maxSteep}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className="font-condensed font-bold text-ink-900 tabular-nums"
        style={{ fontSize: "clamp(26px, 3vw, 34px)", lineHeight: 1 }}
      >
        {value}
      </span>
      <span className="mono-tag text-ink-500">{label}</span>
    </div>
  );
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="uk-lbl">{label}</span>
      {children}
    </div>
  );
}

/**
 * Status picker menu — klik na status pill otevře popover s 5 status
 * volbami + „Odebrat z plánu". Click-outside a Esc zavírá.
 * Compact varianta pro desktop table cell (kde je málo místa).
 */
function StatusPickerMenu({
  current,
  onChoose,
  compact,
}: {
  current: RacePlanStatus;
  onChoose: (s: RacePlanStatus) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const options: RacePlanStatus[] = [
    "interested",
    "waiting_registration",
    "registered",
    "waitlist",
    "completed",
  ];

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Můj status: ${PLAN_STATUS_LABEL[current]}. Klikni pro změnu.`}
        className={`inline-flex items-center gap-1 rounded-sm font-semibold uppercase tracking-wider transition-opacity hover:opacity-80 focus-ring ${
          compact
            ? "px-1.5 py-0.5 text-[9px]"
            : "px-2 py-0.5 text-[11px]"
        } ${PLAN_STATUS_TONE[current]}`}
      >
        {PLAN_STATUS_LABEL[current]}
        <span aria-hidden className="text-[8px]">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-md border border-border bg-canvas shadow-lg"
        >
          {options.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                onChoose(s);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-muted ${
                s === current ? "bg-surface-muted" : ""
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                  PLAN_STATUS_TONE[s].split(" ")[0]
                }`}
                style={{
                  background:
                    s === "interested"
                      ? "var(--ink-300)"
                      : s === "waiting_registration"
                        ? "var(--warning)"
                        : s === "registered"
                          ? "var(--success)"
                          : s === "waitlist"
                            ? "var(--brand)"
                            : "var(--ink-900)",
                }}
              />
              <span
                className={
                  s === current ? "font-semibold text-ink-900" : "text-ink-700"
                }
              >
                {PLAN_STATUS_LABEL[s]}
              </span>
              {s === current && (
                <span aria-hidden className="ml-auto text-xs text-brand">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Active filter chip s × removal — jasně signalizuje, co uživatel
 * aktuálně filtruje, a nabízí jedním klikem removal každého jednoho.
 */
function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-ink-900 bg-ink-900 px-2.5 py-0.5 text-[12.5px] text-canvas transition-opacity hover:opacity-80 focus-ring"
      aria-label={`Odebrat filter: ${label}`}
    >
      <span>{label}</span>
      <span aria-hidden className="text-[13px] leading-none">
        ×
      </span>
    </button>
  );
}

/**
 * Skeleton card — animated placeholder během loadu. Napodobuje layout
 * reálné karty (header + stats grid), aby uživatel neviděl empty
 * flash.
 */
function SkeletonCard({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      className={`animate-pulse rounded-md border border-border bg-surface p-4 ${
        isMobile ? "" : "grid grid-cols-[1fr_auto_auto] gap-4"
      }`}
      aria-hidden
    >
      <div className={isMobile ? "" : "min-w-0"}>
        <div className="flex items-start gap-2">
          <span className="h-4 w-5 shrink-0 rounded-sm bg-border" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-border" />
            <div className="h-3 w-1/2 rounded bg-border" />
          </div>
        </div>
        <div className="mt-3 h-3 w-full rounded bg-border" />
        {isMobile && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="h-8 rounded bg-border" />
            <div className="h-8 rounded bg-border" />
            <div className="h-8 rounded bg-border" />
          </div>
        )}
      </div>
      {!isMobile && (
        <>
          <div className="h-4 w-16 rounded bg-border" />
          <div className="h-4 w-8 rounded bg-border" />
        </>
      )}
    </div>
  );
}

function ThSortable({
  label,
  sortKey,
  current,
  onToggle,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onToggle: (k: SortKey) => void;
  className?: string;
}) {
  const active = current.key === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        data-dir={active ? current.dir : undefined}
      >
        {label}
      </button>
    </th>
  );
}

function DesktopRaceRow({
  race,
  onFavorite,
  onSetStatus,
  maxSteep,
}: {
  race: Race;
  onFavorite: () => void;
  onSetStatus: (s: RacePlanStatus) => void;
  maxSteep: number;
}) {
  const steep = race.elevation_per_km ?? 0;
  const steepPct = maxSteep > 0 ? Math.min(100, (steep / maxSteep) * 100) : 0;
  const regionColor = REGION_COLOR_BY_CODE[race.region] || "#15231d";
  const regionLabel = REGION_LABEL_BY_CODE[race.region] || "";
  const regCode = REG_CODE[race.registration_status];
  return (
    <tr>
      <td className="uk-c-name">
        <div className="uk-name">
          <span
            className="uk-mk"
            style={{ ["--c" as string]: regionColor }}
            title={regionLabel}
            aria-hidden
          />
          {race.url ? (
            <a href={race.url} target="_blank" rel="noreferrer">
              {race.name}
            </a>
          ) : (
            <span>{race.name}</span>
          )}
          {race.is_top && <span className="uk-topb">TOP</span>}
        </div>
        {race.highlight && <div className="uk-hl">{race.highlight}</div>}
        {race.has_warning && (
          <span className="mt-1 inline-block rounded-sm bg-warning/10 px-1.5 py-0.5 text-[12px] font-medium text-warning">
            termín nejistý
          </span>
        )}
      </td>
      <td>
        <div>{race.country}</div>
        {(race.location || race.terrain) && (
          <div className="uk-place">
            {[race.location, race.terrain].filter(Boolean).join(" · ")}
          </div>
        )}
      </td>
      <td>
        <div className="uk-d27">
          {race.next_label || race.date_display || formatDateCompact(race.date_start)}
        </div>
        <div className="uk-d26">{race.next_year}</div>
      </td>
      <td className="uk-entry">
        <span className={`uk-rg uk-rg-${regCode}`}>
          {REG_LABEL[race.registration_status]}
        </span>
        {race.registration_detail && (
          <div className="mt-1 leading-snug">{race.registration_detail}</div>
        )}
      </td>
      <td className="uk-dist">
        {race.distances_note || race.distance_km}
      </td>
      <td className="uk-num">
        <span className="uk-big">{race.distance_km.toLocaleString("cs-CZ")}</span>
      </td>
      <td className="uk-num">
        <span className="uk-big">
          {race.elevation_m
            ? race.elevation_m.toLocaleString("cs-CZ")
            : "–"}
        </span>
      </td>
      <td className="uk-num">
        <div className="uk-steep">
          <span className="uk-bar">
            <i style={{ width: `${steepPct}%` }} />
          </span>
          <span>{race.elevation_per_km ? Math.round(race.elevation_per_km) : "–"}</span>
        </div>
      </td>
      <td>
        <span className={SERIES_TAG_CLASS[race.series]}>
          {seriesLabel(race.series)}
        </span>
      </td>
      <td style={{ textAlign: "center" }}>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            className="uk-star"
            aria-pressed={race.is_favorite}
            aria-label={
              race.is_favorite ? "Odebrat z plánu" : "Přidat do plánu"
            }
            onClick={onFavorite}
          >
            ★
          </button>
          {race.plan_status && (
            <StatusPickerMenu
              current={race.plan_status}
              onChoose={onSetStatus}
              compact
            />
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * Mobile card — nový layout od nuly, ne CSS table row transformation.
 * Star button je fixní top-right pro touch prsty (40 × 40), zbytek
 * karty se čte přirozeně shora dolů.
 */
function MobileRaceCard({
  race,
  onFavorite,
  onSetStatus,
  onSaveNote,
  maxSteep,
}: {
  race: Race;
  onFavorite: () => void;
  onSetStatus: (s: RacePlanStatus) => void;
  onSaveNote: (note: string) => Promise<void>;
  maxSteep: number;
}) {
  const steep = race.elevation_per_km ?? 0;
  const steepPct = maxSteep > 0 ? Math.min(100, (steep / maxSteep) * 100) : 0;
  const regionColor = REGION_COLOR_BY_CODE[race.region] || "#15231d";
  const regionLabel = REGION_LABEL_BY_CODE[race.region] || "";
  const regCode = REG_CODE[race.registration_status];
  // Border tint per plan_status — subtle visual scan hint. Bez statusu
  // = default border, s statusem = colored left border-l-4 podle status.
  const statusBorder = race.plan_status
    ? {
        interested: "border-l-4 border-l-ink-300",
        waiting_registration: "border-l-4 border-l-warning",
        registered: "border-l-4 border-l-success",
        waitlist: "border-l-4 border-l-brand",
        completed: "border-l-4 border-l-ink-900",
      }[race.plan_status]
    : "";

  return (
    <article
      className={`relative rounded-md border border-border bg-surface p-4 ${statusBorder}`}
    >
      {/* Star — absolute top-right, touch-friendly 40×40 */}
      <button
        type="button"
        onClick={onFavorite}
        aria-pressed={race.is_favorite}
        aria-label={race.is_favorite ? "Odebrat z plánu" : "Přidat do plánu"}
        className="focus-ring absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-md text-2xl leading-none"
        style={{
          color: race.is_favorite ? "var(--brand)" : "var(--ink-300)",
        }}
      >
        {race.is_favorite ? "★" : "☆"}
      </button>

      {/* Header — region marker + name + TOP badge */}
      <div className="pr-12">
        <div className="flex items-start gap-2">
          <span
            className="uk-mk uk-big shrink-0"
            style={{ ["--c" as string]: regionColor }}
            title={regionLabel}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            {race.url ? (
              <a
                href={race.url}
                target="_blank"
                rel="noreferrer"
                className="text-[16px] font-semibold leading-tight text-ink-900 hover:text-brand hover:underline"
              >
                {race.name}
              </a>
            ) : (
              <h3 className="text-[16px] font-semibold leading-tight text-ink-900">
                {race.name}
              </h3>
            )}
            {race.is_top && (
              <span className="uk-topb inline-block" style={{ marginLeft: 0, marginTop: 4 }}>
                TOP
              </span>
            )}
          </div>
        </div>
      </div>

      {race.highlight && (
        <p className="mt-2 line-clamp-2 text-[13.5px] leading-snug text-ink-500">
          {race.highlight}
        </p>
      )}
      {race.has_warning && (
        <p className="mt-2 inline-block rounded-sm bg-warning/10 px-1.5 py-0.5 text-[12px] font-medium text-warning">
          termín nejistý
        </p>
      )}

      {/* Date — big condensed. TBA má vlastní pill místo raw „?". */}
      <div className="mt-3 flex items-baseline gap-2">
        {race.next_label === "?" || race.next_label === "" ? (
          <span className="inline-flex items-center rounded-sm bg-surface-muted px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wider text-ink-500">
            Datum TBA
          </span>
        ) : (
          <span
            className="font-condensed font-bold tracking-tight text-ink-900"
            style={{ fontSize: "22px", lineHeight: 1 }}
          >
            {race.next_label || race.date_display || formatDateCompact(race.date_start)}
          </span>
        )}
        <span className="text-[13px] tabular-nums text-ink-500">
          {race.next_year}
        </span>
      </div>

      {/* Stats row — km / D+ / m/km */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <StatCell label="km" value={race.distance_km.toLocaleString("cs-CZ")} />
        <StatCell
          label="D+ (m)"
          value={
            race.elevation_m ? race.elevation_m.toLocaleString("cs-CZ") : "–"
          }
        />
        <div>
          <div className="uk-lbl mb-1" style={{ minWidth: 0 }}>
            m/km
          </div>
          <div className="flex items-center gap-2">
            <span
              className="font-condensed text-[20px] font-semibold tabular-nums text-ink-900"
              style={{ lineHeight: 1 }}
            >
              {race.elevation_per_km ? Math.round(race.elevation_per_km) : "–"}
            </span>
            {race.elevation_per_km && (
              <span className="uk-bar" style={{ width: 40 }}>
                <i style={{ width: `${steepPct}%` }} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Location / terrain */}
      {(race.country || race.location || race.terrain) && (
        <p className="mt-3 text-[13px] text-ink-500">
          {[race.location, race.country, race.terrain].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Distances_note */}
      {race.distances_note && (
        <p className="mt-1 text-[12.5px] leading-snug text-ink-500">
          {race.distances_note}
        </p>
      )}

      {/* Registration pill + detail + series + user's plan status */}
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <span className={`uk-rg uk-rg-${regCode}`}>
          {REG_LABEL[race.registration_status]}
        </span>
        <span className={SERIES_TAG_CLASS[race.series]}>
          {seriesLabel(race.series)}
        </span>
        {race.plan_status && (
          <StatusPickerMenu
            current={race.plan_status}
            onChoose={onSetStatus}
          />
        )}
      </div>
      {race.registration_detail && (
        <p className="mt-2 text-[12.5px] leading-snug text-ink-500">
          {race.registration_detail}
        </p>
      )}
      {race.plan_status && (
        <NoteEditor initial={race.plan_note} onSave={onSaveNote} />
      )}
    </article>
  );
}

/**
 * Inline note editor pro race v plánu — collapsed default zobrazí
 * note text (nebo „+ Poznámka" pokud prázdný). Klik ho rozvine jako
 * textarea s Uložit/Zrušit. Local state se seedne z `initial` prop,
 * po uložení se collapsne zpět. Race payload nese `plan_note` z
 * backendu, takže po refreshi je note viditelný.
 */
function NoteEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    try {
      await onSave(value.trim());
      setSaved(value.trim());
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return saved ? (
      <div className="mt-2 flex items-start justify-between gap-2 rounded-sm border-l-2 border-brand bg-brand/5 px-2 py-1">
        <p className="text-[13px] text-ink-700">{saved}</p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="shrink-0 text-[11px] font-medium text-brand hover:underline"
          aria-label="Upravit poznámku"
        >
          ✎
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-2 text-[12px] font-medium text-brand hover:underline"
      >
        + Poznámka
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-sm border border-border bg-surface-muted p-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Např. jedu s Martou, letenka koupená…"
        rows={2}
        maxLength={280}
        autoFocus
        className="w-full resize-none bg-transparent text-[13px] text-ink-900 placeholder:text-ink-500 focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-ink-500">
          {value.length}/280
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              setValue(saved);
            }}
            className="text-[12px] text-ink-500 hover:text-ink-900"
            disabled={saving}
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={saving}
            className="rounded-sm bg-ink-900 px-3 py-1 text-[12px] font-semibold text-canvas disabled:opacity-50"
          >
            {saving ? "…" : "Uložit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uk-lbl mb-1" style={{ minWidth: 0 }}>
        {label}
      </div>
      <div
        className="font-condensed text-[20px] font-semibold tabular-nums text-ink-900"
        style={{ lineHeight: 1 }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDateCompact(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "long" });
}

function seriesLabel(s: Race["series"]): string {
  return (
    {
      utmb: "UTMB",
      wtm: "WTM",
      sky: "Sky",
      major: "Major",
      indep: "Nezávislý",
    } satisfies Record<Race["series"], string>
  )[s];
}
