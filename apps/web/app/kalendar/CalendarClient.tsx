"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ApiError, auth, type User } from "@/lib/api";
import {
  formatRaceDate,
  races,
  REGION_LABEL,
  REGISTRATION_LABEL,
  SERIES_LABEL,
  type Race,
  type RaceFilters,
  type RaceRegion,
  type RaceSeries,
} from "@/lib/races";

/**
 * Ultra kalendář client — inspirace `/Users/hulin/Desktop/Ultra kalendář
 * 2027.html`. Filter panel, sortable table na desktop, card stack na
 * mobilu, ★ favorite toggle pro logged-in.
 *
 * Klíčové design decisions:
 * - Font-condensed (Barlow Condensed) na H1 / table headery / statistiky
 * - Chip pills `rounded-full`, měsíce/roky compact 40 px min-width
 * - Sortable table headers s `↕/↑/↓` indikátory
 * - Registration status color badges (V=success, L=danger, S=warning,
 *   Q=neutral, K=muted)
 * - Steepness mini bar next to elevation (m/km)
 * - Stats bar portalovaný do `#kalendar-stats` v hero, aby SSR page
 *   drží layout a client dopočítá počty závodů/zemí/km ze stažených dat
 */

type SortKey = "date" | "distance" | "elevation" | "steep" | "name";
type SortDir = "asc" | "desc";

const MONTHS_CS = [
  "led",
  "úno",
  "bře",
  "dub",
  "kvě",
  "čvn",
  "čvc",
  "srp",
  "zář",
  "říj",
  "lis",
  "pro",
];

const SERIES_FILTERS: { value: RaceSeries; label: string }[] = [
  { value: "utmb", label: "UTMB" },
  { value: "wtm", label: "WTM" },
  { value: "sky", label: "Sky" },
  { value: "major", label: "Major" },
  { value: "indep", label: "Nezávislý" },
];

const REGION_FILTERS: { value: RaceRegion; label: string }[] = (
  Object.keys(REGION_LABEL) as RaceRegion[]
).map((k) => ({ value: k, label: REGION_LABEL[k] }));

// Length presets — chip row v filter panelu
const LENGTH_PRESETS = [
  { label: "40+", min: 40, max: undefined },
  { label: "80+", min: 80, max: undefined },
  { label: "100+", min: 100, max: undefined },
  { label: "150+", min: 150, max: undefined },
  { label: "300+", min: 300, max: undefined },
];

export function CalendarClient() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RaceFilters>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "date",
    dir: "asc",
  });
  const [statsMount, setStatsMount] = useState<HTMLElement | null>(null);

  // Load auth state — no throw if anon.
  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // Locate portal target — hero.
  useEffect(() => {
    setStatsMount(document.getElementById("kalendar-stats"));
  }, []);

  // Fetch races on filter change.
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

  // Sort klientsky (backend řadí per default podle date_start).
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
    return [...items].sort(cmp);
  }, [items, sort]);

  // Odvození ročníků z aktuálních dat — chip row pro year filter.
  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of items) {
      const y = Number(r.date_start.slice(0, 4));
      if (Number.isFinite(y)) s.add(y);
    }
    return [...s].sort();
  }, [items]);

  // Stats — počítáno z aktuálně načtených závodů (respektuje filter).
  const stats = useMemo(() => {
    const total = items.length;
    const countries = new Set(
      items.map((r) => (r.country || "").trim()).filter(Boolean),
    );
    const trail = items.filter((r) => r.sport === "trail").length;
    const skialp = items.filter((r) => r.sport === "skialp").length;
    const distances = items
      .map((r) => r.distance_km || 0)
      .filter((n) => n > 0);
    const maxKm = distances.length ? Math.max(...distances) : 0;
    return { total, countries: countries.size, trail, skialp, maxKm };
  }, [items]);

  const setFilter = (patch: Partial<RaceFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };
  const clearFilters = () => setFilters({});

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
      prev.map((r) => (r.id === race.id ? { ...r, is_favorite: nextOn } : r)),
    );
    try {
      await races.favorite(race.slug, nextOn);
    } catch {
      setItems((prev) =>
        prev.map((r) =>
          r.id === race.id ? { ...r, is_favorite: !nextOn } : r,
        ),
      );
    }
  };

  return (
    <>
      {statsMount &&
        createPortal(
          <>
            <StatBlock label="Závodů" value={stats.total} />
            <StatBlock label="Zemí" value={stats.countries} />
            <StatBlock label="Běh" value={stats.trail} />
            <StatBlock label="Skialp" value={stats.skialp} />
          </>,
          statsMount,
        )}

      <section className="mx-auto w-full max-w-[1320px] px-4 pb-16">
        {/* FILTER PANEL — Ultra kalendář-style card */}
        <div className="rounded-md border border-border bg-surface p-4">
          {/* Row 1: search + sort dropdown + sport toggle + fav */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Hledat závod, zemi, pohoří (např. Beskydy, Alpy)…"
              value={filters.q ?? ""}
              onChange={(e) => setFilter({ q: e.target.value })}
              className="min-w-[240px] flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus-ring"
              aria-label="Hledat"
            />
            <select
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [
                  SortKey,
                  SortDir,
                ];
                setSort({ key, dir });
              }}
              className="rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-900 focus-ring"
              aria-label="Řazení"
            >
              <option value="date:asc">Řadit: podle termínu</option>
              <option value="distance:desc">Nejdelší</option>
              <option value="elevation:desc">Největší převýšení</option>
              <option value="steep:desc">Nejstrmější (m/km)</option>
              <option value="name:asc">Abecedně</option>
            </select>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {[
                { value: undefined, label: "Vše" },
                { value: "trail" as const, label: "Běh" },
                { value: "skialp" as const, label: "Skialp" },
              ].map((opt) => {
                const active = filters.sport === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setFilter({ sport: opt.value })}
                    aria-pressed={active}
                    className={`px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                      active
                        ? "bg-ink-900 text-canvas"
                        : "bg-canvas text-ink-700 hover:bg-surface-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {user && (
              <button
                type="button"
                onClick={() => setFilter({ favOnly: !filters.favOnly })}
                aria-pressed={filters.favOnly ?? false}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                  filters.favOnly
                    ? "border-ink-900 bg-ink-900 text-canvas"
                    : "border-border bg-canvas text-ink-700 hover:bg-surface-muted"
                }`}
              >
                ★ Moje
              </button>
            )}
          </div>

          {/* Chip rows */}
          <div className="mt-4 flex flex-col gap-3">
            {availableYears.length > 1 && (
              <ChipRow label="Rok">
                {availableYears.map((y) => {
                  const active = filters.year === y;
                  return (
                    <ChipCompact
                      key={y}
                      active={active}
                      onClick={() =>
                        setFilter({ year: active ? undefined : y })
                      }
                    >
                      {y}
                    </ChipCompact>
                  );
                })}
              </ChipRow>
            )}
            <ChipRow label="Region">
              {REGION_FILTERS.map((r) => {
                const active = filters.region === r.value;
                return (
                  <Chip
                    key={r.value}
                    active={active}
                    onClick={() =>
                      setFilter({ region: active ? undefined : r.value })
                    }
                  >
                    {r.label}
                  </Chip>
                );
              })}
            </ChipRow>
            <ChipRow label="Měsíc">
              {MONTHS_CS.map((m, i) => {
                // Použije aktuální (nebo první dostupný) rok jako klíč.
                const year = filters.year ?? availableYears[0] ?? 2027;
                const key = `${year}-${String(i + 1).padStart(2, "0")}`;
                const active = filters.month === key;
                return (
                  <ChipCompact
                    key={m}
                    active={active}
                    onClick={() =>
                      setFilter({ month: active ? undefined : key })
                    }
                  >
                    {m}
                  </ChipCompact>
                );
              })}
            </ChipRow>
            <ChipRow label="Délka">
              {LENGTH_PRESETS.map((preset) => {
                const active =
                  filters.minKm === preset.min &&
                  filters.maxKm === preset.max;
                return (
                  <Chip
                    key={preset.label}
                    active={active}
                    onClick={() =>
                      setFilter({
                        minKm: active ? undefined : preset.min,
                        maxKm: active ? undefined : preset.max,
                      })
                    }
                  >
                    {preset.label} km
                  </Chip>
                );
              })}
            </ChipRow>
            <ChipRow label="Série">
              {SERIES_FILTERS.map((s) => {
                const active = filters.series === s.value;
                return (
                  <Chip
                    key={s.value}
                    active={active}
                    onClick={() =>
                      setFilter({ series: active ? undefined : s.value })
                    }
                  >
                    {s.label}
                  </Chip>
                );
              })}
            </ChipRow>
          </div>
        </div>

        {/* META bar — count + clear */}
        <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
          <span>
            {loading
              ? "Načítám…"
              : error
                ? "Chyba"
                : `${sorted.length} závodů`}
          </span>
          {Object.keys(filters).length > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-brand hover:underline"
            >
              Zrušit filtry
            </button>
          )}
        </div>

        {/* CONTENT */}
        {error ? (
          <div className="mt-6 rounded-md border border-danger/40 bg-danger-soft/40 p-4 text-sm text-danger">
            {error}
          </div>
        ) : loading ? (
          <div className="mt-8 flex justify-center py-10">
            <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="mt-8 rounded-md border border-dashed border-border p-10 text-center text-sm text-ink-500">
            Žádný závod nesplňuje filtr. Zkus je zrušit nebo změnit rozsah.
          </div>
        ) : (
          <>
            {/* Desktop table (hidden < md) */}
            <div className="mt-6 hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr>
                    <SortableTh
                      label="Závod"
                      sortKey="name"
                      current={sort}
                      onToggle={toggleSort}
                    />
                    <SortableTh
                      label="Délka"
                      sortKey="distance"
                      current={sort}
                      onToggle={toggleSort}
                      align="right"
                    />
                    <SortableTh
                      label="Převýšení"
                      sortKey="elevation"
                      current={sort}
                      onToggle={toggleSort}
                      align="right"
                    />
                    <SortableTh
                      label="m/km"
                      sortKey="steep"
                      current={sort}
                      onToggle={toggleSort}
                      align="right"
                    />
                    <SortableTh
                      label="Termín"
                      sortKey="date"
                      current={sort}
                      onToggle={toggleSort}
                    />
                    <TableHead>Série</TableHead>
                    <TableHead>Přihláška</TableHead>
                    <TableHead align="center">★</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <RaceRow
                      key={r.id}
                      race={r}
                      onFavorite={() => toggleFavorite(r)}
                      isLoggedIn={!!user}
                      maxSteep={
                        Math.max(
                          ...items.map((x) => x.elevation_per_km ?? 0),
                        ) || 1
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mt-6 flex flex-col gap-3 md:hidden">
              {sorted.map((r) => (
                <RaceCard
                  key={r.id}
                  race={r}
                  onFavorite={() => toggleFavorite(r)}
                  isLoggedIn={!!user}
                />
              ))}
            </div>
          </>
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
        style={{ fontSize: "clamp(28px, 3vw, 36px)", lineHeight: 1 }}
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
      <span className="mono-tag min-w-[70px] shrink-0 text-ink-500">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? false}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] leading-tight transition-colors focus-ring ${
        active
          ? "border-ink-900 bg-ink-900 text-canvas"
          : "border-border bg-canvas text-ink-900 hover:border-ink-500"
      }`}
    >
      {children}
    </button>
  );
}

function ChipCompact({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? false}
      className={`inline-flex min-w-[44px] items-center justify-center rounded-md border px-2 py-1 text-[13px] leading-tight tabular-nums transition-colors focus-ring ${
        active
          ? "border-ink-900 bg-ink-900 text-canvas"
          : "border-border bg-canvas text-ink-900 hover:border-ink-500"
      }`}
    >
      {children}
    </button>
  );
}

function TableHead({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="mono-tag border-b-2 border-ink-900 bg-surface px-3 py-2.5 text-ink-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function SortableTh({
  label,
  sortKey,
  current,
  onToggle,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onToggle: (k: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = current.key === sortKey;
  const arrow = !isActive ? "↕" : current.dir === "asc" ? "↑" : "↓";
  return (
    <th
      className="border-b-2 border-ink-900 bg-surface px-3 py-2.5"
      style={{ textAlign: align }}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`mono-tag inline-flex items-center gap-1 focus-ring ${
          isActive ? "text-ink-900" : "text-ink-500 hover:text-ink-900"
        }`}
      >
        {label}
        <span
          className={isActive ? "text-brand" : "text-ink-300"}
          aria-hidden
        >
          {arrow}
        </span>
      </button>
    </th>
  );
}

function RaceRow({
  race,
  onFavorite,
  isLoggedIn,
  maxSteep,
}: {
  race: Race;
  onFavorite: () => void;
  isLoggedIn: boolean;
  maxSteep: number;
}) {
  const steep = race.elevation_per_km ?? 0;
  const steepPct = maxSteep > 0 ? Math.min(100, (steep / maxSteep) * 100) : 0;
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-muted">
      <td className="px-3 py-3 align-top">
        <div className="flex items-start gap-2">
          <RegistrationBadge status={race.registration_status} />
        </div>
        <div className="mt-1.5">
          {race.url ? (
            <a
              href={race.url}
              target="_blank"
              rel="noreferrer"
              className="text-[15px] font-semibold text-ink-900 hover:text-brand hover:underline"
            >
              {race.name}
            </a>
          ) : (
            <span className="text-[15px] font-semibold text-ink-900">
              {race.name}
            </span>
          )}
          {race.distances_note && (
            <p className="mt-1 text-[12.5px] text-ink-500">
              {race.distances_note}
            </p>
          )}
          {race.highlight && (
            <p className="mt-1 max-w-[52ch] text-[13px] leading-snug text-ink-500">
              {race.highlight}
            </p>
          )}
          {(race.location || race.country) && (
            <p className="mt-0.5 text-[12px] text-ink-300">
              {[race.location, race.country].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">
        <span className="font-condensed text-xl font-semibold text-ink-900">
          {race.distance_km}
        </span>
        <span className="ml-1 text-[11px] text-ink-500">km</span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">
        {race.elevation_m ? (
          <span className="text-[14px] font-medium text-ink-900">
            {race.elevation_m.toLocaleString("cs-CZ")}
            <span className="ml-1 text-[11px] text-ink-500">m</span>
          </span>
        ) : (
          <span className="text-[12px] text-ink-300">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top">
        {race.elevation_per_km ? (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-11 shrink-0 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-ink-900"
                style={{ width: `${steepPct}%` }}
                aria-hidden
              />
            </div>
            <span className="w-8 text-right text-[12px] tabular-nums text-ink-700">
              {Math.round(race.elevation_per_km)}
            </span>
          </div>
        ) : (
          <span className="block text-right text-[12px] text-ink-300">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top text-[13px] text-ink-700">
        {race.date_display || formatRaceDate(race.date_start, race.date_end)}
      </td>
      <td className="px-3 py-3 align-top">
        <SeriesBadge series={race.series} />
      </td>
      <td className="px-3 py-3 align-top text-[12px] text-ink-500">
        {REGISTRATION_LABEL[race.registration_status]}
      </td>
      <td className="px-3 py-3 text-center align-top">
        <FavoriteButton
          isFavorite={race.is_favorite}
          isLoggedIn={isLoggedIn}
          onClick={onFavorite}
        />
      </td>
    </tr>
  );
}

function RaceCard({
  race,
  onFavorite,
  isLoggedIn,
}: {
  race: Race;
  onFavorite: () => void;
  isLoggedIn: boolean;
}) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RegistrationBadge status={race.registration_status} />
            <SeriesBadge series={race.series} />
          </div>
          {race.url ? (
            <a
              href={race.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-lg font-semibold text-ink-900 hover:text-brand hover:underline"
            >
              {race.name}
            </a>
          ) : (
            <h3 className="mt-2 text-lg font-semibold text-ink-900">
              {race.name}
            </h3>
          )}
          {(race.location || race.country) && (
            <p className="mt-0.5 text-[13px] text-ink-500">
              {[race.location, race.country].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <FavoriteButton
          isFavorite={race.is_favorite}
          isLoggedIn={isLoggedIn}
          onClick={onFavorite}
        />
      </div>
      {race.distances_note && (
        <p className="mt-2 text-[13px] text-ink-500">{race.distances_note}</p>
      )}
      {race.highlight && (
        <p className="mt-2 text-[13px] leading-snug text-ink-700">
          {race.highlight}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="mono-tag text-ink-500">Délka</dt>
          <dd className="font-condensed mt-0.5 text-xl font-semibold text-ink-900 tabular-nums">
            {race.distance_km}
            <span className="ml-0.5 text-[10px] font-normal text-ink-500">
              km
            </span>
          </dd>
        </div>
        <div>
          <dt className="mono-tag text-ink-500">Převýšení</dt>
          <dd className="font-condensed mt-0.5 text-xl font-semibold text-ink-900 tabular-nums">
            {race.elevation_m
              ? `${race.elevation_m.toLocaleString("cs-CZ")}`
              : "—"}
            {race.elevation_m && (
              <span className="ml-0.5 text-[10px] font-normal text-ink-500">
                m
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="mono-tag text-ink-500">Termín</dt>
          <dd className="mt-0.5 text-[13px] font-medium text-ink-900">
            {race.date_display || formatRaceDate(race.date_start, race.date_end)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function RegistrationBadge({ status }: { status: Race["registration_status"] }) {
  const label = REGISTRATION_LABEL[status];
  const tone = {
    open: "border-success/40 bg-success/5 text-success",
    lottery: "border-danger/40 bg-danger-soft/40 text-danger",
    sold_out: "border-warning/40 bg-warning/5 text-warning",
    qualifier: "border-ink-300 bg-surface-muted text-ink-700",
    closed: "border-ink-900 bg-ink-900 text-canvas",
  }[status];
  return (
    <span
      className={`mono-tag inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] ${tone}`}
    >
      {label}
    </span>
  );
}

function SeriesBadge({ series }: { series: Race["series"] }) {
  if (series === "indep") return null;
  const label = SERIES_LABEL[series];
  const tone = {
    utmb: "border-ink-900 text-ink-900",
    wtm: "border-brand text-ink-900 bg-brand-soft/40",
    sky: "border-ink-500 text-ink-700",
    major: "border-ink-900 bg-ink-900 text-canvas",
    indep: "",
  }[series];
  return (
    <span
      className={`mono-tag inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function FavoriteButton({
  isFavorite,
  isLoggedIn,
  onClick,
}: {
  isFavorite: boolean;
  isLoggedIn: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        isFavorite
          ? "Odebrat z oblíbených"
          : isLoggedIn
            ? "Přidat do oblíbených"
            : "Přihlas se pro oblíbené"
      }
      aria-pressed={isFavorite}
      className="focus-ring rounded-sm p-1 text-2xl leading-none transition-colors"
      style={{
        color: isFavorite ? "var(--brand)" : "var(--ink-300)",
      }}
    >
      {isFavorite ? "★" : "☆"}
    </button>
  );
}
